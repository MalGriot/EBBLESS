// /beta/signup tests for worker/src/beta.js: Sign up with Google stores the
// verified Google email (google_email), which later is the tester's access.
// Dependency-free: run with `npm test` in worker/. Sheet, cache and the
// Google token check are stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleBeta } from '../src/beta.js';

const ANSWERS = { devices: ['iPhone'], browsers: ['Safari'], comfort: 'Not very technical', platforms: ['Spotify'], agree: true };

function setup({ email = 'Ann.Lee@Gmail.com ', emailVerified = true } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: true, status: 'Pending' }));
  };
  const env = { SHEET_URL: 'https://sheet.test', SHEET_SECRET: 's', GOOGLE_CLIENT_ID: 'cid' };
  const h = {
    json: (body, status = 200) => new Response(JSON.stringify(body), { status }),
    envCache: { match: async () => undefined, put: async () => {} },
    verifyGoogleIdToken: async (t, cid) => {
      if (t !== 'good' || cid !== 'cid') throw new Error('bad');
      return { sub: 'sub-1', email, email_verified: emailVerified, name: 'Ann Lee' };
    },
  };
  const signup = (body) => handleBeta(
    new Request('https://w.test/beta/signup', { method: 'POST', body: JSON.stringify(body) }),
    new URL('https://w.test/beta/signup'), env, { waitUntil() {} }, h);
  const applicant = () => calls.find(c => c.action === 'signup').applicant;
  return { signup, calls, applicant };
}

test('Google signup: no name/email needed, verified email stored as google_email and email', async () => {
  const s = setup();
  const res = await s.signup({ ...ANSWERS, idToken: 'good' });
  assert.equal(res.status, 200);
  const a = s.applicant();
  assert.equal(a.google_email, 'ann.lee@gmail.com');
  assert.equal(a.email, 'ann.lee@gmail.com');
  assert.equal(a.name, 'Ann Lee');
});

test('Google signup: the verified email wins over a typed one, a typed name is kept', async () => {
  const s = setup();
  await s.signup({ ...ANSWERS, idToken: 'good', name: 'Annie', email: 'someone@else.com' });
  assert.equal(s.applicant().email, 'ann.lee@gmail.com');
  assert.equal(s.applicant().name, 'Annie');
});

test('Google signup with a bad token: 401, nothing stored', async () => {
  const s = setup();
  const res = await s.signup({ ...ANSWERS, idToken: 'forged', name: 'Ann', email: 'ann@example.com' });
  assert.equal(res.status, 401);
  assert.equal(s.calls.length, 0);
});

test('Google signup with an unverified email: 400, nothing stored', async () => {
  const s = setup({ emailVerified: false });
  const res = await s.signup({ ...ANSWERS, idToken: 'good' });
  assert.equal(res.status, 400);
  assert.equal(s.calls.length, 0);
});

test('email signup still works, with a blank google_email', async () => {
  const s = setup();
  const res = await s.signup({ ...ANSWERS, name: 'Ann', email: 'Ann@Example.com' });
  assert.equal(res.status, 200);
  assert.equal(s.applicant().email, 'ann@example.com');
  assert.equal(s.applicant().google_email, '');
});

test('email signup without name or email: 400', async () => {
  const s = setup();
  assert.equal((await s.signup({ ...ANSWERS, email: 'ann@example.com' })).status, 400);
  assert.equal((await s.signup({ ...ANSWERS, name: 'Ann' })).status, 400);
  assert.equal(s.calls.length, 0);
});
