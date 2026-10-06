// "Join the next beta" tests for worker/src/beta.js: /beta/rejoin, the
// fresh window after an accepted rejoin, and the rejoin fields on /beta/me.
// Dependency-free: run with `npm test` in worker/ (node --test). The Sheet
// (fetch) and cache are stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleBeta, BETA_WINDOW_MS, windowEndsAt, rejoinFields } from '../src/beta.js';

const TOKEN = 't0123456789ab-' + '0'.repeat(32);
const DAY = 24 * 3600 * 1000;

function call(path, body, sheetReply) {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push(JSON.parse(init.body)); return new Response(JSON.stringify({ ok: true, ...sheetReply })); };
  const env = { SHEET_URL: 'https://sheet.test', SHEET_SECRET: 's' };
  const h = {
    json: (b, status = 200) => new Response(JSON.stringify(b), { status }),
    envCache: { match: async () => undefined, put: async () => {} },
  };
  const res = handleBeta(new Request('https://w.test' + path, { method: 'POST', body: JSON.stringify(body) }),
    new URL('https://w.test' + path), env, { waitUntil() {} }, h);
  return { res, calls };
}

test('/beta/rejoin passes the token to the Sheet and reports the round date', async () => {
  const at = Date.now() + 10 * DAY;
  const { res, calls } = call('/beta/rejoin', { token: TOKEN }, { already: false, tester: { id: 'x' }, next_round_start: at, next_round_label: 'Oct 20', next_round: 2 });
  const r = await res;
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, already: false, rejoin: 'requested', feedbackGiven: true, nextRound: 2, nextRoundAt: at, nextRoundLabel: 'Oct 20' });
  assert.equal(calls[0].action, 'rejoin');
  assert.equal(calls[0].token, TOKEN);
});

test('/beta/rejoin: repeat tap is already, no date set means no date fields', async () => {
  const r = await call('/beta/rejoin', { token: TOKEN }, { already: true, tester: { id: 'x' }, next_round_start: null, next_round_label: '' }).res;
  assert.deepEqual(await r.json(), { ok: true, already: true, rejoin: 'requested', feedbackGiven: true });
});

test('/beta/rejoin: no feedback this round is refused with a reason (409)', async () => {
  const r = await call('/beta/rejoin', { token: TOKEN }, { needs_feedback: true, tester: { id: 'x' }, next_round: 3 }).res;
  assert.equal(r.status, 409);
  const d = await r.json();
  assert.equal(d.needsFeedback, true);
  assert.equal(d.feedbackGiven, false);
  assert.equal(d.nextRound, 3);
  assert.match(d.error, /feedback.*Round 3/);
  assert.ok(!/[\u2013\u2014]/.test(d.error));
});

test('/beta/rejoin: bad or inactive token is 403, Sheet never called for a bad one', async () => {
  const bad = call('/beta/rejoin', { token: 'nope' }, {});
  assert.equal((await bad.res).status, 403);
  assert.equal(bad.calls.length, 0);
  assert.equal((await call('/beta/rejoin', { token: TOKEN }, { tester: null }).res).status, 403);
});

test('windowEndsAt after an accepted rejoin', () => {
  const now = Date.UTC(2026, 9, 10);
  const sent = now - 9 * DAY;            // old window ended 2 days ago
  // accepted, round not open yet: still expired (old end)
  assert.equal(windowEndsAt({ feedback_request_sent: sent, window_start: now + 5 * DAY }, now), sent + BETA_WINDOW_MS);
  // round open: fresh 7 days from window_start
  const start = now - DAY / 2;
  assert.equal(windowEndsAt({ feedback_request_sent: sent, window_start: start }, now), start + BETA_WINDOW_MS);
  // the round's feedback email went out: 7 days from it, like a new tester
  const sent2 = start + DAY;
  assert.equal(windowEndsAt({ feedback_request_sent: sent2, window_start: start }, sent2 + 1), sent2 + BETA_WINDOW_MS);
  // no rejoin: unchanged
  assert.equal(windowEndsAt({ feedback_request_sent: sent }, now), sent + BETA_WINDOW_MS);
});

test('rejoinFields', () => {
  const now = 1000;
  assert.deepEqual(rejoinFields({}, now), {});
  assert.deepEqual(rejoinFields({ rejoin_pending: true, next_round_start: 5000, next_round_label: 'Oct 20' }, now),
    { rejoin: 'requested', nextRoundAt: 5000, nextRoundLabel: 'Oct 20' });
  assert.deepEqual(rejoinFields({ window_start: 5000, next_round_start: 500 }, now), { rejoin: 'approved' });
  assert.deepEqual(rejoinFields({ window_start: 500 }, now), {});
  assert.deepEqual(rejoinFields({ round: 1, next_round: 2, feedback_given: false }, now), { round: 1, nextRound: 2, feedbackGiven: false });
});

test('/beta/me carries rejoin state', async () => {
  const r = await call('/beta/me', { token: TOKEN }, { tester: { number: 7, label: 'T7', name: 'Ann', feedback_request_sent: 1, rejoin_pending: true, round: 1, next_round: 2, feedback_given: true } }).res;
  const d = await r.json();
  assert.equal(d.rejoin, 'requested');
  assert.equal(d.feedbackGiven, true);
  assert.equal(d.nextRound, 2);
  assert.equal(d.windowEndsAt, 1 + BETA_WINDOW_MS);
});
