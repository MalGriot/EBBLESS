// POST /vibe-picture (#744 part 2): a photo or movie still becomes a vibe.
//
// The app downsizes the picture to about 512 px and sends it as the raw body
// (image/jpeg, image/png or image/webp). Here it is checked (size, type,
// magic bytes), shown ONCE to a Workers AI vision model that answers with one
// or two plain sentences about its feel (light, colour, setting, emotion),
// and then thrown away: the bytes are never written to KV, R2, the cache or
// any log, and exist only in this request's memory. The sentence then goes
// through the EXISTING /vibe-interpret pipeline, so the answer has the same
// shape the client already knows how to play, plus picture.description.
//
// Cost control (anonymous route that spends the shared free Workers AI
// allowance, 10,000 neurons a day): a per-IP throttle, a 1 MB hard cap and an
// account-wide daily neuron ceiling of its own (VoiceQuota instance
// "p:<UTC date>", see PICTURE_DAILY_NEURON_LIMIT). It fails closed: if the
// counter cannot be read, the model is not called.
//
// Pure helpers live here with no Workers APIs so test/vibe-picture.test.mjs
// runs them under node.

export const PICTURE_MAX_BYTES = 1024 * 1024;          // hard cap on the upload (the app sends ~50-150 KB)
export const PICTURE_MIN_BYTES = 64;                   // anything smaller cannot be a picture
export const PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// Llama 3.2 11B Vision (Cloudflare Workers AI). LLaVA 1.5 is cheaper but is
// scheduled for deprecation on 2026-11-20. Needs the one-time Meta licence
// acceptance on the Cloudflare account (see README, "Picture vibes").
export const PICTURE_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
export const PICTURE_AI_TIMEOUT_MS = 20000;
export const PICTURE_MAX_TOKENS = 100;
export const PICTURE_MAX_DESCRIPTION = 240;
// Budget. Estimated per picture, from Cloudflare's published pricing as
// remembered when this was written (re-check on the Workers AI pricing page):
//   vision model: 4,410 neurons per M input tokens, 61,493 per M output tokens.
//   A 512 px picture is roughly 1,600 to 6,400 image tokens plus about 120 of
//   prompt: 7 to 28 neurons in. At most 100 tokens out: 6 neurons. So 13 to 34.
//   Then /vibe-interpret's text model reads the sentence: 25 neurons at worst
//   (voice.js VOICE_NEURONS_PER_CALL has the arithmetic), usually cached or less.
//   Worst case about 60, typical about 25. Each picture is charged 50.
export const PICTURE_NEURONS_PER_CALL = 50;
export const PICTURE_DAILY_NEURON_LIMIT = 2500;        // 25% of the free 10,000: 50 pictures a day; voice keeps 40%
export const PICTURE_IP_LIMIT = 10;                    // pictures per IP ...
export const PICTURE_IP_WINDOW_S = 3600;               // ... per hour

// The picture's real type from its first bytes, or null. The declared
// Content-Type must agree with it.
export function detectImageType(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

export function declaredType(request) {
  return String((request.headers && request.headers.get('Content-Type')) || '').split(';')[0].trim().toLowerCase();
}

// Reads the body but gives up the moment it passes `max` bytes, so an oversized
// upload is never fully buffered. { bytes } or { tooBig: true }.
export async function readCapped(request, max) {
  const len = parseInt(request.headers.get('Content-Length') || '', 10);
  if (isFinite(len) && len > max) return { tooBig: true };
  if (!request.body) return { bytes: new Uint8Array(0) };
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { try { await reader.cancel(); } catch (e) { /* ignore */ } return { tooBig: true }; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.length; }
  return { bytes };
}

export function toBase64(bytes) {
  if (typeof bytes.toBase64 === 'function') return bytes.toBase64();
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Asked of the vision model. Llama 3.2 Vision does not take a system prompt
// alongside an image, so everything is in the one user message.
export const PICTURE_PROMPT =
  'Describe the feel of this picture in ONE or TWO short plain sentences: the light, the colours, the setting, the weather or time of day, and the emotion it gives. ' +
  'Write it like a mood for a playlist, for example "A rainy city street at night, neon reflections on wet pavement, lonely and moody". ' +
  'Do not name or identify any real person, and do not describe anyone\'s face or body. ' +
  'Do not use the words no, not, without, nothing, never or none. Reply with the sentences only.';

export function buildVisionRequest(bytes, type) {
  return {
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: PICTURE_PROMPT },
        { type: 'image_url', image_url: { url: 'data:' + type + ';base64,' + toBase64(bytes) } },
      ],
    }],
    max_tokens: PICTURE_MAX_TOKENS,
    temperature: 0.3,
  };
}

