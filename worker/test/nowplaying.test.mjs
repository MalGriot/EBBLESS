// /nowplaying tests: fake KV + cache, no network. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleNowPlaying, addTrack, viewOf, NP_MAX } from '../src/nowplaying.js';

const TOKEN = 'n'.repeat(40);
function setup(env = {}) {
  const kv = new Map(), c = new Map(), puts = [];
  const e = { PROFILES: { get: async k => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); puts.push(k); } }, NOWPLAYING_TOKEN: TOKEN, ...env };
  const envCache = {
    match: async r => (c.has(r.url) ? c.get(r.url).clone() : undefined),
    put: async (r, res) => { c.set(r.url, res); },
    delete: async r => { c.delete(r.url); },
  };
  const ps = []; const ctx = { waitUntil: p => ps.push(p) };
  const call = async (method, { token = TOKEN, body, origin, ip = '1.1.1.1' } = {}) => {
    const headers = { 'CF-Connecting-IP': ip };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (origin) headers.Origin = origin;
    const r = new Request('https://w.test/nowplaying', { method, headers, body: body ? JSON.stringify(body) : undefined });
    const res = await handleNowPlaying(r, new URL(r.url), e, ctx, { envCache });
    await Promise.all(ps.splice(0));
    return res;
  };
  return { call, kv, puts };
}

test('addTrack dedupes, orders newest first, caps', () => {
  let l = [];
  for (let i = 0; i < NP_MAX + 5; i++) l = addTrack(l, { v: 'v' + i, t: 't', a: 'a' }, i);
  assert.equal(l.length, NP_MAX);
  l = addTrack(l, { v: 'v10', t: 't', a: 'a' }, 99);
  assert.equal(l[0].v, 'v10'); assert.equal(l.filter(x => x.v === 'v10').length, 1);
  assert.deepEqual(viewOf([]), { current: null, recent: [] });
});

test('GET is public and empty at first; POST without key is 401', async () => {
  const s = setup();
  const g = await s.call('GET', { token: null });
  assert.equal(g.status, 200); assert.equal(g.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await g.json(), { current: null, recent: [] });
  assert.equal((await s.call('POST', { token: 'x'.repeat(40), body: { v: 'a', t: 'b' } })).status, 401);
  assert.equal(s.puts.length, 0);
});

test('POST with key stores; GET shows current + recent and cache is busted', async () => {
  const s = setup();
  await s.call('GET', { token: null });
  assert.equal((await s.call('POST', { body: { v: 'abc', t: 'One', a: 'A' } })).status, 200);
  assert.equal((await s.call('POST', { body: { v: 'def', t: 'Two', a: 'B' } })).status, 200);
  const j = await (await s.call('GET', { token: null })).json();
  assert.equal(j.current.t, 'Two'); assert.equal(j.recent[0].t, 'One');
});

test('503 when secret unset, 400 on bad body, 403 on foreign browser origin', async () => {
  assert.equal((await setup({ NOWPLAYING_TOKEN: undefined }).call('POST', { body: { v: 'a', t: 'b' } })).status, 503);
  const s = setup();
  assert.equal((await s.call('POST', { body: { v: '', t: '' } })).status, 400);
  assert.equal((await s.call('POST', { body: { v: 'a', t: 'b' }, origin: 'https://evil.example' })).status, 403);
  assert.equal((await s.call('POST', { body: { v: 'a', t: 'b' }, origin: 'https://malgriot.github.io' })).status, 200);
});

test('throttles repeated wrong keys', async () => {
  const s = setup();
  for (let i = 0; i < 10; i++) await s.call('POST', { token: 'z'.repeat(40), body: { v: 'a', t: 'b' } });
  assert.equal((await s.call('POST', { body: { v: 'a', t: 'b' } })).status, 429);
});
