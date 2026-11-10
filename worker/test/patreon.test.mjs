// Patreon connection, tier mapping, /entitlement check-in (worker/src/patreon.js).
// Dependency-free: `npm test` in worker/. KV, Patreon and sign-in are stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { handlePatreon, tierFromIdentity, publicTier, writeTier, syncTier, configOf, seal, RECHECK_MS } from '../src/patreon.js';
import { md5, hmacMd5Hex } from '../src/md5.js';

function fakeKV() {
  const m = new Map(), puts = [];
  return { m, puts,
    get: async (k) => (m.has(k) ? m.get(k) : null),
    put: async (k, v, o) => { m.set(k, v); puts.push(k); },
    delete: async (k) => { m.delete(k); } };
}
const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
const mkEnv = (extra = {}) => ({
  PROFILES: fakeKV(), PATREON_CLIENT_ID: 'cid', PATREON_CLIENT_SECRET: 'sec', PATREON_WEBHOOK_SECRET: 'whsec',
  PATREON_REDIRECT_URI: 'https://w.test/patreon/callback', PATREON_RETURN_URL: 'https://app.test/',
  PATREON_CAMPAIGN_ID: '99', PATREON_FLOW_CENTS: '500', PATREON_HORIZON_CENTS: '1500',
  PATREON_TOKEN_KEY: randomBytes(32).toString('base64'), ...extra });
const cfgOf = (env) => configOf(env);
const verifyIdentity = async (t) => { if (t !== 'good') throw new Error('bad'); return { sub: 'u1' }; };
const ctx = { waitUntil(p) { p.catch(() => {}); } };
const noLimit = async () => false;
const member = (cents, status = 'active_patron', camp = '99') => ({ type: 'member', attributes: { patron_status: status, currently_entitled_amount_cents: cents }, relationships: { campaign: { data: { id: camp } } } });
const identityOf = (...members) => ({ data: { id: '555' }, included: members });
function mkFetch(identity, { tokenStatus = 200, idStatus = 200 } = {}) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push(String(url));
    if (String(url).endsWith('/token')) return tokenStatus === 200 ? new Response(JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_in: 2592000 })) : new Response('{}', { status: tokenStatus });
    return new Response(JSON.stringify(identity), { status: idStatus });
  };
  fn.calls = calls; return fn;
}
const call = (env, path, { method = 'POST', body, fetchFn, headers, limit = noLimit } = {}) => handlePatreon(
  new Request('https://w.test' + path, { method, headers, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }),
  new URL('https://w.test' + path), env, ctx, { json, verifyIdentity, overIpLimit: limit, fetchFn });

// ---- md5 ----
test('md5 and hmac-md5 match node crypto', () => {
  const hex = (u) => Buffer.from(u).toString('hex');
  assert.equal(hex(md5(new Uint8Array())), 'd41d8cd98f00b204e9800998ecf8427e');
  const big = randomBytes(1000);
  assert.equal(hmacMd5Hex('key', big), createHmac('md5', 'key').update(big).digest('hex'));
  assert.equal(hmacMd5Hex('k'.repeat(100), Buffer.from('x')), createHmac('md5', 'k'.repeat(100)).update('x').digest('hex'));
});

// ---- tier mapping ----
test('pledge amount maps to ebbless / flow / horizon, only for our active campaign', () => {
  const cfg = cfgOf(mkEnv());
  assert.equal(tierFromIdentity(identityOf(), cfg), 'free');
  assert.equal(tierFromIdentity(identityOf(member(499)), cfg), 'free');
  assert.equal(tierFromIdentity(identityOf(member(500)), cfg), 'flow');
  assert.equal(tierFromIdentity(identityOf(member(1499)), cfg), 'flow');
  assert.equal(tierFromIdentity(identityOf(member(1500)), cfg), 'horizon');
  assert.equal(tierFromIdentity(identityOf(member(5000, 'former_patron')), cfg), 'free');
  assert.equal(tierFromIdentity(identityOf(member(5000, 'declined_patron')), cfg), 'free');
  assert.equal(tierFromIdentity(identityOf(member(5000, 'active_patron', '1')), cfg), 'free');
  assert.equal(tierFromIdentity(identityOf(member(5000, 'active_patron', '1'), member(600)), cfg), 'flow');
  assert.equal(tierFromIdentity(null, cfg), 'free');
  assert.equal(tierFromIdentity({ included: [null, {}, { type: 'member' }] }, cfg), 'free');
});
test('public tier names', () => {
  assert.deepEqual(['free', 'paid', 'flow', 'horizon', 'weird', undefined].map(publicTier), ['ebbless', 'flow', 'flow', 'horizon', 'ebbless', 'ebbless']);
});
test('config needs everything, https URLs, horizon >= flow', () => {
  assert.ok(cfgOf(mkEnv()));
  assert.equal(cfgOf(mkEnv({ PATREON_CLIENT_SECRET: '' })), null);
  assert.equal(cfgOf(mkEnv({ PATREON_REDIRECT_URI: 'http://w.test/cb' })), null);
  assert.equal(cfgOf(mkEnv({ PATREON_HORIZON_CENTS: '100' })), null);
});

