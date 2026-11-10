// POST /vibe-picture (src/vibe-picture.js). Dependency-free: `npm test` in worker/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectImageType, sanitizeDescription, readCapped, buildVisionRequest, handleVibePicture,
  PICTURE_MAX_BYTES, PICTURE_NEURONS_PER_CALL, PICTURE_DAILY_NEURON_LIMIT, PICTURE_MODEL, PICTURE_IP_LIMIT,
} from '../src/vibe-picture.js';

const JPEG = (n = 2000) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff, 0xe0], 0); return b; };
const PNG = (n = 500) => { const b = new Uint8Array(n); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); return b; };
const WEBP = (n = 500) => { const b = new Uint8Array(n); b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 0); return b; };
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const post = (body, type = 'image/jpeg', extra = {}) => new Request('https://w.example/vibe-picture', { method: 'POST', body, headers: { 'Content-Type': type, ...extra } });

function fakeMeter(opts = {}) {
  const spent = new Map(); const ids = [];
  return {
    spent, ids,
    idFromName: (n) => { ids.push(n); return n; },
    get: (id) => ({
      spend: async (cost, budget) => { if (opts.spendThrows) throw new Error('do down'); const u = spent.get(id) || 0; if (u + cost > budget) return { ok: false, used: u }; spent.set(id, u + cost); return { ok: true, used: u + cost }; },
      unspend: async (cost) => { spent.set(id, Math.max(0, (spent.get(id) || 0) - cost)); },
    }),
  };
}
function setup(over = {}) {
  const calls = { ai: [], interpret: [], ip: [] };
  const env = {
    AI: { run: async (model, input) => { calls.ai.push({ model, input }); if (over.aiThrows) throw new Error(over.aiThrows); return over.aiOut !== undefined ? over.aiOut : { response: 'A rainy city street at night, neon reflections on wet pavement, lonely and moody.' }; } },
    VOICE_QUOTA: over.meter || fakeMeter(),
    // storage that must never be touched
    MATCH_REPORTS: new Proxy({}, { get() { throw new Error('storage touched'); } }),
    PROFILES: new Proxy({}, { get() { throw new Error('storage touched'); } }),
    TASTE_POOL: new Proxy({}, { get() { throw new Error('storage touched'); } }),
  };
  if (over.noAi) delete env.AI;
  const deps = {
    json,
    overIpLimit: async (req, ctx, name, limit, windowS) => { calls.ip.push({ name, limit, windowS }); return !!over.ipLimited; },
    interpret: async (text, req) => { calls.interpret.push(text); return over.interpretRes || json({ source: 'ai', title: 'Neon Rain', tags: ['synthwave'], tracks: [{ title: 'T', artist: 'A' }], metrics: [null] }); },
  };
  return { env, deps, calls };
}

