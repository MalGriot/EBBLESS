// /beta/google redirect sign-in (iPhone home-screen app). Stubs like beta-claim.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleBeta } from '../src/beta.js';

const TOKEN = 't0123456789ab-' + '0'.repeat(32);
const APP = 'https://malgriot.github.io/EBBLESS/';

let lastKv;
function run({ linked = TOKEN, cred = 'good', csrfOk = true, r = APP, method = 'POST' } = {}) {
  const kv = new Map(linked ? [['betalink:sub-1', linked]] : []);
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, tester: { number: 7, label: 'T7', name: 'Ann' } }));
  lastKv = kv;
  const env = { SHEET_URL: 'https://sheet.test', SHEET_SECRET: 's', GOOGLE_CLIENT_ID: 'cid',
    PROFILES: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } } };
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
  assert.match(res.headers.get('Location'), new RegExp('^' + APP + '\\?t=' + TOKEN + '&c=[0-9a-f]{32}$'));
});
function exchange(code, kv) {
  const env = { SHEET_URL: 'https://sheet.test', SHEET_SECRET: 's', PROFILES: { get: async (k) => kv.get(k) ?? null, put: async () => {}, delete: async (k) => { kv.delete(k); } } };
  const h = { json: (b, s = 200) => new Response(JSON.stringify(b), { status: s }), envCache: { match: async () => undefined, put: async () => {} } };
  const url = new URL('https://w.test/beta/google/exchange');
  return handleBeta(new Request(url, { method: 'POST', body: JSON.stringify({ code }) }), url, env, { waitUntil() {} }, h);
}
test('redirect also stores a one-time code that exchanges once for the ID token', async () => {
  const loc = (await run()).headers.get('Location');
  const code = /&c=([0-9a-f]{32})$/.exec(loc)[1];
  assert.ok(!loc.includes('good'), 'raw credential never in the URL');
  const ok = await exchange(code, lastKv);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { idToken: 'good' });
  assert.equal((await exchange(code, lastKv)).status, 404);
  assert.equal((await exchange('nothex', lastKv)).status, 400);
});
test('failed sign-in sets no code', async () => {
  for (const o of [{ linked: null }, { cred: 'bad' }]) {
    const res = await run(o);
    assert.ok(!/[?&]c=/.test(res.headers.get('Location')));
    assert.ok(![...lastKv.keys()].some(k => k.startsWith('bgcode:')));
  }
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