const NEGATION = /\b(no|not|without|nothing|never|none|avoid|except|minus|zero|don'?t|isn'?t|aren'?t|cannot|can'?t)\b/i;
const REFUSAL = /^(i('| a)?m sorry|sorry|i can('|no)?t|i cannot|i am unable|i'?m unable|unfortunately|as an ai)/i;

// The model's answer is untrusted text. Returns a short plain sentence or ''.
// Control characters, markup, URLs and quotes go; it is capped; sentences with
// a negation are dropped (the vibe parser would read "no people" as "leave out
// people") unless that would leave nothing; a refusal comes back as ''.
export function sanitizeDescription(raw) {
  let s = typeof raw === 'string' ? raw : (raw && typeof raw.response === 'string' ? raw.response : '');
  s = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[<>{}\[\]\\`"“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(this|the) (image|picture|photo|photograph|scene|screenshot) (shows|depicts|captures|features|is|presents)\s*/i, '')
    .replace(/^[-*•\s]+/, '');
  if (!s || REFUSAL.test(s)) return '';
  const sentences = (s.match(/[^.!?]+[.!?]*/g) || [s]).map(x => x.trim()).filter(Boolean);
  let kept = sentences.filter(x => !NEGATION.test(x));
  if (!kept.length) kept = [sentences[0].replace(new RegExp(NEGATION.source, 'gi'), ' ').replace(/\s+/g, ' ').trim()];
  let out = kept.slice(0, 2).join(' ').trim();
  if (out.length > PICTURE_MAX_DESCRIPTION) out = out.slice(0, PICTURE_MAX_DESCRIPTION).replace(/\s+\S*$/, '').trim();
  out = out.replace(/^./u, c => c.toUpperCase());
  return out.length >= 8 ? out : '';
}

async function askVision(env, bytes, type) {
  let timer;
  try {
    const run = env.AI.run(PICTURE_MODEL, buildVisionRequest(bytes, type));
    const out = await Promise.race([run, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), PICTURE_AI_TIMEOUT_MS); })]);
    return { text: sanitizeDescription(out && out.response !== undefined ? out.response : out) };
  } catch (e) {
    // Never the picture or the request: only the class of failure and the first part of the message.
    const msg = String(e && e.message || e).slice(0, 160);
    console.warn('vibe-picture: vision call failed:', /timeout/.test(msg) ? 'timeout' : msg, /licen[cs]e|agree|5016/i.test(msg) ? '(the Meta licence may not be accepted on this Cloudflare account yet, see README "Picture vibes")' : '');
    return { failed: true };
  } finally { clearTimeout(timer); }
}

// deps: { json(body, status), overIpLimit(request, ctx, name, limit, windowS), interpret(text, request) -> Response }
export async function handleVibePicture(request, env, ctx, deps) {
  const { json } = deps;
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  const type = declaredType(request);
  if (!PICTURE_TYPES.includes(type)) return json({ error: 'not an image' }, 415);
  const len = parseInt(request.headers.get('Content-Length') || '', 10);
  if (isFinite(len) && len > PICTURE_MAX_BYTES) return json({ error: 'too big' }, 413);
  if (await deps.overIpLimit(request, ctx, 'vibepicture', PICTURE_IP_LIMIT, PICTURE_IP_WINDOW_S)) return json({ error: 'busy', reason: 'ip' }, 429);

  let body;
  try { body = await readCapped(request, PICTURE_MAX_BYTES); } catch (e) { return json({ error: 'bad upload' }, 400); }
  if (body.tooBig) return json({ error: 'too big' }, 413);
  const bytes = body.bytes;
  if (bytes.length < PICTURE_MIN_BYTES) return json({ error: 'not an image' }, 415);
  if (detectImageType(bytes) !== type) return json({ error: 'not an image' }, 415);

  if (!env.AI || typeof env.AI.run !== 'function' || !env.VOICE_QUOTA) return json({ error: 'unavailable' }, 503);
  // Account-wide daily ceiling, fails closed (same Durable Object class voice.js uses, own instance).
  const day = new Date().toISOString().slice(0, 10);
  const meter = env.VOICE_QUOTA.get(env.VOICE_QUOTA.idFromName('p:' + day));
  let spend;
  try { spend = await meter.spend(PICTURE_NEURONS_PER_CALL, PICTURE_DAILY_NEURON_LIMIT); } catch (e) { spend = { ok: false }; }
  if (!spend.ok) return json({ error: 'busy', reason: 'budget' }, 429);

  const vision = await askVision(env, bytes, type);
  if (vision.failed) {
    // The model did not answer: hand the neurons back (a timed-out run may still have spent some; the 25% share has headroom).
    try { await meter.unspend(PICTURE_NEURONS_PER_CALL); } catch (e) { /* ignore */ }
    return json({ error: 'unavailable' }, 503);
  }
  if (!vision.text) return json({ error: 'no feel' }, 422);

  let res;
  try { res = await deps.interpret(vision.text, request); } catch (e) { console.warn('vibe-picture: interpret failed'); return json({ error: 'unavailable' }, 503); }
  let data = null;
  try { data = res && res.ok ? await res.json() : null; } catch (e) { data = null; }
  if (!data || typeof data !== 'object') return json({ error: 'unavailable' }, 503);
  const out = json(Object.assign({}, data, { picture: { description: vision.text } }), 200);
  out.headers.set('Cache-Control', 'no-store');
  return out;
}