test('magic bytes: jpeg, png, webp recognised; others and short input are not', () => {
  assert.equal(detectImageType(JPEG()), 'image/jpeg');
  assert.equal(detectImageType(PNG()), 'image/png');
  assert.equal(detectImageType(WEBP()), 'image/webp');
  assert.equal(detectImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(detectImageType(new TextEncoder().encode('GIF89a......')), null);
  assert.equal(detectImageType(new Uint8Array(5)), null);
  assert.equal(detectImageType(null), null);
});

test('happy path: description from the model goes through the vibe pipeline, response gains picture.description', async () => {
  const { env, deps, calls } = setup();
  const res = await handleVibePicture(post(JPEG()), env, {}, deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.title, 'Neon Rain');
  assert.equal(body.tracks.length, 1);
  assert.match(body.picture.description, /rainy city street/i);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(calls.ai.length, 1);
  assert.equal(calls.ai[0].model, PICTURE_MODEL);
  assert.equal(calls.interpret.length, 1);
  assert.equal(calls.interpret[0], body.picture.description);
  // image reaches the model as a data URI, with the prompt in the same user message (no system prompt)
  const msg = calls.ai[0].input.messages;
  assert.equal(msg.length, 1);
  assert.equal(msg[0].role, 'user');
  assert.match(msg[0].content[1].image_url.url, /^data:image\/jpeg;base64,/);
  assert.equal(calls.ip[0].name, 'vibepicture');
  assert.equal(calls.ip[0].limit, PICTURE_IP_LIMIT);
});

test('png and webp are accepted when type and bytes agree', async () => {
  for (const [bytes, type] of [[PNG(), 'image/png'], [WEBP(), 'image/webp']]) {
    const { env, deps } = setup();
    assert.equal((await handleVibePicture(post(bytes, type), env, {}, deps)).status, 200, type);
  }
});

test('rejects wrong method, wrong content type, and a type that disagrees with the bytes (no model call, no spend)', async () => {
  for (const mk of [
    () => new Request('https://w.example/vibe-picture', { method: 'GET' }),
    () => post(JPEG(), 'application/json'),
    () => post(JPEG(), 'image/gif'),
    () => post(JPEG(), 'image/svg+xml'),
    () => post(new TextEncoder().encode('<svg onload=alert(1)>'.padEnd(200, ' ')), 'image/jpeg'),
    () => post(PNG(), 'image/jpeg'),
    () => post(new Uint8Array(10), 'image/jpeg'),
  ]) {
    const { env, deps, calls } = setup();
    const res = await handleVibePicture(mk(), env, {}, deps);
    assert.ok([405, 415].includes(res.status), 'status ' + res.status);
    assert.equal(calls.ai.length, 0);
    assert.equal(env.VOICE_QUOTA.spent.size, 0);
  }
});

test('size cap: over 1 MB is 413 from the header or from the stream, and the model is never called', async () => {
  const big = JPEG(PICTURE_MAX_BYTES + 1);
  let { env, deps, calls } = setup();
  let res = await handleVibePicture(post(big), env, {}, deps);
  assert.equal(res.status, 413);
  assert.equal(calls.ai.length, 0);
  // a lying or missing Content-Length: the streamed read stops at the cap
  const stream = new ReadableStream({ start(c) { c.enqueue(JPEG(PICTURE_MAX_BYTES)); c.enqueue(new Uint8Array(10)); c.close(); } });
  const r = await readCapped({ headers: new Headers(), body: stream }, PICTURE_MAX_BYTES);
  assert.equal(r.tooBig, true);
  ({ env, deps, calls } = setup());
  res = await handleVibePicture(post(JPEG(PICTURE_MAX_BYTES)), env, {}, deps);
  assert.equal(res.status, 200);   // exactly at the cap is allowed
});

test('per-IP throttle answers 429 before the body is read or the model is called', async () => {
  const { env, deps, calls } = setup({ ipLimited: true });
  const res = await handleVibePicture(post(JPEG()), env, {}, deps);
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, 'busy');
  assert.equal(calls.ai.length, 0);
  assert.equal(env.VOICE_QUOTA.spent.size, 0);
});

test('daily neuron ceiling: own instance, charged per picture, 429 once spent, never exceeds the limit', async () => {
  const meter = fakeMeter();
  const { env, deps, calls } = setup({ meter });
  const day = new Date().toISOString().slice(0, 10);
  let ok = 0, capped = 0;
  for (let i = 0; i < 80; i++) {
    const res = await handleVibePicture(post(JPEG()), env, {}, deps);
    if (res.status === 200) ok++; else { assert.equal(res.status, 429); assert.equal((await res.json()).reason, 'budget'); capped++; }
  }
  assert.equal(ok, Math.floor(PICTURE_DAILY_NEURON_LIMIT / PICTURE_NEURONS_PER_CALL));
  assert.equal(capped, 80 - ok);
  assert.equal(calls.ai.length, ok);
  assert.ok(meter.spent.get('p:' + day) <= PICTURE_DAILY_NEURON_LIMIT);
  assert.deepEqual([...new Set(meter.ids)], ['p:' + day]);   // not voice's "g:" counter
  assert.ok(PICTURE_DAILY_NEURON_LIMIT <= 10000 * 0.25 + 1, 'picture share stays at a quarter of the free allowance');
});

