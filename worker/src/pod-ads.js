// Podcast ad reads found in caption text, shared with every listener (cache).
//
// The app detects sponsor reads on the device from the episode's captions
// (podAdReads in index.html, same rules as podAdReads below - keep them in
// step; test/pod-ads.test.mjs checks both give the same answer) and pins
// each read's end from the audio. When it finds some it reports them here;
// the next listener of the same episode copy gets them at once, without
// waiting for captions to be made.
//
// Nothing here costs Workers AI neurons: this is plain text matching plus one
// KV write per episode (first report wins, so a flood of reports can't burn
// the free put limit), and reads are cached at the edge for a few minutes.
//
// Trust: reports come from anonymous devices, so a report is only stored when
// the caption lines it ships with show sponsor wording inside the reported
// range. That stops casual junk, not a determined liar - the damage is bounded
// (a few skippable-with-Undo ranges on one episode) and the app also ignores a
// stored range unless its episode copy has the same length (to half a second).

export const POD_AD_STRONG = [
  /\b(brought to you by|sponsored by|thanks to (our|today's) sponsors?|today's sponsor|support for (this|the|today's) (show|podcast|episode)|this (episode|podcast|show|portion|segment) is (sponsored|supported|brought to you|presented))\b/i,
  /\b(promo|offer|discount|coupon|checkout) code\b|\b(use|enter) (the )?code\b/i,
  /\b\d+ ?(%|percent) off\b|\bfree (trial|shipping)\b|\bmoney[- ]back guarantee\b/i,
  /\b(terms|restrictions|conditions|exclusions) (and conditions )?(may )?apply\b|\b(taxes and fees|fees extra|plan required|for (full )?details|upfront payment|per month equivalent|subject to change|while supplies last|new customers only|void where prohibited)\b|\b(coverage|speeds?) (and \w+ )?var(y|ies)\b|\bmust be (an? )?(active |new |paying )?(subscriber|customer|member)s?\b|\boffer (valid|ends|expires)\b/i,
  /\bwherever you (get|listen to) (your )?podcasts\b/i,
  /\b[a-z0-9][a-z0-9-]* ?(\.|dot) ?(com|net|org|co|io)( ?\/ ?| slash )[a-z0-9-]+/i,
  /\b(go to|visit|head (over )?to|check out|sign up at|at|see),? [a-z0-9][a-z0-9-]* ?(\.|dot) ?(com|net|org|co|io)\b/i,
  // softer wording, only ever counts as one more signal next to the above
  /\b(a word from our|our (friends|partners) at|special offer|exclusive (offer|deal)|listeners (get|receive|can get)|(link|details) (is |are )?(in|on) (the )?(show ?notes|description))\b/i,
];
export const POD_AD_BRAND = /\b([a-z0-9][a-z0-9-]{3,}) ?(?:\.|dot) ?(?:com|net|org|co|io)\b/gi;

export function podAdStrong(text) { return POD_AD_STRONG.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0); }

// The brand named as a name: split ("Mint Mobile", "drip-drop") or
// capitalised mid-sentence - not the plain word a story might use.
export function podAdNamed(text, brand) {
  const re = new RegExp('\\b' + brand.split('').join('[\\s-]?') + '\\b', 'i');
  const m = re.exec(text);
  if (!m) return false;
  return /[\s-]/.test(m[0]) || (/^[A-Z]/.test(m[0]) && m.index > 0 && !/[.?!]\s*$/.test(text.slice(0, m.index)));
}

// cues: [{ s, e, text }] sorted by s. Returns reads { s, last, from, n, cta }:
// lines with sponsor wording joined when under 45 s apart, kept at two or
// more signals; a sponsor intro after a read that already gave its address or
// code starts a new read; s reaches back (up to 75 s) to where the read's
// brand is first named.
export function podAdReads(cues) {
  const out = [];
  let cur = null;
  cues.forEach(c => {
    const n = podAdStrong(c.text);
    if (!n) return;
    const intro = POD_AD_STRONG[0].test(c.text), cta = n > (intro ? 1 : 0);
    const last = Math.min(c.e, c.s + 15);
    if (!(cur && c.s - cur.last <= 45 && !(intro && cur.cta))) { if (cur) out.push(cur); cur = { s: c.s, n: 0, cta: false, brands: [] }; }
    cur.n += n; cur.last = last; cur.from = c.s; cur.cta = cur.cta || cta;
    for (const m of c.text.matchAll(POD_AD_BRAND)) cur.brands.push(m[1].toLowerCase().replace(/-/g, ''));
  });
  if (cur) out.push(cur);
  const reads = out.filter(r => r.n >= 2);
  reads.forEach((r, i) => {
    const floor = Math.max(r.s - 75, i ? reads[i - 1].last : 0);
    const c = cues.find(c => c.s >= floor && c.s < r.s && r.brands.some(b => podAdNamed(c.text, b)));
    if (c) r.s = c.s;
  });
  return reads;
}

// A report from a device: { key, dur, segs: [{s, e}], cues: [[s, e, text]] }.
// Returns { dur, segs } to store, or null.
export function checkPodAdReport(body) {
  if (!body || typeof body !== 'object') return null;
  if (!/^[0-9a-f]{64}$/.test(String(body.key || ''))) return null;
  const dur = Number(body.dur);
  if (!(dur >= 120 && dur <= 86400)) return null;
  if (!Array.isArray(body.segs) || !body.segs.length || body.segs.length > 8) return null;
  if (!Array.isArray(body.cues) || !body.cues.length || body.cues.length > 400) return null;
  const cues = [];
  for (const c of body.cues) {
    if (!Array.isArray(c) || c.length < 3) return null;
    const s = Number(c[0]), e = Number(c[1]), text = String(c[2] || '').slice(0, 300);
    if (!isFinite(s) || !isFinite(e) || s < 0 || e < s) return null;
    cues.push({ s, e, text });
  }
  cues.sort((a, b) => a.s - b.s);
  const reads = podAdReads(cues);
  const segs = [];
  for (const g of body.segs) {
    const s = Number(g && g.s), e = Number(g && g.e);
    if (!isFinite(s) || !isFinite(e) || s < 0 || e > dur + 0.5) continue;
    // an ad read is 5 s to 4 min; longer is not one
    if (e - s < 5 || e - s > 240) continue;
    // the reported range must hold a read the captions back up
    if (!reads.some(r => r.s <= e && r.last >= s - 5)) continue;
    segs.push({ s: Math.round(s * 10) / 10, e: Math.round(e * 10) / 10 });
  }
  if (!segs.length) return null;
  return { dur: Math.round(dur * 10) / 10, segs };
}

const KEEP_SECONDS = 90 * 86400;

// GET /podads?key=<sha256 hex of the episode's audio url>  -> { dur, segs }
// POST /podads  (text/plain JSON, see checkPodAdReport)  -> { ok, stored }
export async function handlePodAds(request, url, env, json) {
  const kv = env.TASTE_POOL;
  if (request.method === 'GET') {
    const key = url.searchParams.get('key') || '';
    if (!/^[0-9a-f]{64}$/.test(key) || !kv) return json({ segs: [] });
    const raw = await kv.get('podads:' + key);
    const res = json(raw ? JSON.parse(raw) : { segs: [] });
    res.headers.set('Cache-Control', 'public, max-age=300');
    return res;
  }
  if (request.method !== 'POST') return json({ error: 'GET or POST only' }, 405);
  if (!kv) return json({ error: 'not configured' }, 501);
  const text = await request.text();
  if (text.length > 100000) return json({ error: 'too large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch (e) { return json({ error: 'bad body' }, 400); }
  const ok = checkPodAdReport(body);
  if (!ok) return json({ error: 'rejected' }, 400);
  const k = 'podads:' + body.key;
  if (await kv.get(k)) return json({ ok: true, stored: false });
  await kv.put(k, JSON.stringify({ v: 1, ...ok }), { expirationTtl: KEEP_SECONDS });
  console.log('[podads] stored', body.key.slice(0, 12), JSON.stringify(ok.segs));
  return json({ ok: true, stored: true });
}