// ---- entitlement writes ----
test('writeTier is idempotent and never lowers a hand-written grant', async () => {
  const env = mkEnv();
  await writeTier(env, 'u1', 'flow', 1000);
  await writeTier(env, 'u1', 'flow', 1000);
  assert.equal(env.PROFILES.m.get('ent:u1'), JSON.stringify({ tier: 'flow', src: 'patreon', at: 1000 }));
  env.PROFILES.m.set('ent:u2', '{"tier":"horizon"}');
  assert.equal(await writeTier(env, 'u2', 'free'), 'horizon');
  assert.equal(env.PROFILES.m.get('ent:u2'), '{"tier":"horizon"}');
  env.PROFILES.m.set('ent:u3', '{"tier":"flow"}');
  await writeTier(env, 'u3', 'horizon');   // an upgrade from Patreon is allowed
  assert.equal(JSON.parse(env.PROFILES.m.get('ent:u3')).tier, 'horizon');
});

// ---- connect / callback ----
test('connect needs a verified token and returns an authorize URL with one-time state', async () => {
  const env = mkEnv();
  assert.equal((await call(env, '/patreon/connect', { body: { idToken: 'nope' } })).status, 401);
  assert.equal((await call(env, '/patreon/connect', { body: {} })).status, 400);
  const r = await call(env, '/patreon/connect', { body: { idToken: 'good' } });
  const u = new URL((await r.json()).url);
  assert.equal(u.origin + u.pathname, 'https://www.patreon.com/oauth2/authorize');
  assert.equal(u.searchParams.get('client_id'), 'cid');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://w.test/patreon/callback');
  assert.equal(env.PROFILES.m.get('pstate:' + u.searchParams.get('state')), 'u1');
});
test('callback links the pledge, writes the tier, stores tokens encrypted, state is single use', async () => {
  const env = mkEnv();
  const state = 'a'.repeat(64);
  env.PROFILES.m.set('pstate:' + state, 'u1');
  const f = mkFetch(identityOf(member(1500)));
  const r = await call(env, `/patreon/callback?code=abc&state=${state}`, { method: 'GET', fetchFn: f });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('Location'), 'https://app.test/?patreon=ok');
  assert.equal(JSON.parse(env.PROFILES.m.get('ent:u1')).tier, 'horizon');
  assert.equal(env.PROFILES.m.get('patid:555'), 'u1');
  const stored = env.PROFILES.m.get('pat:u1');
  assert.ok(!stored.includes('"A"') && !stored.includes('"R"'));
  assert.equal(env.PROFILES.m.has('pstate:' + state), false);
  const again = await call(env, `/patreon/callback?code=abc&state=${state}`, { method: 'GET', fetchFn: f });
  assert.equal(again.headers.get('Location'), 'https://app.test/?patreon=error');
});
test('callback rejects bad state and a Patreon account already linked to someone else', async () => {
  const env = mkEnv();
  const f = mkFetch(identityOf(member(600)));
  for (const q of ['code=x&state=zz', 'state=' + 'b'.repeat(64), 'code=x&state=' + 'c'.repeat(64)]) {
    const r = await call(env, '/patreon/callback?' + q, { method: 'GET', fetchFn: f });
    assert.equal(r.headers.get('Location'), 'https://app.test/?patreon=error');
  }
  assert.equal(f.calls.length, 0);
  env.PROFILES.m.set('patid:555', 'other');
  env.PROFILES.m.set('pstate:' + 'd'.repeat(64), 'u1');
  const r = await call(env, '/patreon/callback?code=x&state=' + 'd'.repeat(64), { method: 'GET', fetchFn: f });
  assert.equal(r.headers.get('Location'), 'https://app.test/?patreon=taken');
  assert.equal(env.PROFILES.m.has('ent:u1'), false);
});
test('callback survives a Patreon failure with a generic redirect', async () => {
  const env = mkEnv();
  env.PROFILES.m.set('pstate:' + 'e'.repeat(64), 'u1');
  const r = await call(env, '/patreon/callback?code=x&state=' + 'e'.repeat(64), { method: 'GET', fetchFn: mkFetch({}, { tokenStatus: 400 }) });
  assert.equal(r.headers.get('Location'), 'https://app.test/?patreon=error');
});

