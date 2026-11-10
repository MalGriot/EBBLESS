// Redeem codes (worker/src/codes.js) and expiring entitlements.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mintCodes, handleRedeem, normalizeCode } from '../src/codes.js';
import { entTier } from '../src/patreon.js';
import { voiceTierFor } from '../src/voice.js';
import { handleAdmin } from '../src/admin.js';

function fakeKV() {
  const m = new Map();
  return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } };
}
const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
const ids = { a: 'ua', b: 'ub' };
const verifyIdentity = async (t) => { if (!ids[t]) throw new Error('bad'); return { sub: ids[t] }; };
const redeem = (env, token, code, limit = async () => false) => handleRedeem(
  new Request('https://w.test/redeem', { method: 'POST', body: JSON.stringify({ idToken: token, code }) }), env, { waitUntil() {} },
  { json, verifyIdentity, overIpLimit: limit });
const ent = (env, sub) => JSON.parse(env.PROFILES.m.get('ent:' + sub) || 'null');

test('minting needs a real tier and sane numbers, and stores only hashes', async () => {
  const env = { PROFILES: fakeKV() };
  assert.ok((await mintCodes(env, { tier: 'free' })).error);
  assert.ok((await mintCodes(env, { tier: 'flow', count: 51 })).error);
  assert.ok((await mintCodes(env, { tier: 'flow', days: 'x' })).error);
  const { codes } = await mintCodes(env, { tier: 'flow', count: 3 });
  assert.equal(codes.length, 3);
  assert.equal(new Set(codes).size, 3);
  assert.match(codes[0], /^FLOW-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const keys = [...env.PROFILES.m.keys()];
  assert.ok(keys.every((k) => k.startsWith('code:') && !codes.some((c) => k.includes(normalizeCode(c)))));
});
test('a code gives the tier once; a second account gets nothing; the same account is safe to repeat', async () => {
  const env = { PROFILES: fakeKV() };
  const { codes: [c] } = await mintCodes(env, { tier: 'horizon' });
  assert.deepEqual(await (await redeem(env, 'a', c.toLowerCase())).json(), { tier: 'horizon', until: null });
  assert.deepEqual(ent(env, 'ua'), { tier: 'horizon', src: 'code', at: ent(env, 'ua').at });
  assert.equal((await redeem(env, 'b', c)).status, 400);
  assert.equal(ent(env, 'ub'), null);
  const again = await (await redeem(env, 'a', c)).json();
  assert.deepEqual(again, { tier: 'horizon', already: true });
});
test('multi-use codes stop at their cap', async () => {
  const env = { PROFILES: fakeKV() };
  const { codes: [c] } = await mintCodes(env, { tier: 'flow', uses: 2 });
  ids.c = 'uc';
  assert.equal((await redeem(env, 'a', c)).status, 200);
  assert.equal((await redeem(env, 'b', c)).status, 200);
  assert.equal((await redeem(env, 'c', c)).status, 400);
  delete ids.c;
});
test('timed grants carry an end date, never extend on repeat, and expire', async () => {
  const env = { PROFILES: fakeKV() };
  const { codes: [c] } = await mintCodes(env, { tier: 'flow', days: 30 });
  const r = await (await redeem(env, 'a', c)).json();
  assert.equal(r.tier, 'flow');
  const until = ent(env, 'ua').until;
  assert.ok(until > Date.now() + 29 * 86400000 && until < Date.now() + 31 * 86400000);
  await redeem(env, 'a', c);
  assert.equal(ent(env, 'ua').until, until);
  const rec = ent(env, 'ua');
  assert.equal(entTier(rec), 'flow');
  assert.equal(entTier(rec, until + 1), 'free');
  env.PROFILES.m.set('ent:ua', JSON.stringify({ ...rec, until: Date.now() - 1 }));
  assert.equal(await voiceTierFor(env, 'ua'), 'free');
  assert.equal((await redeem(env, 'a', c)).status, 400);   // expired grant cannot be revived with the same code
});
test('an expired, unknown, short or malformed code is the same generic 400; bad token 401; throttled 429', async () => {
  const env = { PROFILES: fakeKV() };
  const { codes: [c] } = await mintCodes(env, { tier: 'flow' }, Date.now() - 40 * 86400000);
  for (const code of [c, 'FLOW-AAAA-BBBB', 'x', '']) {
    const r = await redeem(env, 'a', code);
    assert.equal(r.status, 400);
  }
  assert.equal((await redeem(env, 'zzz', 'FLOW-AAAA-BBBB')).status, 401);
  assert.equal((await redeem(env, 'a', 'FLOW-AAAA-BBBB', async () => true)).status, 429);
  assert.equal((await handleRedeem(new Request('https://w.test/redeem'), env, {}, { json, verifyIdentity, overIpLimit: async () => false })).status, 405);
});
test('a code never lowers a better grant and a permanent equal grant takes no use', async () => {
  const env = { PROFILES: fakeKV() };
  env.PROFILES.m.set('ent:ua', '{"tier":"horizon"}');
  const { codes: [c] } = await mintCodes(env, { tier: 'flow' });
  assert.deepEqual(await (await redeem(env, 'a', c)).json(), { tier: 'horizon', already: true });
  assert.equal(ent(env, 'ua').tier, 'horizon');
  assert.equal((await redeem(env, 'b', c)).status, 200);   // the use was not spent
});
test('admin mint needs the owner token and never touches the Sheet', async () => {
  const env = { PROFILES: fakeKV(), ADMIN_TOKEN: 'x'.repeat(40) };
  const envCache = { match: async () => null, put: async () => {} };
  const call = (auth, body) => handleAdmin(new Request('https://w.test/admin/codes', { method: 'POST', headers: auth ? { Authorization: 'Bearer ' + auth } : {}, body: JSON.stringify(body) }),
    new URL('https://w.test/admin/codes'), env, { waitUntil() {} }, { envCache });
  assert.equal((await call(null, { tier: 'flow' })).status, 401);
  assert.equal((await call('y'.repeat(40), { tier: 'flow' })).status, 401);
  assert.equal(env.PROFILES.m.size, 0);
  const ok = await call('x'.repeat(40), { tier: 'flow', count: 2, days: 14 });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).codes.length, 2);
  assert.equal((await call('x'.repeat(40), { tier: 'free' })).status, 400);
});

