// Owner's "what's playing" feed (working title "What's MAL GRIOT Playing?").
//
//   GET  /nowplaying   public, read-only: { current, recent } (newest first)
//   POST /nowplaying   owner only: { v, t, a } = the track that just started
//
// POST needs `Authorization: Bearer <NOWPLAYING_TOKEN>` (worker secret,
// `npx wrangler secret put NOWPLAYING_TOKEN`, 32+ chars; deliberately NOT the
// admin token, so a leaked publish key can't touch tester data). Unset = POST
// answers 503. The key lives only in the owner's browser (localStorage),
// never in index.html. Storage: one key in the PROFILES KV namespace.
// GET is edge-cached briefly so many polling clients don't burn KV reads.

import { tokenMatches, allowedOrigin } from './admin.js';

export const NP_KEY = 'nowplaying:v1';
export const NP_MAX = 25;
const MIN_TOKEN_LEN = 32;
const FAIL_LIMIT = 10, FAIL_WINDOW_S = 900;
const GET_CACHE_S = 15;

const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);

// Pure: add a started track to the stored list. Same track twice in a row
// only refreshes its timestamp; otherwise it goes to the front, de-duped.
export function addTrack(items, track, now) {
  const list = Array.isArray(items) ? items : [];
  const entry = { v: track.v, t: track.t, a: track.a, ts: now };
  return [entry, ...list.filter(x => x && x.v !== track.v)].slice(0, NP_MAX);
}
export function viewOf(items) {
  const list = Array.isArray(items) ? items : [];
  return { current: list[0] || null, recent: list.slice(1) };
}

function failKey(request) {
  return new Request('https://ratelimit.internal/np-fail/' + encodeURIComponent(request.headers.get('CF-Connecting-IP') || 'unknown'));
}

export async function handleNowPlaying(request, url, env, ctx, deps) {
  const origin = request.headers.get('Origin');
  const base = { 'Content-Type': 'application/json', Vary: 'Origin' };
  const reply = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...base, ...extra } });
  const pub = { 'Access-Control-Allow-Origin': '*' };
  const own = allowedOrigin(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600' } : {};
  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Vary: 'Origin', ...own } });
    if (!env.PROFILES) return reply({ error: 'not configured' }, 500, pub);

    if (request.method === 'GET') {
      const ck = new Request(url.origin + '/nowplaying');
      const hit = await deps.envCache.match(ck);
      if (hit) return hit;
      let items = [];
      try { items = JSON.parse(await env.PROFILES.get(NP_KEY)) || []; } catch (e) {}
      const res = reply(viewOf(items), 200, { ...pub, 'Cache-Control': 'public, max-age=' + GET_CACHE_S });
      ctx.waitUntil(deps.envCache.put(ck, res.clone()));
      return res;
    }

    if (request.method !== 'POST') return reply({ error: 'GET or POST only' }, 405, pub);
    if (origin && !allowedOrigin(origin)) return reply({ error: 'forbidden' }, 403);
    if (!env.NOWPLAYING_TOKEN || env.NOWPLAYING_TOKEN.length < MIN_TOKEN_LEN) return reply({ error: 'Publishing isn\'t set up (NOWPLAYING_TOKEN).' }, 503, own);
    const fk = failKey(request);
    const hitF = await deps.envCache.match(fk);
    const fails = hitF ? (parseInt(await hitF.text(), 10) || 0) : 0;
    if (fails >= FAIL_LIMIT) return reply({ error: 'Too many wrong keys. Try again later.' }, 429, own);
    const m = /^Bearer\s+(.+)$/.exec(request.headers.get('Authorization') || '');
    if (!m || !(await tokenMatches(m[1].trim(), env.NOWPLAYING_TOKEN))) {
      ctx.waitUntil(deps.envCache.put(fk, new Response(String(fails + 1), { headers: { 'Cache-Control': 'max-age=' + FAIL_WINDOW_S } })));
      return reply({ error: 'Wrong key.' }, 401, own);
    }
    const text = await request.text();
    if (text.length > 2000) return reply({ error: 'too large' }, 413, own);
    let body;
    try { body = JSON.parse(text) || {}; } catch (e) { return reply({ error: 'invalid json body' }, 400, own); }
    const track = { v: clean(body.v, 40), t: clean(body.t, 200), a: clean(body.a, 200) };
    if (!track.v || !track.t) return reply({ error: 'Need v (video id) and t (title).' }, 400, own);
    let items = [];
    try { items = JSON.parse(await env.PROFILES.get(NP_KEY)) || []; } catch (e) {}
    items = addTrack(items, track, Date.now());
    await env.PROFILES.put(NP_KEY, JSON.stringify(items));
    ctx.waitUntil(deps.envCache.delete(new Request(url.origin + '/nowplaying')));
    return reply({ ok: true }, 200, own);
  } catch (e) {
    console.error(e);
    return reply({ error: 'internal error' }, 500, pub);
  }
}
