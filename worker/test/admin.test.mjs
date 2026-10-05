// Admin API tests for worker/src/admin.js, against a fake Sheet (no network,
// no real tester data). Run with `npm test` in worker/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAdmin, tokenMatches, checkEdit, allowedOrigin } from '../src/admin.js';

const TOKEN = 'a'.repeat(40);
const ENV = { ADMIN_TOKEN: TOKEN, SHEET_URL: 'https://sheet.invalid', SHEET_SECRET: 's' };

function fakeCache() {
  const m = new Map();
  return {
    m,
    match: async req => (m.has(req.url) ? new Response(m.get(req.url)) : undefined),
    put: async (req, res) => { m.set(req.url, await res.text()); },
  };
}
function fakeCtx() { const p = []; return { waitUntil: x => p.push(x), done: () => Promise.all(p) }; }

// Minimal stand-in for the Apps Script web app.
function fakeSheet() {
  const testers = [{ tester_id: 'tabc', tester_number: 'EBBLESS TESTER #001', name: 'Test One', notes: '', tester_status: 'Active' }];
  const calls = [];
  const fn = async (env, action, payload) => {
    calls.push({ action, payload });
    if (action === 'admin_list') return { ok: true, cap: 50, tabs: { Testers: { headers: Object.keys(testers[0]), rows: testers } } };
    if (action === 'admin_update') {
      const r = testers.find(t => t.tester_id === payload.id);
      if (!r) return { ok: true, updated: false, reason: 'not_found' };
      if ('prev' in payload && String(r[payload.column]) !== String(payload.prev)) return { ok: true, updated: false, reason: 'conflict', current: r[payload.column] };
      r[payload.column] = payload.value;
      return { ok: true, updated: true, record: { ...r }, message: '' };
    }
    throw new Error('unexpected ' + action);
  };
  return { fn, calls, testers };
}

