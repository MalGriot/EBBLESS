// Shared waveforms (#727): the apps work out a streamed song's 64 loudness peaks once; everyone, the web build included,
// then reads them.
//
//   GET  /waves?ids=<id>,<id>,...   public, read-only, up to 20 YouTube ids -> { "<id>": [64 ints 0-255] } (unknown ids left out)
//   POST /waves  { v: "<id>", p: [64 ints 0-255] }   signed in (Google ID token or session token, verified server-side)
//
// First recording wins and is never overwritten (a re-post is a no-op with no KV write), so one hostile client cannot
// replace a song's shape later; a bad first post is bounded by the checks below (shape, range, per-user and per-IP caps).
// Storage: PROFILES KV, key `wave:v1:<id>`, value = 128 hex chars. Cost: one KV read per cache miss, one KV write per
// newly recorded song (free tier is about 1,000 writes a day, so posts are capped per IP and per day).
import { allowedOrigin } from './admin.js';

export const WAVE_N = 64;
export const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const MAX_IDS = 20;
const HIT_S = 86400, MISS_S = 600;
const POST_LIMIT = 30, POST_WINDOW_S = 3600;   // per IP
const DAY_LIMIT = 400, DAY_S = 86400;          // new songs per day, per edge location (approximate on purpose)

export function encodePeaks(p) { return p.map(v => v.toString(16).padStart(2, '0')).join(''); }
export function decodePeaks(h) {
  if (typeof h !== 'string' || h.length !== WAVE_N * 2 || !/^[0-9a-f]+$/.test(h)) return null;
  const out = [];
  for (let i = 0; i < h.length; i += 2) out.push(parseInt(h.slice(i, i + 2), 16));
  return out;
}
// A real recording is normalised (loudest slice near 255) and is not a flat line.
export function validPeaks(p) {
  if (!Array.isArray(p) || p.length !== WAVE_N) return false;
  if (!p.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) return false;
  const max = Math.max(...p), min = Math.min(...p);
  return max >= 200 && max - min >= 20;
}
export function parseIds(raw) {
  const ids = [];
  for (const s of String(raw || '').split(',')) { if (ID_RE.test(s) && !ids.includes(s)) ids.push(s); if (ids.length >= MAX_IDS) break; }
  return ids;
}

export async function handleWaves(request, url, env, ctx, deps) {
  const origin = request.headers.get('Origin');
  const base = { 'Content-Type': 'application/json', Vary: 'Origin' };
  const pub = { 'Access-Control-Allow-Origin': '*' };
  const own = allowedOrigin(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } : {};
  const reply = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...base, 'Cache-Control': 'no-store', ...extra } });
  const counter = async (key) => { const h = await deps.envCache.match(new Request(url.origin + key)); return h ? (parseInt(await h.text(), 10) || 0) : 0; };
  const bump = (key, n, ttl) => ctx.waitUntil(deps.envCache.put(new Request(url.origin + key), new Response(String(n), { headers: { 'Cache-Control': 'max-age=' + ttl } })));
  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Vary: 'Origin', ...pub, ...own, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
    if (!env.PROFILES) return reply({ error: 'not configured' }, 500, pub);

    if (request.method === 'GET') {
      const ids = parseIds(url.searchParams.get('ids'));
      const out = {};
      await Promise.all(ids.map(async id => {
        const ck = new Request(url.origin + '/wave-state/' + id);
        const hit = await deps.envCache.match(ck);
        let hex = hit ? await hit.text() : null;
        if (hex === null) {
          hex = (await env.PROFILES.get('wave:v1:' + id)) || '';
          ctx.waitUntil(deps.envCache.put(ck, new Response(hex, { headers: { 'Cache-Control': 'max-age=' + (hex ? HIT_S : MISS_S) } })));
        }
        const p = decodePeaks(hex);
        if (p) out[id] = p;
      }));
      return reply(out, 200, { ...pub, 'Cache-Control': 'public, max-age=300' });
    }

    if (request.method !== 'POST') return reply({ error: 'GET or POST only' }, 405, pub);
    if (origin && !allowedOrigin(origin)) return reply({ error: 'forbidden' }, 403);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const ipKey = '/wave-post/' + ip, dayKey = '/wave-day';
    const [mine, today] = await Promise.all([counter(ipKey), counter(dayKey)]);
    if (mine >= POST_LIMIT || today >= DAY_LIMIT) return reply({ error: 'Try again later.' }, 429, own);
    const m = /^Bearer\s+(.+)$/.exec(request.headers.get('Authorization') || '');
    let claims = null;
    if (m && env.GOOGLE_CLIENT_ID) { try { claims = await deps.verifyGoogleIdToken(m[1].trim(), env.GOOGLE_CLIENT_ID, env, ctx); } catch (e) { claims = null; } }
    if (!claims) { bump(ipKey, mine + 1, POST_WINDOW_S); return reply({ error: 'Sign in required.' }, 401, own); }
    const text = await request.text();
    if (text.length > 800) return reply({ error: 'too large' }, 413, own);
    let body;
    try { body = JSON.parse(text) || {}; } catch (e) { return reply({ error: 'invalid json body' }, 400, own); }
    if (!ID_RE.test(String(body.v || '')) || !validPeaks(body.p)) return reply({ error: 'Need v (video id) and p (64 peaks 0-255).' }, 400, own);
    bump(ipKey, mine + 1, POST_WINDOW_S);
    const key = 'wave:v1:' + body.v;
    if (await env.PROFILES.get(key)) return reply({ ok: true, unchanged: true }, 200, own);   // first recording wins: no write
    await env.PROFILES.put(key, encodePeaks(body.p));
    bump(dayKey, today + 1, DAY_S);
    ctx.waitUntil(deps.envCache.delete(new Request(url.origin + '/wave-state/' + body.v)));
    return reply({ ok: true }, 200, own);
  } catch (e) {
    console.error(e);
    return reply({ error: 'internal error' }, 500, pub);
  }
}