test('fails closed when the counter is down or the AI binding is missing', async () => {
  let { env, deps, calls } = setup({ meter: fakeMeter({ spendThrows: true }) });
  let res = await handleVibePicture(post(JPEG()), env, {}, deps);
  assert.equal(res.status, 429);
  assert.equal(calls.ai.length, 0);
  ({ env, deps, calls } = setup({ noAi: true }));
  res = await handleVibePicture(post(JPEG()), env, {}, deps);
  assert.equal(res.status, 503);
  ({ env, deps } = setup());
  delete env.VOICE_QUOTA;
  res = await handleVibePicture(post(JPEG()), env, {}, deps);
  assert.equal(res.status, 503);
});

test('AI failure: generic 503, neurons handed back, no detail in the body', async () => {
  const meter = fakeMeter();
  const { env, deps, calls } = setup({ meter, aiThrows: 'AiError: 5016 secret internal detail' });
  const origWarn = console.warn; let logged = '';
  console.warn = (...a) => { logged += a.join(' '); };
  let res;
  try { res = await handleVibePicture(post(JPEG()), env, {}, deps); } finally { console.warn = origWarn; }
  assert.equal(res.status, 503);
  const text = await res.text();
  assert.equal(text, JSON.stringify({ error: 'unavailable' }));
  assert.ok(!/5016|secret/.test(text));
  assert.match(logged, /vision call failed/);
  assert.ok(!/data:image|base64/.test(logged), 'the picture is never logged');
  assert.equal([...meter.spent.values()][0], 0);
  assert.equal(calls.interpret.length, 0);
});

test('model refusal or empty answer: 422, no vibe call; interpret failure: generic 503', async () => {
  for (const aiOut of [{ response: "I'm sorry, I can't help with that." }, { response: '' }, {}, null]) {
    const { env, deps, calls } = setup({ aiOut });
    const res = await handleVibePicture(post(JPEG()), env, {}, deps);
    assert.equal(res.status, 422, JSON.stringify(aiOut));
    assert.equal(calls.interpret.length, 0);
  }
  const { env, deps } = setup({ interpretRes: json({ error: 'x' }, 500) });
  const res = await handleVibePicture(post(JPEG()), env, {}, deps);
  assert.equal(res.status, 503);
  assert.equal(await res.text(), JSON.stringify({ error: 'unavailable' }));
});

test('never stores the picture: KV bindings are never touched on any path', async () => {
  // setup() makes MATCH_REPORTS, PROFILES and TASTE_POOL throw on any access
  for (const over of [{}, { aiThrows: 'boom' }, { ipLimited: true }, { aiOut: { response: '' } }]) {
    const { env, deps } = setup(over);
    await handleVibePicture(post(JPEG()), env, {}, deps);
  }
  const { env, deps } = setup();
  await handleVibePicture(post(JPEG(PICTURE_MAX_BYTES + 5)), env, {}, deps);
});

test('sanitizeDescription: untrusted model text becomes one or two plain sentences', () => {
  const d = sanitizeDescription('The image shows <script>alert(1)</script> a quiet beach at dawn, soft pink light.\u0000 Calm and hopeful. Visit https://evil.example/x now. Third sentence.');
  assert.ok(!/[<>]|script|https?:|\u0000/.test(d), d);
  assert.ok(d.length <= 240);
  assert.match(d, /beach at dawn/i);
  assert.equal(sanitizeDescription('x'.repeat(2000) + ' end').length <= 240, true);
  // negations would be parsed by the vibe pipeline as things to leave out
  assert.equal(sanitizeDescription('A neon alley. There are no people here. Moody and quiet.'), 'A neon alley. Moody and quiet.');
  assert.ok(!/\bno\b/i.test(sanitizeDescription('Not a soul in sight.')));
  assert.equal(sanitizeDescription("I'm sorry, I can't describe this."), '');
  assert.equal(sanitizeDescription(undefined), '');
  assert.equal(sanitizeDescription({ response: 'Golden hour on a dusty road, warm and nostalgic.' }), 'Golden hour on a dusty road, warm and nostalgic.');
  assert.equal(sanitizeDescription('ok'), '');
});

test('vision request has the picture as a data URI and asks for a short answer', () => {
  const r = buildVisionRequest(PNG(100), 'image/png');
  assert.ok(r.max_tokens <= 150);
  assert.match(r.messages[0].content[1].image_url.url, /^data:image\/png;base64,iVBOR/);
  assert.match(r.messages[0].content[0].text, /Do not name or identify any real person/);
});
