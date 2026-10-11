// First-party login session (so Google sign-in is automatic after the first
// time). The app used to re-ask Google for a fresh ID token every visit
// (One Tap), which browsers that block third-party sign-in state refuse, so
// those users signed in every single time. Now: sign in with Google once,
// POST /auth/session trades that verified ID token for an opaque random
// session token, the app keeps it, and every later visit sends it in place of
// the Google token. verifyIdentity() (below) accepts either, so every
// endpoint that took a Google ID token takes a session token unchanged.
//
// Only a SHA-256 of the token is stored (PROFILES KV, key "sess:<hash>"), so
// a KV leak doesn't leak usable sessions. Sessions expire after
// SESSION_TTL_S and slide forward when used (at most once a day). Sign out
// deletes the record, so the token stops working everywhere at once.

export const SESSION_PREFIX = 'ebs1.';
export const SESSION_TTL_S = 90 * 24 * 3600;
export const SESSION_SLIDE_MS = 24 * 3600 * 1000;
const KEY = (hash) => 'sess:' + hash;

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isSessionToken(t) {
  return typeof t === 'string' && t.startsWith(SESSION_PREFIX) && t.length > SESSION_PREFIX.length + 20 && t.length < 200;
}

// google = a verified Google ID token payload ({ sub, email, ... }).
export async function createSession(google, env, now = Date.now()) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = SESSION_PREFIX + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const rec = {
    sub: String(google.sub),
    email: google.email || null,
    email_verified: google.email_verified === true || google.email_verified === 'true',
    name: google.name || null,
    picture: google.picture || null,
    iat: now,
    ext: now,
  };
  await env.PROFILES.put(KEY(await sha256Hex(token)), JSON.stringify(rec), { expirationTtl: SESSION_TTL_S });
  return { session: token, expiresAt: now + SESSION_TTL_S * 1000 };
}

// Returns a Google-payload-shaped identity, or throws.
export async function verifySession(token, env, ctx, now = Date.now()) {
  if (!isSessionToken(token)) throw new Error('malformed session');
  if (!env.PROFILES) throw new Error('profiles not configured');
  const key = KEY(await sha256Hex(token));
  const raw = await env.PROFILES.get(key);
  if (!raw) throw new Error('session expired');
  let rec;
  try { rec = JSON.parse(raw); } catch (e) { throw new Error('session expired'); }
  if (now - (rec.ext || 0) > SESSION_SLIDE_MS) {
    rec.ext = now;
    const p = env.PROFILES.put(key, JSON.stringify(rec), { expirationTtl: SESSION_TTL_S });
    if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p;
  }
  return { sub: rec.sub, email: rec.email, email_verified: rec.email_verified, name: rec.name, picture: rec.picture, session: true };
}

export async function revokeSession(token, env) {
  if (!isSessionToken(token) || !env.PROFILES) return;
  await env.PROFILES.delete(KEY(await sha256Hex(token)));
}

// deps: { json, verifyGoogleJwt(idToken, clientId, env, ctx) }
//   POST /auth/session  { idToken: <Google ID token> } -> { session, expiresAt }
//   POST /auth/signout  { session }                    -> { ok: true }
export async function handleSession(request, url, env, ctx, deps) {
  const { json } = deps;
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!env.PROFILES) return json({ error: 'profiles not configured' }, 500);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json body' }, 400); }
  if (url.pathname === '/auth/signout') {
    await revokeSession(String((body && body.session) || ''), env);
    return json({ ok: true });
  }
  if (!env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID.startsWith('REPLACE_')) return json({ error: 'google sign-in not configured' }, 500);
  const idToken = String((body && body.idToken) || '');
  if (!idToken) return json({ error: 'missing idToken' }, 400);
  let payload;
  try { payload = await deps.verifyGoogleJwt(idToken, env.GOOGLE_CLIENT_ID, env, ctx); }
  catch (e) { return json({ error: 'invalid id token: ' + e.message }, 401); }
  return json(await createSession(payload, env));
}