// ---- /entitlement and check-in ----
test('entitlement answers from the verified token, never the body', async () => {
  const env = mkEnv();
  env.PROFILES.m.set('ent:u1', '{"tier":"flow"}');
  env.PROFILES.m.set('ent:u2', '{"tier":"horizon"}');
  const r = await call(env, '/entitlement', { body: { idToken: 'good', sub: 'u2', tier: 'horizon' } });
  assert.deepEqual(await r.json(), { tier: 'flow' });
  assert.equal((await call(env, '/entitlement', { body: { idToken: 'bad' } })).status, 401);
  assert.equal((await call(env, '/entitlement', { method: 'GET' })).status, 405);
  assert.equal((await call(env, '/entitlement', { body: '{nope' })).status, 400);
});
test('unknown or absent record is ebbless, and works with Patreon unconfigured', async () => {
  const env = { PROFILES: fakeKV() };
  assert.deepEqual(await (await call(env, '/entitlement', { body: { idToken: 'good' } })).json(), { tier: 'ebbless' });
  env.PROFILES.m.set('ent:u1', 'garbage');
  assert.deepEqual(await (await call(env, '/entitlement', { body: { idToken: 'good' } })).json(), { tier: 'ebbless' });
  assert.equal((await call(env, '/patreon/connect', { body: { idToken: 'good' } })).status, 503);
});
test('entitlement is throttled per IP', async () => {
  const env = mkEnv();
  assert.equal((await call(env, '/entitlement', { body: { idToken: 'good' }, limit: async () => true })).status, 429);
});
test('check-in: a stale patron is re-verified, upgrades and lapses apply, repeats are safe', async () => {
  const env = mkEnv(), cfg = cfgOf(env);
  env.PROFILES.m.set('pat:u1', JSON.stringify({ pid: '555', tok: await seal({ at: 'A', rt: 'R', exp: Date.now() + 10 * RECHECK_MS }, cfg) }));
  env.PROFILES.m.set('ent:u1', JSON.stringify({ tier: 'flow', src: 'patreon', at: Date.now() - 2 * RECHECK_MS }));
  const up = mkFetch(identityOf(member(2000)));
  assert.deepEqual(await (await call(env, '/entitlement', { body: { idToken: 'good' }, fetchFn: up })).json(), { tier: 'horizon' });
  assert.equal(up.calls.length, 1);
  // fresh now: no more Patreon calls however often it is asked
  await call(env, '/entitlement', { body: { idToken: 'good' }, fetchFn: up });
  assert.equal(up.calls.length, 1);
  // lapse
  env.PROFILES.m.set('ent:u1', JSON.stringify({ tier: 'horizon', src: 'patreon', at: 0 }));
  const gone = mkFetch(identityOf(member(2000, 'former_patron')));
  assert.deepEqual(await (await call(env, '/entitlement', { body: { idToken: 'good' }, fetchFn: gone })).json(), { tier: 'ebbless' });
});
test('check-in: a Patreon outage keeps the current tier; a revoked link drops to ebbless', async () => {
  const env = mkEnv(), cfg = cfgOf(env);
  const tok = async (exp) => JSON.stringify({ pid: '555', tok: await seal({ at: 'A', rt: 'R', exp }, cfg) });
  env.PROFILES.m.set('pat:u1', await tok(Date.now() + 10 * RECHECK_MS));
  env.PROFILES.m.set('ent:u1', JSON.stringify({ tier: 'flow', src: 'patreon', at: 0 }));
  const down = mkFetch({}, { idStatus: 503 });
  assert.deepEqual(await (await call(env, '/entitlement', { body: { idToken: 'good' }, fetchFn: down })).json(), { tier: 'flow' });
  env.PROFILES.m.set('pat:u1', await tok(0));   // token due for refresh, Patreon says no
  env.PROFILES.m.set('patid:555', 'u1');
  const revoked = mkFetch({}, { tokenStatus: 401 });
  assert.deepEqual(await (await call(env, '/entitlement', { body: { idToken: 'good' }, fetchFn: revoked })).json(), { tier: 'ebbless' });
  assert.equal(env.PROFILES.m.has('pat:u1'), false);
  assert.equal(env.PROFILES.m.has('patid:555'), false);
});
test('check-in skips hand-written grants', async () => {
  const env = mkEnv(), cfg = cfgOf(env);
  env.PROFILES.m.set('ent:u1', '{"tier":"horizon"}');
  env.PROFILES.m.set('pat:u1', JSON.stringify({ pid: '555', tok: await seal({ at: 'A', rt: 'R', exp: Date.now() + 10 * RECHECK_MS }, cfg) }));
  const f = mkFetch(identityOf());
  assert.deepEqual(await (await call(env, '/entitlement', { body: { idToken: 'good' }, fetchFn: f })).json(), { tier: 'horizon' });
  assert.equal(f.calls.length, 0);
});
test('syncTier returns null for a user with no Patreon link', async () => {
  const env = mkEnv();
  assert.equal(await syncTier(env, cfgOf(env), 'nobody', mkFetch({})), null);
});

