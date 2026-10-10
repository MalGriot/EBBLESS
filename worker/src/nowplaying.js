// ON AIR: the owner's live "what I'm playing" broadcast.
//
//   GET  /nowplaying   public, read-only. Server time is the only clock:
//     { serverTime, onAir, current, recent }
//       current: { v, t, a, startedAt, pos, playing }  pos = live position in
//                seconds AT serverTime (listeners add their own elapsed time
//                since the response arrived, never their device clock)
//       recent:  [{ v, t, a, startedAt }] newest first, up to NP_MAX
//       v is the app's track id (YouTube id, or its sc:/audio: forms), so it
//       carries the source; listeners play it like any playlist track.
//   POST /nowplaying   owner only: { v, t, a, pos, playing }
//     `Authorization: Bearer <Google ID token>` from the app's existing
//     Sign in with Google. The token is verified server-side (signature,
//     audience, expiry) and its verified email must equal the OWNER_EMAIL
//     worker var. No client-sent identity is trusted; unset OWNER_EMAIL =
//     POST answers 503.
//
// The owner's app posts only on state changes (song start, pause, resume,
// stop, a settled seek) and sends the track duration `dur`. Nothing is
// written to keep the broadcast alive: the position is derived from the
// server's clock, and onAir expires on READ at the moment the song should
// have ended (+ slack; STALE_UNKNOWN_MS when the duration is unknown), so a
// force-quit app stays "on air" only until its song would have finished.
// A post that changes nothing material skips the KV put. Storage: ONE key in
// the PROFILES KV holding current + recent history (a song change = one
// put). GET is served from the edge cache (a few seconds) and only reads KV
// on a miss; the cached copy is state, so serverTime/pos are recomputed per
// request.

import { allowedOrigin } from './admin.js';

export const NP_KEY = 'nowplaying:v2';
export const NP_MAX = 25;
export const END_SLACK_MS = 15_000;      // grace past the song's end before it goes off air
export const STALE_UNKNOWN_MS = 600_000; // no duration known: off air after 10 minutes
const SAME_POS_S = 2;                    // a re-post this close to the predicted position changes nothing
const GET_CACHE_S = 5;
const FAIL_LIMIT = 30, FAIL_WINDOW_S = 900;

const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);

// Pure. state = { now: {v,t,a,pos,playing,at,startedAt} | null, items: [...] }
// Same song: refresh pos/playing/at. New song: the old one drops into history
// (newest first, de-duped by id) and the new one starts a fresh startedAt.
export function applyPost(state, post, now) {
  const st = state && typeof state === 'object' ? state : {};
  const prev = st.now || null;
  let items = Array.isArray(st.items) ? st.items : [];
  const cur = { v: post.v, t: post.t, a: post.a, pos: post.pos, dur: post.dur, playing: post.playing, at: now, startedAt: now - Math.round(post.pos * 1000) };
  if (prev && prev.v !== post.v) {
    items = [{ v: prev.v, t: prev.t, a: prev.a, startedAt: prev.startedAt }, ...items.filter(x => x && x.v !== prev.v)];
  }
  items = items.filter(x => x && x.v !== post.v).slice(0, NP_MAX);
  return { now: cur, items };
}

// Position (seconds) of the current song at server time `t`, ignoring expiry.
export function posAt(n, t) { return n.playing ? n.pos + Math.max(0, t - n.at) / 1000 : n.pos; }
// Is the current song still playing at server time `t`? Computed on read.
export function isLive(n, t) {
  if (!n || !n.playing) return false;
  const left = n.dur > 0 ? Math.max(0, n.dur - n.pos) * 1000 + END_SLACK_MS : STALE_UNKNOWN_MS;
  return t - n.at < left;
}
// True when this post would leave the stored state effectively unchanged.
export function isNoOp(state, post, now) {
  const n = state && state.now;
  if (!n || n.v !== post.v || n.playing !== post.playing || n.t !== post.t || n.a !== post.a) return false;
  if (Math.abs((n.dur || 0) - (post.dur || 0)) > 1) return false;
  return Math.abs(posAt(n, now) - post.pos) <= SAME_POS_S;
}

export function viewOf(state, serverTime) {
  const st = state && typeof state === 'object' ? state : {};
  const n = st.now || null;
  const recent = (Array.isArray(st.items) ? st.items : []).map(x => ({ v: x.v, t: x.t, a: x.a, startedAt: x.startedAt }));
  if (!n) return { serverTime, onAir: false, current: null, recent };
  const live = isLive(n, serverTime);
  let pos = posAt(n, serverTime);
  if (n.dur > 0) pos = Math.min(pos, n.dur);
  return {
    serverTime,
    onAir: live,
    current: { v: n.v, t: n.t, a: n.a, startedAt: n.startedAt, pos: Math.round(pos * 100) / 100, dur: n.dur || 0, playing: live },
    recent,
  };
}

