// /beta/google redirect sign-in (iPhone home-screen app). Stubs like beta-claim.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleBeta } from '../src/beta.js';

const TOKEN = 't0123456789ab-' + '0'.repeat(32);
const APP = 'https://malgriot.github.io/EBBLESS/';

function run({ linked = TOKEN, cred = 'good', csrfOk = true, r = APP, method = 'POST' } = {}) {
  const kv = new Map(linked ? [['betalink:sub-1', linked]] : []);
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, tester: { number: 7, label: 'T7', name: 'Ann' } }));
  const env = { SHEET_URL: 'https://sheet.test', SHEET_SECRET: 's', GOOGLE_CLIENT_ID: 'cid',
    PROFILES: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } } };
  const h = { json: (b, s = 200) => new Response(JSON.stringify(b), { status: s }),
    envCache: { match: async () => undefined, put: async () => {} },
    verifyGoogleIdToken: async (t) => { if (t !== 'good') throw new Error('bad'); return { sub: 'sub-1', email: 'ann@example.com', email_verified: true }; } };
  const body = new URLSearchParams({ credential: cred, g_csrf_token: csrfOk ? 'abc' : 'zzz' });
  const url = new URL('https://w.test/beta/google?r=' + encodeURIComponent(r));
  return handleBeta(new Request(url, { method, body: method === 'POST' ? body : undefined, headers: { Cookie: 'g_csrf_token=abc' } }), url, env, { waitUntil() {} }, h);
}

test('redirect sign-in of a tester goes back to the app with ?t=', async () => {
  const res = await run();
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), APP + '?t=' + TOKEN);
});
test('not on the list, bad credential, bad csrf: back with bl_err, no token', async () => {
  for (const o of [{ linked: null }, { cred: 'bad' }, { csrfOk: false }]) {
    const res = await run(o);
    assert.equal(res.status, 302);
    assert.match(res.headers.get('Location'), /\?bl_err=/);
    assert.ok(!res.headers.get('Location').includes('t0123456789ab'));
  }
});
test('return URL must be the app: no open redirect', async () => {
  assert.equal((await run({ r: 'https://evil.example/' })).status, 404);
  assert.equal((await run({ method: 'GET' })).status, 404);
});
