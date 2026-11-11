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
  PATREON_CAMPAIGN_ID: '99', PATREON_FLOW_CENTS: '300', PATREON_DEEP_CENTS: '700', PATREON_HORIZON_CENTS: '1500',
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
const call = (env, path, { method = 'POST', body, fetchFn, headers, limit = noLimit, sendMail } = {}) => handlePatreon(
  new Request('https://w.test' + path, { method, headers, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }),
  new URL('https://w.test' + path), env, ctx, { json, verifyIdentity, overIpLimit: limit, fetchFn, sendMail });

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
  assert.equal(tierFromIdentity(identityOf(member(299)), cfg), 'free');
  assert.equal(tierFromIdentity(identityOf(member(300)), cfg), 'flow');
  assert.equal(tierFromIdentity(identityOf(member(699)), cfg), 'flow');
  assert.equal(tierFromIdentity(identityOf(member(700)), cfg), 'deep');
  assert.equal(tierFromIdentity(identityOf(member(1499)), cfg), 'deep');
  assert.equal(tierFromIdentity(identityOf(member(1500)), cfg), 'horizon');
  assert.equal(tierFromIdentity(identityOf(member(5000, 'former_patron')), cfg), 'free');
  assert.equal(tierFromIdentity(identityOf(member(5000, 'declined_patron')), cfg), 'free');
  assert.equal(tierFromIdentity(identityOf(member(5000, 'active_patron', '1')), cfg), 'free');
  assert.equal(tierFromIdentity(identityOf(member(5000, 'active_patron', '1'), member(600)), cfg), 'flow');
  assert.equal(tierFromIdentity(null, cfg), 'free');
  assert.equal(tierFromIdentity({ included: [null, {}, { type: 'member' }] }, cfg), 'free');
});
test('public tier names', () => {
  assert.deepEqual(['free', 'paid', 'flow', 'deep', 'horizon', 'weird', undefined].map(publicTier), ['discovery', 'flow', 'flow', 'deep', 'horizon', 'discovery', 'discovery']);
});
test('config needs everything, https URLs, horizon >= flow', () => {
  assert.ok(cfgOf(mkEnv()));
  assert.equal(cfgOf(mkEnv({ PATREON_CLIENT_SECRET: '' })), null);
  assert.equal(cfgOf(mkEnv({ PATREON_REDIRECT_URI: 'http://w.test/cb' })), null);
  assert.equal(cfgOf(mkEnv({ PATREON_HORIZON_CENTS: '100' })), null);
  assert.equal(cfgOf(mkEnv({ PATREON_DEEP_CENTS: '300' })), null);
  assert.equal(cfgOf(mkEnv({ PATREON_DEEP_CENTS: '' })), null);
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
  assert.deepEqual(await (await call(env, '/entitlement', { body: { idToken: 'good' } })).json(), { tier: 'discovery' });
  env.PROFILES.m.set('ent:u1', 'garbage');
  assert.deepEqual(await (await call(env, '/entitlement', { body: { idToken: 'good' } })).json(), { tier: 'discovery' });
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
  assert.deepEqual(await (await call(env, '/entitlement', { body: { idToken: 'good' }, fetchFn: gone })).json(), { tier: 'discovery' });
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
  assert.deepEqual(await (await call(env, '/entitlement', { body: { idToken: 'good' }, fetchFn: revoked })).json(), { tier: 'discovery' });
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
  const f = mkFetch(identityOf(member(400)));
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

// ---- thank-you email per payment ----
const paid = (over = {}) => JSON.stringify({ data: { attributes: { patron_status: 'active_patron', last_charge_status: 'Paid', last_charge_date: '2026-11-11T10:00:00.000+00:00',
  currently_entitled_amount_cents: 600, email: 'pat@example.com', ...over }, relationships: { user: { data: { id: '555' } }, campaign: { data: { id: '99' } } } } });
const signed = (raw) => ({ 'X-Patreon-Signature': createHmac('md5', 'whsec').update(raw).digest('hex') });
test('a paid month emails one personal code, once per payment, with the right tier', async () => {
  const env = mkEnv(); const sent = [];
  const sendMail = async (e, to, tier, code) => { sent.push([to, tier, code]); };
  const raw = paid();
  assert.equal((await call(env, '/patreon/webhook', { body: raw, headers: signed(raw), sendMail })).status, 200);
  assert.equal((await call(env, '/patreon/webhook', { body: raw, headers: signed(raw), sendMail })).status, 200);   // Patreon retry
  assert.equal(sent.length, 1);
  assert.deepEqual([sent[0][0], sent[0][1]], ['pat@example.com', 'flow']);
  assert.match(sent[0][2], /^FLOW-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const next = paid({ last_charge_date: '2026-12-11T10:00:00.000+00:00', currently_entitled_amount_cents: 2000 });
  await call(env, '/patreon/webhook', { body: next, headers: signed(next), sendMail });
  assert.equal(sent.length, 2);
  assert.equal(sent[1][1], 'horizon');
  assert.ok(![...env.PROFILES.m.values()].some((v) => v.includes('pat@example.com')));   // address never stored
  // the code really redeems, once
  const { handleRedeem } = await import('../src/codes.js');
  const redeem = (tok) => handleRedeem(new Request('https://w.test/redeem', { method: 'POST', body: JSON.stringify({ idToken: tok, code: sent[0][2] }) }), env, {}, { json, verifyIdentity: async (t) => ({ sub: t }), overIpLimit: noLimit });
  assert.equal((await redeem('p1')).status, 200);
  assert.equal((await redeem('p2')).status, 400);
});
test('no mail for unpaid, lapsed, below-flow, other-campaign, bad-email or unsigned events', async () => {
  const env = mkEnv(); let n = 0; const sendMail = async () => { n++; };
  for (const over of [{ last_charge_status: 'Declined' }, { patron_status: 'former_patron' }, { currently_entitled_amount_cents: 100 }, { email: 'nope' }, { email: '' }, { last_charge_date: 'x' }]) {
    const raw = paid(over);
    assert.equal((await call(env, '/patreon/webhook', { body: raw, headers: signed(raw), sendMail })).status, 200);
  }
  const other = JSON.parse(paid()); other.data.relationships.campaign.data.id = '1'; const rawO = JSON.stringify(other);
  await call(env, '/patreon/webhook', { body: rawO, headers: signed(rawO), sendMail });
  await call(env, '/patreon/webhook', { body: paid(), sendMail });   // no signature
  assert.equal(n, 0);
});
test('a failed send answers 500 so Patreon retries, and the retry sends', async () => {
  const env = mkEnv(); let fail = true, n = 0;
  const sendMail = async () => { if (fail) throw new Error('quota'); n++; };
  const raw = paid();
  const r = await call(env, '/patreon/webhook', { body: raw, headers: signed(raw), sendMail });
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { error: 'try again' });
  fail = false;
  assert.equal((await call(env, '/patreon/webhook', { body: raw, headers: signed(raw), sendMail })).status, 200);
  assert.equal(n, 1);
});

// ---- owner plan tester (/owner/tier, owner flag on /entitlement) ----
const ownerIds = { owner: { sub: 'own', email: 'Me@X.test', email_verified: true }, spoof: { sub: 'u9', email: 'me@x.test', email_verified: false }, other: { sub: 'u1', email: 'u1@x.test', email_verified: true } };
const ownerCall = (env, path, body) => handlePatreon(new Request('https://w.test' + path, { method: 'POST', body: JSON.stringify(body) }), new URL('https://w.test' + path), env, ctx,
  { json, verifyIdentity: async (t) => { if (!ownerIds[t]) throw new Error('bad'); return ownerIds[t]; }, overIpLimit: noLimit, fetchFn: mkFetch(identityOf(member(1500))) });
test('owner flag: only the verified OWNER_EMAIL account sees owner: true', async () => {
  const env = mkEnv({ OWNER_EMAIL: ' me@x.test ' });
  assert.deepEqual(await (await ownerCall(env, '/entitlement', { idToken: 'owner' })).json(), { tier: 'discovery', owner: true, testing: false });
  assert.deepEqual(await (await ownerCall(env, '/entitlement', { idToken: 'spoof' })).json(), { tier: 'discovery' }, 'unverified email is not the owner');
  assert.deepEqual(await (await ownerCall(env, '/entitlement', { idToken: 'other' })).json(), { tier: 'discovery' });
  const noOwner = mkEnv();
  assert.deepEqual(await (await ownerCall(noOwner, '/entitlement', { idToken: 'owner' })).json(), { tier: 'discovery' }, 'unset OWNER_EMAIL = nobody');
});
test('/owner/tier: owner switches own plan, nobody else can', async () => {
  const env = mkEnv({ OWNER_EMAIL: 'me@x.test' });
  for (const t of ['horizon', 'deep', 'flow', 'discovery', 'deep']){
    assert.deepEqual(await (await ownerCall(env, '/owner/tier', { idToken: 'owner', tier: t })).json(), { tier: t, testing: true });
    assert.deepEqual(await (await ownerCall(env, '/entitlement', { idToken: 'owner' })).json(), { tier: t, owner: true, testing: true });
  }
  assert.equal(JSON.parse(env.PROFILES.m.get('ent:own')).src, 'owner');
  assert.equal((await ownerCall(env, '/owner/tier', { idToken: 'other', tier: 'horizon' })).status, 403);
  assert.equal((await ownerCall(env, '/owner/tier', { idToken: 'spoof', tier: 'horizon' })).status, 403);
  assert.equal(env.PROFILES.m.get('ent:u1'), undefined, 'a refused call writes nothing');
  assert.equal((await ownerCall(env, '/owner/tier', { idToken: 'owner', tier: 'paid' })).status, 400);
  assert.equal((await ownerCall(env, '/owner/tier', { idToken: 'nope', tier: 'flow' })).status, 401);
  assert.equal((await ownerCall(mkEnv(), '/owner/tier', { idToken: 'owner', tier: 'flow' })).status, 403, 'unset OWNER_EMAIL = nobody');
});
test('/owner/tier: a Patreon sync never changes the test plan; real drops it', async () => {
  const env = mkEnv({ OWNER_EMAIL: 'me@x.test' });
  await ownerCall(env, '/owner/tier', { idToken: 'owner', tier: 'discovery' });
  assert.equal(await writeTier(env, 'own', 'horizon'), 'free', 'sync keeps the test plan');
  assert.equal(JSON.parse(env.PROFILES.m.get('ent:own')).src, 'owner');
  const r = await (await ownerCall(env, '/owner/tier', { idToken: 'owner', tier: 'real' })).json();
  assert.equal(r.testing, false);
  assert.notEqual(JSON.parse(env.PROFILES.m.get('ent:own') || '{"src":"none"}').src, 'owner', 'test record gone');
  const env2 = mkEnv({ OWNER_EMAIL: 'me@x.test' });
  env2.PROFILES.m.set('ent:own', JSON.stringify({ tier: 'horizon', src: 'code', at: 1 }));
  assert.deepEqual(await (await ownerCall(env2, '/owner/tier', { idToken: 'owner', tier: 'real' })).json(), { tier: 'horizon', testing: false }, 'real leaves a non-test grant alone');
});