// ---- disconnect ----
test('disconnect forgets the link and drops to ebbless', async () => {
  const env = mkEnv(), cfg = cfgOf(env);
  env.PROFILES.m.set('pat:u1', JSON.stringify({ pid: '555', tok: await seal({ at: 'A', rt: 'R', exp: 1 }, cfg) }));
  env.PROFILES.m.set('patid:555', 'u1');
  env.PROFILES.m.set('ent:u1', JSON.stringify({ tier: 'flow', src: 'patreon', at: 1 }));
  assert.equal((await call(env, '/patreon/disconnect', { body: { idToken: 'good' } })).status, 200);
  assert.equal(env.PROFILES.m.has('pat:u1'), false);
  assert.equal(env.PROFILES.m.has('patid:555'), false);
  assert.equal(JSON.parse(env.PROFILES.m.get('ent:u1')).tier, 'free');
  assert.equal((await call(env, '/patreon/disconnect', { body: { idToken: 'bad' } })).status, 401);
});

// ---- webhook ----
test('webhook needs a valid signature, then re-verifies that patron from Patreon', async () => {
  const env = mkEnv(), cfg = cfgOf(env);
  env.PROFILES.m.set('pat:u1', JSON.stringify({ pid: '555', tok: await seal({ at: 'A', rt: 'R', exp: Date.now() + 10 * RECHECK_MS }, cfg) }));
  env.PROFILES.m.set('patid:555', 'u1');
  const raw = JSON.stringify({ data: { relationships: { user: { data: { id: '555' } } } } });
  const sig = createHmac('md5', 'whsec').update(raw).digest('hex');
  const f = mkFetch(identityOf(member(700)));
  assert.equal((await call(env, '/patreon/webhook', { body: raw, fetchFn: f })).status, 403);
  assert.equal((await call(env, '/patreon/webhook', { body: raw, headers: { 'X-Patreon-Signature': 'x'.repeat(32) }, fetchFn: f })).status, 403);
  assert.equal(f.calls.length, 0);
  const ok = await call(env, '/patreon/webhook', { body: raw, headers: { 'X-Patreon-Signature': sig }, fetchFn: f });
  assert.equal(ok.status, 200);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(JSON.parse(env.PROFILES.m.get('ent:u1')).tier, 'flow');
  // unknown patron and replays are harmless
  const raw2 = JSON.stringify({ data: { relationships: { user: { data: { id: '777' } } } } });
  const r2 = await call(env, '/patreon/webhook', { body: raw2, headers: { 'X-Patreon-Signature': createHmac('md5', 'whsec').update(raw2).digest('hex') }, fetchFn: f });
  assert.equal(r2.status, 200);
  assert.equal((await call(env, '/patreon/webhook', { method: 'GET' })).status, 405);
});
