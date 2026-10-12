// Signup playlist handed to the app on first login (/beta/me and /beta/claim).
// Sheet (fetch), PROFILES KV, cache and Google token check are stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleBeta, signupPlaylistFields } from '../src/beta.js';

const TOKEN = 't0123456789ab-' + '0'.repeat(32);

function setup(signupPlaylist) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const b = JSON.parse(init.body);
    calls.push(b);
    const tester = { number: 7, label: 'T7', name: 'Ann', ...(b.playlist ? { signup_playlist: signupPlaylist } : {}) };
    return new Response(JSON.stringify({ ok: true, tester }));
  };
  const kv = new Map([['betalink:sub-1', TOKEN]]);
  const env = { SHEET_URL: 'https://sheet.test', SHEET_SECRET: 's', GOOGLE_CLIENT_ID: 'cid', PROFILES: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } } };
  const h = {
    json: (body, status = 200) => new Response(JSON.stringify(body), { status }),
    envCache: { match: async () => undefined, put: async () => {} },
    verifyGoogleIdToken: async () => ({ sub: 'sub-1', email: 'ann@example.com', email_verified: true }),
  };
  const post = (path, body) => handleBeta(new Request('https://w.test' + path, { method: 'POST', body: JSON.stringify(body) }), new URL('https://w.test' + path), env, { waitUntil() {} }, h);
  return { calls, post };
}

test('signupPlaylistFields: only when asked, only plain http(s) links', () => {
  assert.deepEqual(signupPlaylistFields({ signup_playlist: 'https://open.spotify.com/playlist/abc' }, true), { playlist: 'https://open.spotify.com/playlist/abc' });
  assert.deepEqual(signupPlaylistFields({ signup_playlist: 'https://open.spotify.com/playlist/abc' }, undefined), {});
  assert.deepEqual(signupPlaylistFields({ signup_playlist: 'javascript:alert(1)' }, true), {});
  assert.deepEqual(signupPlaylistFields({ signup_playlist: 'my chill mix' }, true), {});
  assert.deepEqual(signupPlaylistFields({}, true), {});
});

test('/beta/me with playlist:true returns the signup playlist and asks the Sheet for it', async () => {
  const { calls, post } = setup('https://open.spotify.com/playlist/abc');
  const r = await post('/beta/me', { token: TOKEN, playlist: true });
  assert.equal((await r.json()).playlist, 'https://open.spotify.com/playlist/abc');
  assert.equal(calls[0].playlist, true);
});

test('/beta/me without the flag never returns or requests it (later logins)', async () => {
  const { calls, post } = setup('https://open.spotify.com/playlist/abc');
  const d = await (await post('/beta/me', { token: TOKEN })).json();
  assert.equal('playlist' in d, false);
  assert.equal('playlist' in calls[0], false);
});

test('/beta/claim with playlist:true returns it; without, not', async () => {
  let t = setup('https://youtu.be/xyz');
  assert.equal((await (await t.post('/beta/claim', { idToken: 'x', playlist: true })).json()).playlist, 'https://youtu.be/xyz');
  t = setup('https://youtu.be/xyz');
  assert.equal('playlist' in (await (await t.post('/beta/claim', { idToken: 'x' })).json()), false);
});
