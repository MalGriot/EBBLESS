// /beta/claim lease tests for worker/src/beta.js (one login, every device).
// Dependency-free: run with `npm test` in worker/ (node --test). The Sheet
// (fetch), PROFILES KV, cache and Google token check are all stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleBeta, BETA_LEASE_MS } from '../src/beta.js';

const TOKEN = 't0123456789ab-' + '0'.repeat(32);

const EMAIL_TOKEN = 't0123456789ab-' + '1'.repeat(32);

// byEmail: what the Sheet's token_by_email answers for ann@example.com
// ('match', 'none', or 'old' = a Sheet script without that action).
function setup({ linked = TOKEN, active = true, email = 'Ann@Example.com', emailVerified = true, byEmail = 'none' } = {}) {
  const kv = new Map(linked ? [['betalink:sub-1', linked]] : []);
  const calls = [];
  const tester = { number: 7, label: 'T7', name: 'Ann' };
  globalThis.fetch = async (url, init) => {
    const b = JSON.parse(init.body);
    calls.push(b);
    if (b.action === 'token_by_email') {
      if (byEmail === 'old') return new Response(JSON.stringify({ ok: false, error: 'unknown action' }));
      const hit = byEmail === 'match' && b.email === 'ann@example.com';
      return new Response(JSON.stringify(hit ? { ok: true, token: EMAIL_TOKEN, tester } : { ok: true, tester: null }));
    }
    return new Response(JSON.stringify({ ok: true, tester: active ? tester : null }));
  };
  const env = {
    SHEET_URL: 'https://sheet.test', SHEET_SECRET: 's', GOOGLE_CLIENT_ID: 'cid',
    PROFILES: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } },
  };
  const h = {
    json: (body, status = 200) => new Response(JSON.stringify(body), { status }),
    envCache: { match: async () => undefined, put: async () => {} },
    verifyGoogleIdToken: async (t) => { if (t !== 'good') throw new Error('bad'); return { sub: 'sub-1', email, email_verified: emailVerified }; },
  };
  const ctx = { waitUntil() {} };
  const claim = (idToken = 'good') => handleBeta(
    new Request('https://w.test/beta/claim', { method: 'POST', body: JSON.stringify({ idToken }) }),
    new URL('https://w.test/beta/claim'), env, ctx, h);
  return { claim, kv, calls };
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

test('unlinked account whose verified email got the invite: claims and links', async () => {
  const { claim, kv, calls } = setup({ linked: null, byEmail: 'match' });
  const res = await claim();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.token, EMAIL_TOKEN);
  assert.equal(typeof data.leaseUntil, 'number');
  assert.equal(kv.get('betalink:sub-1'), EMAIL_TOKEN);
  assert.equal(calls.find(c => c.action === 'token_by_email').email, 'ann@example.com');
});

test('linked token gone Inactive falls back to the email match', async () => {
  const { claim } = setup({ active: false, byEmail: 'match' });
  const res = await claim();
  assert.equal(res.status, 200);
  assert.equal((await res.json()).token, EMAIL_TOKEN);
});

test('email match is skipped for an unverified email, and a miss or old Sheet is a 404', async () => {
  const unverified = setup({ linked: null, byEmail: 'match', emailVerified: false });
  assert.equal((await unverified.claim()).status, 404);
  assert.equal(unverified.calls.some(c => c.action === 'token_by_email'), false);
  for (const byEmail of ['none', 'old']) {
    const { claim, kv } = setup({ linked: null, byEmail });
    const res = await claim();
    assert.equal(res.status, 404);
    assert.equal(kv.size, 0);
  }
});

test('a linked, Active account never asks the Sheet by email', async () => {
  const { claim, calls } = setup({ byEmail: 'match' });
  assert.equal((await (await claim()).json()).token, TOKEN);
  assert.equal(calls.some(c => c.action === 'token_by_email'), false);
});