function failKey(request) {
  return new Request('https://ratelimit.internal/np-fail/' + encodeURIComponent(request.headers.get('CF-Connecting-IP') || 'unknown'));
}

// deps: { envCache, verifyGoogleIdToken(idToken, clientId, env, ctx), now? }
export async function handleNowPlaying(request, url, env, ctx, deps) {
  const origin = request.headers.get('Origin');
  const now = deps.now ? deps.now() : Date.now();
  const base = { 'Content-Type': 'application/json', Vary: 'Origin' };
  const reply = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...base, 'Cache-Control': 'no-store', ...extra } });
  const pub = { 'Access-Control-Allow-Origin': '*' };
  const own = allowedOrigin(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600' } : {};
  const readState = async () => { try { return JSON.parse(await env.PROFILES.get(NP_KEY)) || {}; } catch (e) { return {}; } };
  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Vary: 'Origin', ...own } });
    if (!env.PROFILES) return reply({ error: 'not configured' }, 500, pub);

    if (request.method === 'GET') {
      const ck = new Request(url.origin + '/nowplaying-state');
      const hit = await deps.envCache.match(ck);
      let state;
      if (hit) { try { state = JSON.parse(await hit.text()); } catch (e) { state = null; } }
      if (!state) {
        state = await readState();
        ctx.waitUntil(deps.envCache.put(ck, new Response(JSON.stringify(state), { headers: { 'Cache-Control': 'max-age=' + GET_CACHE_S } })));
      }
      return reply(viewOf(state, now), 200, pub);
    }

    if (request.method !== 'POST') return reply({ error: 'GET or POST only' }, 405, pub);
    if (origin && !allowedOrigin(origin)) return reply({ error: 'forbidden' }, 403);
    if (!env.OWNER_EMAIL) return reply({ error: 'Publishing isn\'t set up (OWNER_EMAIL).' }, 503, own);
    if (!env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID.startsWith('REPLACE_')) return reply({ error: 'google sign-in not configured' }, 500, own);
    const fk = failKey(request);
    const hitF = await deps.envCache.match(fk);
    const fails = hitF ? (parseInt(await hitF.text(), 10) || 0) : 0;
    if (fails >= FAIL_LIMIT) return reply({ error: 'Too many bad tokens. Try again later.' }, 429, own);
    const m = /^Bearer\s+(.+)$/.exec(request.headers.get('Authorization') || '');
    let claims = null;
    if (m) { try { claims = await deps.verifyGoogleIdToken(m[1].trim(), env.GOOGLE_CLIENT_ID, env, ctx); } catch (e) { claims = null; } }
    if (!claims) {
      ctx.waitUntil(deps.envCache.put(fk, new Response(String(fails + 1), { headers: { 'Cache-Control': 'max-age=' + FAIL_WINDOW_S } })));
      return reply({ error: 'Sign in required.' }, 401, own);
    }
    const verified = claims.email_verified === true || claims.email_verified === 'true';
    if (!verified || String(claims.email || '').toLowerCase() !== String(env.OWNER_EMAIL).trim().toLowerCase()) {
      return reply({ error: 'Not the owner.' }, 403, own);
    }
    const text = await request.text();
    if (text.length > 2000) return reply({ error: 'too large' }, 413, own);
    let body;
    try { body = JSON.parse(text) || {}; } catch (e) { return reply({ error: 'invalid json body' }, 400, own); }
    const post = { v: clean(body.v, 40), t: clean(body.t, 200), a: clean(body.a, 200), pos: Number(body.pos), dur: Number(body.dur), playing: body.playing === true };
    if (!post.v || !post.t) return reply({ error: 'Need v (track id) and t (title).' }, 400, own);
    if (!Number.isFinite(post.pos) || post.pos < 0 || post.pos > 86400) post.pos = 0;
    if (!Number.isFinite(post.dur) || post.dur < 0 || post.dur > 86400) post.dur = 0;
    const cur = await readState();
    if (isNoOp(cur, post, now)) return reply({ ok: true, unchanged: true }, 200, own);   // no KV write
    const next = applyPost(cur, post, now);
    await env.PROFILES.put(NP_KEY, JSON.stringify(next));
    ctx.waitUntil(deps.envCache.delete(new Request(url.origin + '/nowplaying-state')));
    return reply({ ok: true }, 200, own);
  } catch (e) {
    console.error(e);
    return reply({ error: 'internal error' }, 500, pub);
  }
}