import { listGrants, setRevoked } from '../src/codes.js';
import { writeTier, handlePatreon } from '../src/patreon.js';
test('owner undo: revoke blocks sync and codes, undo lets them back, list shows who and how', async () => {
  const kv = fakeKV(); kv.list = async ({ prefix }) => ({ keys: [...kv.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true });
  const env = { PROFILES: kv };
  await writeTier(env, 'ua', 'flow', 5);
  kv.m.set('profile:ua', '{"email":"a@b.com"}');
  kv.m.set('ent:ufree', '{"tier":"free","src":"patreon","at":1}');
  let g = await listGrants(env);
  assert.deepEqual(g.grants.map((x) => [x.sub, x.email, x.tier, x.src]), [['ua', 'a@b.com', 'flow', 'patreon']]);
  assert.ok((await setRevoked(env, '../x', false)).error);
  await setRevoked(env, 'ua', false);
  assert.equal(await writeTier(env, 'ua', 'horizon'), 'free');
  const { codes: [c] } = await mintCodes(env, { tier: 'flow' });
  assert.equal((await redeem(env, 'a', c)).status, 400);
  g = await listGrants(env);
  assert.equal(g.grants[0].src, 'revoked');
  const ent2 = await handlePatreon(new Request('https://w.test/entitlement', { method: 'POST', body: '{"idToken":"a"}' }), new URL('https://w.test/entitlement'), env, {}, { json, verifyIdentity, overIpLimit: async () => false });
  assert.deepEqual(await ent2.json(), { tier: 'ebbless' });
  await setRevoked(env, 'ua', true);
  assert.equal(kv.m.has('ent:ua'), false);
  assert.equal((await redeem(env, 'a', c)).status, 200);
});
test('admin grants and revoke need the owner token', async () => {
  const kv = fakeKV(); kv.list = async () => ({ keys: [], list_complete: true });
  const env = { PROFILES: kv, ADMIN_TOKEN: 'x'.repeat(40) };
  const envCache = { match: async () => null, put: async () => {} };
  const call = (path, method, auth, body) => handleAdmin(new Request('https://w.test' + path, { method, headers: auth ? { Authorization: 'Bearer ' + auth } : {}, body: body ? JSON.stringify(body) : undefined }),
    new URL('https://w.test' + path), env, { waitUntil() {} }, { envCache });
  assert.equal((await call('/admin/grants', 'GET', null)).status, 401);
  assert.equal((await call('/admin/revoke', 'POST', 'bad', { sub: 'ua' })).status, 401);
  assert.equal(kv.m.size, 0);
  assert.equal((await call('/admin/grants', 'GET', 'x'.repeat(40))).status, 200);
  assert.equal((await call('/admin/revoke', 'POST', 'x'.repeat(40), { sub: 'ua' })).status, 200);
  assert.equal(JSON.parse(kv.m.get('ent:ua')).src, 'revoked');
});
