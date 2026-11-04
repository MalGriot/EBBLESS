// Shared waveform /waves tests: fake KV, cache and verifier. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleWaves, validPeaks, parseIds, encodePeaks, decodePeaks } from '../src/waves.js';

const verifyGoogleIdToken = async tok => { if (tok === 'good') return { email: 'a@b.c', email_verified: true, sub: '1' }; throw new Error('bad'); };
const shape = Array.from({ length: 64 }, (_, i) => Math.round(40 + 215 * Math.abs(Math.sin(i / 5))));
shape[10] = 255;

function setup() {
  const kv = new Map(), c = new Map(), io = { gets: 0, puts: 0 };
  const env = { GOOGLE_CLIENT_ID: 'cid', PROFILES: { get: async k => { io.gets++; return kv.get(k) ?? null; }, put: async (k, v) => { io.puts++; kv.set(k, v); } } };
  const envCache = { match: async r => (c.has(r.url) ? c.get(r.url).clone() : undefined), put: async (r, res) => { c.set(r.url, res); }, delete: async r => { c.delete(r.url); } };
  const ps = []; const ctx = { waitUntil: p => ps.push(p) };
  const call = async (method, { qs = '', token, body, origin, ip = '1.1.1.1' } = {}) => {
    const headers = { 'CF-Connecting-IP': ip };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (origin) headers.Origin = origin;
    const r = new Request('https://w.test/waves' + qs, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const res = await handleWaves(r, new URL(r.url), env, ctx, { envCache, verifyGoogleIdToken });
    await Promise.all(ps.splice(0));
    return { status: res.status, json: res.status === 204 ? null : await res.json() };
  };
  return { call, io, kv };
}

test('peaks validate: shape, range, normalised, not flat', () => {
  assert.ok(validPeaks(shape));
  assert.ok(!validPeaks(shape.slice(1)));
  assert.ok(!validPeaks(Array(64).fill(255)));
  assert.ok(!validPeaks(Array(64).fill(10)));
  assert.ok(!validPeaks(shape.map((v, i) => (i === 3 ? 300 : v))));
  assert.ok(!validPeaks(shape.map((v, i) => (i === 3 ? 1.5 : v))));
  assert.deepEqual(decodePeaks(encodePeaks(shape)), shape);
  assert.equal(decodePeaks('zz'), null);
});

test('ids: only real video ids, de-duped, capped at 20', () => {
  assert.deepEqual(parseIds('5NV6Rdv1a3I,bad,5NV6Rdv1a3I,<script>'), ['5NV6Rdv1a3I']);
  assert.equal(parseIds(Array.from({ length: 30 }, (_, i) => 'aaaaaaaaa' + String(i).padStart(2, '0')).join(',')).length, 20);
});

test('POST needs a signed-in user, then a GET returns the peaks', async () => {
  const s = setup();
  const noAuth = await s.call('POST', { body: { v: '5NV6Rdv1a3I', p: shape } });
  assert.equal(noAuth.status, 401);
  assert.equal(s.io.puts, 0);
  const ok = await s.call('POST', { token: 'good', body: { v: '5NV6Rdv1a3I', p: shape } });
  assert.equal(ok.status, 200);
  const got = await s.call('GET', { qs: '?ids=5NV6Rdv1a3I,kJQP7kiw5Fk' });
  assert.deepEqual(got.json, { '5NV6Rdv1a3I': shape });
});

test('first recording wins: a second post writes nothing', async () => {
  const s = setup();
  await s.call('POST', { token: 'good', body: { v: '5NV6Rdv1a3I', p: shape } });
  const other = shape.map(v => 255 - v + 1).map(v => Math.min(255, v)); other[0] = 255;
  const again = await s.call('POST', { token: 'good', body: { v: '5NV6Rdv1a3I', p: other } });
  assert.equal(again.json.unchanged, true);
  assert.equal(s.io.puts, 1);
  assert.deepEqual((await s.call('GET', { qs: '?ids=5NV6Rdv1a3I' })).json['5NV6Rdv1a3I'], shape);
});

test('bad bodies and oversize are refused without a write', async () => {
  const s = setup();
  assert.equal((await s.call('POST', { token: 'good', body: { v: 'short', p: shape } })).status, 400);
  assert.equal((await s.call('POST', { token: 'good', body: { v: '5NV6Rdv1a3I', p: Array(64).fill(255) } })).status, 400);
  assert.equal((await s.call('POST', { token: 'good', body: { v: '5NV6Rdv1a3I', p: shape, pad: 'x'.repeat(900) } })).status, 413);
  assert.equal(s.io.puts, 0);
});

test('a foreign origin cannot post; the per-IP cap stops a flood', async () => {
  const s = setup();
  assert.equal((await s.call('POST', { token: 'good', origin: 'https://evil.example', body: { v: '5NV6Rdv1a3I', p: shape } })).status, 403);
  let last;
  for (let i = 0; i < 40; i++) last = await s.call('POST', { body: { v: '5NV6Rdv1a3I', p: shape } });
  assert.equal(last.status, 429);
});

test('GET with no ids is empty and reads nothing', async () => {
  const s = setup();
  const r = await s.call('GET', {});
  assert.deepEqual(r.json, {});
  assert.equal(s.io.gets, 0);
});
