// POST /profile/delete erases the signed-in account's cloud profile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleProfileDelete } from '../src/profile-delete.js';
import { createSession, isSessionToken, verifySession } from '../src/session.js';

function fakeKV() {
  const m = new Map();
  return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } };
}
const mkEnv = () => ({ PROFILES: fakeKV(), GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com' });
const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
const verifyGoogleIdToken = async (t, cid, env) => verifySession(t, env);
const post = (env, body) => handleProfileDelete(new Request('https://w.test/profile/delete', { method: 'POST', body: JSON.stringify(body) }), env, { waitUntil() {} },
  { json, verifyGoogleIdToken, profileKey: (sub) => 'profile:' + sub });

test('deletes only the caller\'s stored profile and revokes the session', async () => {
  const env = mkEnv();
  const { session } = await createSession({ sub: '123', email: 'a@b.com', email_verified: true }, env);
  assert.ok(isSessionToken(session));
  env.PROFILES.m.set('profile:123', '{"v":2}');
  env.PROFILES.m.set('profile:456', '{"v":2}');
  const res = await post(env, { idToken: session });
  assert.equal(res.status, 200);
  assert.equal(env.PROFILES.m.has('profile:123'), false);
  assert.equal(env.PROFILES.m.has('profile:456'), true);
  assert.equal([...env.PROFILES.m.keys()].some(k => k.startsWith('sess:')), false);
});

test('rejects a missing or invalid token and deletes nothing', async () => {
  const env = mkEnv();
  env.PROFILES.m.set('profile:123', '{"v":2}');
  assert.equal((await post(env, {})).status, 400);
  assert.equal((await post(env, { idToken: 'nope' })).status, 401);
  assert.equal(env.PROFILES.m.has('profile:123'), true);
});
