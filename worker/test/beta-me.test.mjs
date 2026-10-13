// /beta/me windowEndsAt tests for worker/src/beta.js (7-day tester window).
// Dependency-free: run with `npm test` in worker/ (node --test). The Sheet
// (fetch) and cache are stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleBeta, BETA_WINDOW_MS, windowEndsAt } from '../src/beta.js';

const TOKEN = 't0123456789ab-' + '0'.repeat(32);

function me(tester, token = TOKEN) {
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, tester }));
  const env = { SHEET_URL: 'https://sheet.test', SHEET_SECRET: 's' };
  const h = {
    json: (body, status = 200) => new Response(JSON.stringify(body), { status }),
    envCache: { match: async () => undefined, put: async () => {} },
  };
  return handleBeta(
    new Request('https://w.test/beta/me', { method: 'POST', body: JSON.stringify({ token }) }),
    new URL('https://w.test/beta/me'), env, { waitUntil() {} }, h);
}

test('BETA_WINDOW_MS is 14 days', () => {
  assert.equal(BETA_WINDOW_MS, 14 * 24 * 3600 * 1000);
});

test('windowEndsAt: window_anchor (else feedback_request_sent) + 14 days, or null', () => {
  assert.equal(windowEndsAt({ feedback_request_sent: 1000 }), 1000 + BETA_WINDOW_MS);
  assert.equal(windowEndsAt({ window_anchor: 500, feedback_request_sent: 1000 }), 500 + BETA_WINDOW_MS);
  assert.equal(windowEndsAt({ feedback_request_sent: null }), null);
  assert.equal(windowEndsAt({}), null);
  assert.equal(windowEndsAt(null), null);
});

test('windowEndsAt: window_days 7 shortens the window, anything else stays 14', () => {
  const day = 24 * 3600 * 1000;
  assert.equal(windowEndsAt({ feedback_request_sent: 1000, window_days: 7 }), 1000 + 7 * day);
  assert.equal(windowEndsAt({ feedback_request_sent: 1000, window_days: 14 }), 1000 + 14 * day);
  assert.equal(windowEndsAt({ feedback_request_sent: 1000, window_days: 3 }), 1000 + 14 * day);
  assert.equal(windowEndsAt({ window_days: 7 }), null);
});

test('/beta/me reports windowDays only for a 7-day tester', async () => {
  const sent = Date.UTC(2026, 9, 14);
  const day = 24 * 3600 * 1000;
  const short = await (await me({ number: 8, label: 'T8', name: 'Bo', feedback_request_sent: sent, window_days: 7 })).json();
  assert.equal(short.windowEndsAt, sent + 7 * day);
  assert.equal(short.windowDays, 7);
  const long = await (await me({ number: 9, label: 'T9', name: 'Cy', feedback_request_sent: sent, window_days: 14 })).json();
  assert.equal('windowDays' in long, false);
});

test('/beta/me returns windowEndsAt once the feedback email has gone out', async () => {
  const sent = Date.UTC(2026, 9, 1);
  const res = await me({ number: 7, label: 'T7', name: 'Ann', feedback_request_sent: sent });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data, { number: 7, label: 'T7', name: 'Ann', windowEndsAt: sent + BETA_WINDOW_MS });
});

test('/beta/me: windowEndsAt null before the feedback email (old Sheet too)', async () => {
  const data = await (await me({ number: 7, label: 'T7', name: 'Ann' })).json();
  assert.equal(data.windowEndsAt, null);
  assert.equal(data.name, 'Ann');
});

test('/beta/me for an inactive token: 404', async () => {
  const res = await me(null);
  assert.equal(res.status, 404);
});
