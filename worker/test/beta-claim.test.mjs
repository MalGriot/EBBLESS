// /beta/claim lease tests for worker/src/beta.js (one login, every device).
// Dependency-free: run with `npm test` in worker/ (node --test). The Sheet
// (fetch), PROFILES KV, cache and Google token check are all stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleBeta, BETA_LEASE_MS } from '../src/beta.js';

const TOKEN = 't0123456789ab-' + '0'.repeat(32);

function setup({ linked = TOKEN, active = true } = {}) {
  const kv = new Map(linked ? [['betalink:sub-1', linked]] : []);
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, tester: active ? { number: 7, label: 'T7', name: 'Ann' } : null }));
  const env = {
    SHEET_URL: 'https://sheet.test', SHEET_SECRET: 's', GOOGLE_CLIENT_ID: 'cid',
    PROFILES: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } },
  };
  const h = {
    json: (body, status = 200) => new Response(JSON.stringify(body), { status }),
    envCache: { match: async () => undefined, put: async () => {} },
    verifyGoogleIdToken: async (t) => { if (t !== 'good') throw new Error('bad'); return { sub: 'sub-1' }; },
  };
  const ctx = { waitUntil() {} };
  const claim = (idToken = 'good') => handleBeta(
    new Request('https://w.test/beta/claim', { method: 'POST', body: JSON.stringify({ idToken }) }),
    new URL('https://w.test/beta/claim'), env, ctx, h);
  return { claim };
}

test('BETA_LEASE_MS is 14 days', () => {
  assert.equal(BETA_LEASE_MS, 14 * 24 * 3600 * 1000);
});

test('claim returns the token with leaseUntil = now + 14 days', async () => {
  const before = Date.now();
  const res = await setup().claim();
  const after = Date.now();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.token, TOKEN);
  assert.equal(data.number, 7);
  assert.equal(typeof data.leaseUntil, 'number');
  assert.ok(data.leaseUntil >= before + BETA_LEASE_MS && data.leaseUntil <= after + BETA_LEASE_MS);
});

test('claim for an Inactive tester or unlinked account: 404, no lease', async () => {
  for (const opts of [{ active: false }, { linked: null }]) {
    const res = await setup(opts).claim();
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.token, undefined);
    assert.equal(data.leaseUntil, undefined);
  }
});

test('claim with a bad Google token: 401', async () => {
  const res = await setup().claim('bad');
  assert.equal(res.status, 401);
});
