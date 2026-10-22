// POST /transfer: the offer/answer mailbox for device-to-device Uploads (#621).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTransfer } from '../src/transfer.js';
import { createSession, verifySession } from '../src/session.js';

function fakeKV() {
  const m = new Map();
  return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } };
}
const mkEnv = () => ({ PROFILES: fakeKV(), GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com' });
const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
const verifyGoogleIdToken = async (t, cid, env) => verifySession(t, env);
const post = (env, body) => handleTransfer(new Request('https://w.test/transfer', { method: 'POST', body: JSON.stringify(body) }), env, { waitUntil() {} }, { json, verifyGoogleIdToken });

test('offer, poll, answer, getanswer round trip for one account', async () => {
  const env = mkEnv();
  const { session } = await createSession({ sub: '123', email: 'a@b.com', email_verified: true }, env);
  assert.deepEqual(await (await post(env, { idToken: session, op: 'poll' })).json(), { offer: null });
  assert.equal((await post(env, { idToken: session, op: 'offer', room: 'room-abc123', sdp: 'v=0 offer' })).status, 200);
  const polled = await (await post(env, { idToken: session, op: 'poll' })).json();
  assert.deepEqual(polled.offer, { room: 'room-abc123', sdp: 'v=0 offer' });
  assert.equal((await post(env, { idToken: session, op: 'answer', room: 'room-abc123', sdp: 'v=0 answer' })).status, 200);
  assert.deepEqual(await (await post(env, { idToken: session, op: 'poll' })).json(), { offer: null });
  assert.deepEqual((await (await post(env, { idToken: session, op: 'getanswer', room: 'room-abc123' })).json()).answer, { sdp: 'v=0 answer' });
  assert.deepEqual(await (await post(env, { idToken: session, op: 'getanswer', room: 'room-abc123' })).json(), { answer: null });
});

test('another account never sees the offer', async () => {
  const env = mkEnv();
  const a = (await createSession({ sub: '123', email: 'a@b.com', email_verified: true }, env)).session;
  const b = (await createSession({ sub: '456', email: 'c@d.com', email_verified: true }, env)).session;
  await post(env, { idToken: a, op: 'offer', room: 'room-abc123', sdp: 'x' });
  assert.deepEqual(await (await post(env, { idToken: b, op: 'poll' })).json(), { offer: null });
});

test('rejects bad tokens, rooms and oversized descriptions', async () => {
  const env = mkEnv();
  const { session } = await createSession({ sub: '123', email: 'a@b.com', email_verified: true }, env);
  assert.equal((await post(env, {})).status, 400);
  assert.equal((await post(env, { idToken: 'nope', op: 'poll' })).status, 401);
  assert.equal((await post(env, { idToken: session, op: 'offer', room: 'x', sdp: 'y' })).status, 400);
  assert.equal((await post(env, { idToken: session, op: 'offer', room: 'room-abc123', sdp: 'y'.repeat(20000) })).status, 400);
  assert.equal((await post(env, { idToken: session, op: 'nope' })).status, 400);
});