function req(path, { method = 'GET', token = TOKEN, origin = 'https://malgriot.github.io', body, ip = '1.2.3.4' } = {}) {
  const headers = { 'CF-Connecting-IP': ip };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request('https://w.example' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function call(r, { env = ENV, sheet = fakeSheet(), cache = fakeCache(), ctx = fakeCtx() } = {}) {
  const res = await handleAdmin(r, new URL(r.url), env, ctx, { envCache: cache, sheet: sheet.fn });
  await ctx.done();
  return { res, data: res.status === 204 ? null : await res.json(), sheet, cache };
}

test('tokenMatches is exact', async () => {
  assert.equal(await tokenMatches(TOKEN, TOKEN), true);
  assert.equal(await tokenMatches(TOKEN + 'x', TOKEN), false);
  assert.equal(await tokenMatches('', TOKEN), false);
  assert.equal(await tokenMatches(undefined, TOKEN), false);
});

test('origins: app + localhost only', () => {
  assert.equal(allowedOrigin('https://malgriot.github.io'), true);
  assert.equal(allowedOrigin('http://localhost:8000'), true);
  assert.equal(allowedOrigin('http://127.0.0.1'), true);
  assert.equal(allowedOrigin('https://evil.example'), false);
  assert.equal(allowedOrigin('https://malgriot.github.io.evil.example'), false);
  assert.equal(allowedOrigin(null), false);
});

test('no ADMIN_TOKEN configured -> 503 and the Sheet is never called', async () => {
  const sheet = fakeSheet();
  for (const env of [{ ...ENV, ADMIN_TOKEN: undefined }, { ...ENV, ADMIN_TOKEN: 'short' }]) {
    const { res } = await call(req('/admin/testers'), { env, sheet });
    assert.equal(res.status, 503);
  }
  assert.equal(sheet.calls.length, 0);
});

test('missing or wrong token -> 401, no data', async () => {
  const sheet = fakeSheet();
  for (const token of [null, 'nope', TOKEN.slice(1)]) {
    const { res, data } = await call(req('/admin/testers', { token }), { sheet });
    assert.equal(res.status, 401);
    assert.equal(data.tabs, undefined);
  }
  assert.equal(sheet.calls.length, 0);
});

test('repeated wrong tokens are throttled per IP, even with the right one after', async () => {
  const cache = fakeCache();
  for (let i = 0; i < 10; i++) assert.equal((await call(req('/admin/testers', { token: 'bad' }), { cache })).res.status, 401);
  assert.equal((await call(req('/admin/testers'), { cache })).res.status, 429);
  assert.equal((await call(req('/admin/testers', { ip: '5.6.7.8' }), { cache })).res.status, 200);
});

test('foreign Origin -> 403 without CORS headers', async () => {
  const { res } = await call(req('/admin/testers', { origin: 'https://evil.example' }));
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
});

test('preflight from the app origin allows Authorization', async () => {
  const { res } = await call(req('/admin/update', { method: 'OPTIONS', token: null }));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://malgriot.github.io');
  assert.match(res.headers.get('Access-Control-Allow-Headers'), /Authorization/);
});

test('list returns tabs + editable spec, no-store, origin-scoped CORS', async () => {
  const { res, data, sheet } = await call(req('/admin/testers'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://malgriot.github.io');
  assert.equal(data.tabs.Testers.rows[0].name, 'Test One');
  assert.ok(data.editable.Testers.cols.notes);
  assert.deepEqual(sheet.calls.map(c => c.action), ['admin_list']);
});

test('list is GET only', async () => {
  assert.equal((await call(req('/admin/testers', { method: 'POST', body: {} }))).res.status, 405);
});

test('update writes one allowed cell and returns the record', async () => {
  const body = { tab: 'Testers', id: 'tabc', column: 'notes', value: '  great tester  ', prev: '' };
  const { res, data, sheet } = await call(req('/admin/update', { method: 'POST', body }));
  assert.equal(res.status, 200);
  assert.equal(data.record.notes, 'great tester');
  assert.deepEqual(sheet.calls[0], { action: 'admin_update', payload: { tab: 'Testers', id: 'tabc', column: 'notes', value: 'great tester', prev: '' } });
});

test('update rejects non-editable columns and bad values before the Sheet', async () => {
  const sheet = fakeSheet();
  const bad = [
    { tab: 'Testers', id: 'tabc', column: 'access_token', value: 'x' },
    { tab: 'Testers', id: 'tabc', column: 'tester_id', value: 'x' },
    { tab: 'Feedback', id: 'x', column: 'notes', value: 'x' },
    { tab: 'Testers', id: 'tabc', column: 'tester_status', value: 'Deleted' },
    { tab: 'Testers', id: 'tabc', column: 'exclude_from_analytics', value: 'yes' },
    { tab: 'Testers', id: 'tabc', column: 'email', value: 'not-an-email' },
    { tab: 'Testers', id: 'tabc', column: 'notes', value: 'x'.repeat(5001) },
    { tab: 'Testers', id: '', column: 'notes', value: 'x' },
  ];
  for (const body of bad) assert.equal((await call(req('/admin/update', { method: 'POST', body }), { sheet })).res.status, 400, JSON.stringify(body).slice(0, 80));
  assert.equal(sheet.calls.length, 0);
});

test('update: stale prev -> 409 with current value; unknown id -> 404', async () => {
  const sheet = fakeSheet();
  sheet.testers[0].notes = 'changed in sheet';
  let r = await call(req('/admin/update', { method: 'POST', body: { tab: 'Testers', id: 'tabc', column: 'notes', value: 'mine', prev: '' } }), { sheet });
  assert.equal(r.res.status, 409);
  assert.equal(r.data.current, 'changed in sheet');
  assert.equal(sheet.testers[0].notes, 'changed in sheet');
  r = await call(req('/admin/update', { method: 'POST', body: { tab: 'Testers', id: 'tnope', column: 'notes', value: 'x' } }), { sheet });
  assert.equal(r.res.status, 404);
});

test('Sheet failure -> 502, not a crash', async () => {
  const sheet = { fn: async () => { throw new Error('sheet down'); }, calls: [] };
  const { res, data } = await call(req('/admin/testers'), { sheet });
  assert.equal(res.status, 502);
  assert.match(data.error, /Sheet/);
});

test('checkEdit: status options and booleans', () => {
  assert.deepEqual(checkEdit('Applicants', 'applicant_status', 'Accepted'), { value: 'Accepted' });
  assert.deepEqual(checkEdit('Testers', 'exclude_from_analytics', true), { value: true });
  assert.ok(checkEdit('Applicants', 'email', 'a@b.co').error);
});
