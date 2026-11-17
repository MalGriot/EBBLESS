// POST /beta/activity: usage counts from the app, including the first-play funnel
// (playTapped / playStarted / playFailed). Dependency-free: `npm test` in worker/.
// The Sheet (fetch) and the cache are stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleBeta } from '../src/beta.js';

const TOKEN = 't0123456789ab-' + '0'.repeat(32);

async function activity(body, { raw } = {}) {
  const sheetCalls = [];
  globalThis.fetch = async (_url, init) => {
    sheetCalls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: true, tester: { id: 't0123456789ab' } }));
  };
  const env = { SHEET_URL: 'https://sheet.test', SHEET_SECRET: 's' };
  const h = {
    json: (b, status = 200) => new Response(JSON.stringify(b), { status }),
    envCache: { match: async () => undefined, put: async () => {} },
  };
  const res = await handleBeta(
    new Request('https://w.test/beta/activity', { method: 'POST', body: raw != null ? raw : JSON.stringify(body) }),
    new URL('https://w.test/beta/activity'), env, { waitUntil() {} }, h);
  return { res, sheetCalls };
}

test('first-play counters reach the Sheet as small whole numbers', async () => {
  const { res, sheetCalls } = await activity({ token: TOKEN, sessions: 1, playTapped: 2, playStarted: 1, playFailed: 1 });
  assert.equal(res.status, 200);
  assert.equal(sheetCalls.length, 1);
  assert.equal(sheetCalls[0].action, 'activity');
  const d = sheetCalls[0].delta;
  assert.equal(d.playTapped, 2);
  assert.equal(d.playStarted, 1);
  assert.equal(d.playFailed, 1);
  assert.equal(d.sessions, 1);
});

test('first-play counters alone are enough to be recorded', async () => {
  const { sheetCalls } = await activity({ token: TOKEN, playTapped: 1 });
  assert.equal(sheetCalls.length, 1);
  assert.equal(sheetCalls[0].delta.playTapped, 1);
});

test('counters are clamped: negative, huge, fractional and non-numeric values', async () => {
  const { sheetCalls } = await activity({ token: TOKEN, sessions: 1, playTapped: 9e9, playStarted: -5, playFailed: 'abc' });
  const d = sheetCalls[0].delta;
  assert.equal(d.playTapped, 500);
  assert.equal(d.playStarted, 0);
  assert.equal(d.playFailed, 0);
  const frac = await activity({ token: TOKEN, playTapped: 2.6 });
  assert.equal(frac.sheetCalls[0].delta.playTapped, 3);
});

test('unknown fields are dropped, nothing but known counts is forwarded', async () => {
  const { sheetCalls } = await activity({ token: TOKEN, sessions: 1, playTapped: 1, trackTitle: 'x', email: 'a@b.c', features: { lyrics: 1, evil: 9 } });
  const d = sheetCalls[0].delta;
  assert.deepEqual(Object.keys(d).sort(), ['features', 'imports', 'listenSec', 'playFailed', 'playStarted', 'playTapped', 'playlists', 'sessions', 'songs']);
  assert.deepEqual(d.features, { lyrics: 1 });
});

test('an all-zero batch is accepted without calling the Sheet', async () => {
  const { res, sheetCalls } = await activity({ token: TOKEN, playTapped: 0, playStarted: 0, playFailed: 0 });
  assert.equal(res.status, 200);
  assert.equal(sheetCalls.length, 0);
});

test('a bad token is refused and never reaches the Sheet', async () => {
  const { res, sheetCalls } = await activity({ token: 'nope', playTapped: 1 });
  assert.equal(res.status, 403);
  assert.equal(sheetCalls.length, 0);
});

test('an oversized body is refused', async () => {
  const { res, sheetCalls } = await activity(null, { raw: JSON.stringify({ token: TOKEN, playTapped: 1, pad: 'x'.repeat(5000) }) });
  assert.ok(res.status >= 400 && res.status < 500);
  assert.equal(sheetCalls.length, 0);
});
