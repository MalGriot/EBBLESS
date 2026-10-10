// ON AIR /nowplaying tests: fake KV, cache, clock and Google verifier. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleNowPlaying, applyPost, viewOf, NP_MAX, END_SLACK_MS, STALE_UNKNOWN_MS } from '../src/nowplaying.js';

const ENV0 = { OWNER_EMAIL: 'Owner@Example.com', GOOGLE_CLIENT_ID: 'cid' };
// token string -> claims; anything else fails verification
const TOKENS = {
  owner: { email: 'owner@example.com', email_verified: true, sub: '1' },
  ownerUnverified: { email: 'owner@example.com', email_verified: false, sub: '1' },
  other: { email: 'someone@example.com', email_verified: true, sub: '2' },
};
const verifyGoogleIdToken = async tok => { if (TOKENS[tok]) return TOKENS[tok]; throw new Error('bad token'); };

function setup(env = {}) {
  const kv = new Map(), c = new Map(), io = { gets: 0, puts: 0 };
  let clock = 1_000_000;
  const e = { PROFILES: { get: async k => { io.gets++; return kv.get(k) ?? null; }, put: async (k, v) => { io.puts++; kv.set(k, v); } }, ...ENV0, ...env };
  const envCache = {
    match: async r => (c.has(r.url) ? c.get(r.url).clone() : undefined),
    put: async (r, res) => { c.set(r.url, res); },
    delete: async r => { c.delete(r.url); },
  };
  const ps = []; const ctx = { waitUntil: p => ps.push(p) };
  const call = async (method, { token, body, origin, ip = '1.1.1.1' } = {}) => {
    const headers = { 'CF-Connecting-IP': ip };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (origin) headers.Origin = origin;
    const r = new Request('https://w.test/nowplaying', { method, headers, body: body ? JSON.stringify(body) : undefined });
    const res = await handleNowPlaying(r, new URL(r.url), e, ctx, { envCache, verifyGoogleIdToken, now: () => clock });
    await Promise.all(ps.splice(0));
    return res;
  };
  return { io, call, tick: ms => { clock += ms; }, get now() { return clock; } };
}
const post = (v, pos = 0, playing = true, dur = 200) => ({ v, t: 'T ' + v, a: 'A', pos, dur, playing });

test('applyPost: new song pushes the old into history; same song only refreshes', () => {
  let s = applyPost({}, post('a', 0), 1000);
  s = applyPost(s, post('a', 30, true), 31000);
  assert.equal(s.items.length, 0); assert.equal(s.now.startedAt, 1000);
  s = applyPost(s, post('b', 0), 40000);
  assert.deepEqual(s.items.map(x => x.v), ['a']); assert.equal(s.items[0].startedAt, 1000);
  s = applyPost(s, post('a', 0), 90000);   // replay: leaves history, becomes current
  assert.deepEqual(s.items.map(x => x.v), ['b']);
  for (let i = 0; i < NP_MAX + 5; i++) s = applyPost(s, post('x' + i), 100000 + i);
  assert.equal(s.items.length, NP_MAX);
});

test('viewOf: live position uses server time; paused holds; stale goes off air', () => {
  const s = applyPost({}, post('a', 10), 100000);
  let v = viewOf(s, 105000);
  assert.equal(v.onAir, true); assert.equal(v.current.pos, 15); assert.equal(v.serverTime, 105000);
  const p = applyPost(s, post('a', 20, false), 110000);
  v = viewOf(p, 200000);
  assert.equal(v.onAir, false); assert.equal(v.current.pos, 20); assert.equal(v.current.playing, false);
  v = viewOf(s, 100000 + (200 - 10) * 1000 + END_SLACK_MS + 1);   // past the song's end + slack
  assert.equal(v.onAir, false); assert.equal(v.current.v, 'a');
  assert.equal(viewOf(s, 100000 + (200 - 10) * 1000 + END_SLACK_MS - 1).onAir, true);
  const nodur = applyPost({}, post('n', 0, true, 0), 0);   // unknown duration: capped
  assert.equal(viewOf(nodur, STALE_UNKNOWN_MS - 1).onAir, true);
  assert.equal(viewOf(nodur, STALE_UNKNOWN_MS + 1).onAir, false);
  assert.deepEqual(viewOf(null, 5), { serverTime: 5, onAir: false, current: null, recent: [] });
});

test('GET is public and off air when empty', async () => {
  const s = setup();
  const g = await s.call('GET');
  assert.equal(g.status, 200); assert.equal(g.headers.get('access-control-allow-origin'), '*');
  const j = await g.json(); assert.equal(j.onAir, false); assert.equal(j.current, null);
});

