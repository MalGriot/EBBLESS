// First-party login session tests (worker/src/session.js). Dependency-free:
// run with `npm test` in worker/. KV and Google verification are stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleSession, createSession, verifySession, revokeSession, isSessionToken, SESSION_PREFIX, SESSION_SLIDE_MS, SESSION_TTL_S } from '../src/session.js';

function fakeKV() {
  const m = new Map(), puts = [];
  return { m, puts,
    get: async (k) => (m.has(k) ? m.get(k) : null),
    put: async (k, v, o) => { m.set(k, v); puts.push([k, o]); },
    delete: async (k) => { m.delete(k); } };
}
const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
const google = { sub: '123', email: 'a@b.com', email_verified: true, name: 'Ann' };
const verifyGoogleJwt = async (t) => { if (t !== 'good-google-token') throw new Error('bad signature'); return google; };
const mkEnv = () => ({ PROFILES: fakeKV(), GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com' });
const call = (path, body, env) => handleSession(
  new Request('https://w.test' + path, { method: 'POST', body: JSON.stringify(body) }),
  new URL('https://w.test' + path), env, { waitUntil() {} }, { json, verifyGoogleJwt });

test('a verified Google token buys a session that verifies as the same identity', async () => {
  const env = mkEnv();
  const res = await call('/auth/session', { idToken: 'good-google-token' }, env);
  assert.equal(res.status, 200);
  const { session, expiresAt } = await res.json();
  assert.ok(session.startsWith(SESSION_PREFIX));
  assert.ok(expiresAt > Date.now());
  const id = await verifySession(session, env);
  assert.equal(id.sub, '123');
  assert.equal(id.email, 'a@b.com');
  assert.equal(id.email_verified, true);
});

test('only a hash of the token is stored, with a 90 day expiry', async () => {
  const env = mkEnv();
  const { session } = await createSession(google, env);
  const [[key, opts]] = env.PROFILES.puts;
  assert.ok(key.startsWith('sess:'));
  assert.ok(!key.includes(session) && !JSON.stringify([...env.PROFILES.m]).includes(session));
  assert.equal(opts.expirationTtl, SESSION_TTL_S);
});

test('a bad Google token gets no session', async () => {
  const env = mkEnv();
  const res = await call('/auth/session', { idToken: 'nope' }, env);
  assert.equal(res.status, 401);
  assert.equal(env.PROFILES.m.size, 0);
});

test('a session token cannot be traded for another session', async () => {
  const env = mkEnv();
  const { session } = await createSession(google, env);
  const res = await call('/auth/session', { idToken: session }, env);
  assert.equal(res.status, 401);
});

test('unknown, malformed and expired sessions are rejected', async () => {
  const env = mkEnv();
  await assert.rejects(verifySession(SESSION_PREFIX + 'a'.repeat(64), env), /expired/);
  await assert.rejects(verifySession('eyJhbGciOi.x.y', env), /malformed/);
  assert.equal(isSessionToken(SESSION_PREFIX), false);
  assert.equal(isSessionToken(undefined), false);
});

test('signing out kills the session everywhere', async () => {
  const env = mkEnv();
  const { session } = await createSession(google, env);
  const res = await call('/auth/signout', { session }, env);
  assert.equal(res.status, 200);
  await assert.rejects(verifySession(session, env), /expired/);
  await revokeSession('garbage', env); // harmless
});

test('use slides the expiry forward, at most once a day', async () => {
  const env = mkEnv();
  const t0 = Date.now();
  const { session } = await createSession(google, env, t0);
  env.PROFILES.puts.length = 0;
  await verifySession(session, env, null, t0 + 1000);
  assert.equal(env.PROFILES.puts.length, 0);
  await verifySession(session, env, null, t0 + SESSION_SLIDE_MS + 1000);
  assert.equal(env.PROFILES.puts.length, 1);
  assert.equal(env.PROFILES.puts[0][1].expirationTtl, SESSION_TTL_S);
});

test('GET and missing token are refused', async () => {
  const env = mkEnv();
  const g = await handleSession(new Request('https://w.test/auth/session'), new URL('https://w.test/auth/session'), env, {}, { json, verifyGoogleJwt });
  assert.equal(g.status, 405);
  assert.equal((await call('/auth/session', {}, env)).status, 400);
});