test('POST: no token 401, non-owner 403, unverified email 403, bad token 401', async () => {
  const s = setup();
  assert.equal((await s.call('POST', { body: post('a') })).status, 401);
  assert.equal((await s.call('POST', { token: 'garbage', body: post('a') })).status, 401);
  assert.equal((await s.call('POST', { token: 'other', body: post('a') })).status, 403);
  assert.equal((await s.call('POST', { token: 'ownerUnverified', body: post('a') })).status, 403);
  assert.equal((await s.call('GET').then(r => r.json())).current, null);
});

test('POST: client-sent email is ignored; OWNER_EMAIL unset is 503', async () => {
  const s = setup();
  assert.equal((await s.call('POST', { token: 'other', body: { ...post('a'), email: 'owner@example.com' } })).status, 403);
  assert.equal((await setup({ OWNER_EMAIL: undefined }).call('POST', { token: 'owner', body: post('a') })).status, 503);
});

test('owner broadcast: start, listener sees live pos from server clock, pause = off air, new song = history', async () => {
  const s = setup();
  assert.equal((await s.call('POST', { token: 'owner', body: post('a', 0) })).status, 200);
  s.tick(7000);
  let j = await (await s.call('GET')).json();
  assert.equal(j.onAir, true); assert.equal(j.current.v, 'a'); assert.equal(j.current.pos, 7);
  s.tick(3000);
  await s.call('POST', { token: 'owner', body: post('a', 10, false) });
  s.tick(60000);
  j = await (await s.call('GET')).json();
  assert.equal(j.onAir, false); assert.equal(j.current.pos, 10);
  await s.call('POST', { token: 'owner', body: post('b', 0) });
  j = await (await s.call('GET')).json();
  assert.equal(j.onAir, true); assert.equal(j.current.v, 'b'); assert.equal(j.recent[0].v, 'a');
  s.tick(300_000);   // owner force-quit: no post, the song's own length ends the broadcast
  assert.equal((await (await s.call('GET')).json()).onAir, false);
});

test('GET cache does not freeze serverTime/pos', async () => {
  const s = setup();
  await s.call('POST', { token: 'owner', body: post('a', 0) });
  const a = await (await s.call('GET')).json();
  s.tick(2000);
  const b = await (await s.call('GET')).json();   // served from cache
  assert.equal(b.serverTime - a.serverTime, 2000); assert.equal(b.current.pos - a.current.pos, 2);
});

test('POST validation and foreign origin', async () => {
  const s = setup();
  assert.equal((await s.call('POST', { token: 'owner', body: { v: '', t: '' } })).status, 400);
  assert.equal((await s.call('POST', { token: 'owner', body: post('a'), origin: 'https://evil.example' })).status, 403);
  assert.equal((await s.call('POST', { token: 'owner', body: post('a'), origin: 'https://malgriot.github.io' })).status, 200);
});

test('throttles repeated bad tokens', async () => {
  const s = setup();
  for (let i = 0; i < 30; i++) await s.call('POST', { token: 'garbage', body: post('a') });
  assert.equal((await s.call('POST', { token: 'owner', body: post('a') })).status, 429);
});

test('write budget: one put per event; identical or unchanged re-posts skip the put', async () => {
  const s = setup();
  await s.call('POST', { token: 'owner', body: post('a', 0) });
  assert.equal(s.io.puts, 1);
  s.tick(30000);
  // a late duplicate of the same state (position matches the server's prediction) writes nothing
  const r = await s.call('POST', { token: 'owner', body: post('a', 30) });
  assert.equal((await r.json()).unchanged, true); assert.equal(s.io.puts, 1);
  // pause is a change
  await s.call('POST', { token: 'owner', body: post('a', 30, false) });
  assert.equal(s.io.puts, 2);
  await s.call('POST', { token: 'owner', body: post('a', 30, false) });
  assert.equal(s.io.puts, 2);
  // seek (position jumps well past prediction) is a change
  await s.call('POST', { token: 'owner', body: post('a', 120, true) });
  assert.equal(s.io.puts, 3);
  // new song: ONE put carries current + history
  await s.call('POST', { token: 'owner', body: post('b', 0) });
  assert.equal(s.io.puts, 4);
  const j = await (await s.call('GET')).json();
  assert.equal(j.current.v, 'b'); assert.equal(j.recent[0].v, 'a');
});

test('best-effort off air on close: one post with playing:false ends the broadcast immediately', async () => {
  const s = setup();
  await s.call('POST', { token: 'owner', body: post('a', 0) });
  s.tick(20000);
  await s.call('POST', { token: 'owner', body: post('a', 20, false) });   // pagehide beacon
  const j = await (await s.call('GET')).json();
  assert.equal(j.onAir, false); assert.equal(j.current.pos, 20);
  assert.equal(s.io.puts, 2);
});

test('GET cache hit avoids the KV read', async () => {
  const s = setup();
  await s.call('GET'); const after1 = s.io.gets;     // miss: one read
  await s.call('GET'); await s.call('GET');
  assert.equal(s.io.gets, after1);
});
