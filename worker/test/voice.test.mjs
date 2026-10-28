// Voice DJ /voice/plan (src/voice.js). Dependency-free: `npm test` in worker/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan, heuristicPlan, voiceTierFor, handleVoicePlan, sanitizeCtx, VOICE_CAPS, VOICE_NEURONS_PER_CALL, VOICE_GLOBAL_LIMIT, VOICE_DAILY_NEURON_BUDGET, VOICE_GLOBAL_SHARE } from '../src/voice.js';

test('validatePlan: clamps, filters and rebuilds', () => {
  const p = validatePlan({
    kind: 'mood', ops: [], energy: 99, text: 'warm  slow\u0000 night https://evil.example/x', say: 'x'.repeat(200),
    tags: ['Soul', 'soul', '<script>', 'a'.repeat(50), 'lo-fi', 'chill', 'jazz', 'blues', 'funk', 'disco'],
    seeds: [{ artist: 'A', title: 'T' }, { artist: '', title: 'x' }, 'junk', { artist: 'B', title: 'U' }],
    extra: 'ignored', __proto__: { evil: 1 },
  });
  assert.equal(p.kind, 'mood');
  assert.equal(p.energy, 10);
  assert.ok(!/https?:|\u0000/.test(p.text));
  assert.ok(p.say.length <= 60);
  assert.ok(p.tags.length <= 6 && p.tags.includes('soul') && !p.tags.some((t) => /script|^a{40}/.test(t)));
  assert.deepEqual(p.seeds.map((s) => s.title), ['T', 'U']);
  assert.equal(p.extra, undefined);
  assert.equal(validatePlan({ kind: 'mood', text: 'x', energy: -5 }).energy, 0);
  assert.equal(validatePlan({ kind: 'mood', text: 'x', energy: 'loud' }).energy, 5);
});

test('validatePlan: command ops are an enum, capped, shaped', () => {
  const p = validatePlan({ kind: 'command', ops: [{ op: 'rm -rf' }, { op: 'volume', dir: -3 }, { op: 'shuffle', on: false }, { op: 'next' }, { op: 'prev' }] });
  assert.deepEqual(p.ops, [{ op: 'volume', dir: -1 }, { op: 'shuffle', on: false }, { op: 'next' }]);
  assert.equal(validatePlan({ kind: 'command', ops: [{ op: 'format_disk' }] }), null);
  assert.equal(validatePlan({ kind: 'command' }), null);
});

test('validatePlan: rejects off-schema', () => {
  for (const bad of [null, 42, [], 'no json here', '{broken', { kind: 'set' }, { kind: 'mood', tags: 'calm' }, { kind: 'mood', ops: {} }, { kind: 'search', text: '' }, { kind: 'mood' }, { kind: 'search', text: 5 }])
    assert.equal(validatePlan(bad), null, JSON.stringify(bad));
  // a model that wraps JSON in prose / code fences still parses
  assert.equal(validatePlan('Sure!\n```json\n{"kind":"search","text":"Radiohead Creep"}\n```').text, 'Radiohead Creep');
});

test('heuristicPlan', () => {
  assert.deepEqual(heuristicPlan('skip this please').ops, [{ op: 'next' }]);
  const m = heuristicPlan('rainy sunday morning, making coffee');
  assert.equal(m.kind, 'mood');
  assert.equal(m.text, 'rainy sunday morning, making coffee');
});

test('sanitizeCtx caps recent at 5', () => {
  const c = sanitizeCtx({ now: { title: 'S', artist: 'A' }, recent: Array.from({ length: 9 }, (_, i) => ({ t: 'T' + i, a: 'A' })) });
  assert.equal(c.recent.length, 5);
});

// ---- handler ----
function fakeKV(init = {}) { const m = new Map(Object.entries(init)); return { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); } }; }
function fakeQuota(opts = {}) {
  const days = new Map(), spent = new Map();
  return { spent, idFromName: (n) => n, get: (id) => ({
    spend: async (cost, budget) => { if (opts.spendThrows) throw new Error('do down'); const u = spent.get(id) || 0; if (u + cost > budget) return { ok: false, used: u }; spent.set(id, u + cost); return { ok: true, used: u + cost }; },
    take: async (limit) => { const u = days.get(id) || 0; if (u >= limit) return { ok: false, used: u }; days.set(id, u + 1); return { ok: true, used: u + 1 }; },
    refund: async () => { days.set(id, Math.max(0, (days.get(id) || 0) - 1)); } }) };
}
const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
const verifyIdentity = async (t) => { if (t !== 'ebs1.good') throw new Error('bad'); return { sub: 'u1' }; };
const call = (env, body, extra = {}) => handleVoicePlan(new Request('https://w.test/voice/plan', { method: 'POST', body: JSON.stringify(body) }), env, {}, { json, verifyIdentity, ...extra }).then(async (r) => ({ status: r.status, body: await r.json() }));
const mkEnv = (ai, profiles = {}, quota = fakeQuota()) => ({ PROFILES: fakeKV(profiles), GOOGLE_CLIENT_ID: 'cid', VOICE_QUOTA: quota, AI: ai });
const goodAi = { run: async () => ({ response: '{"kind":"command","ops":[{"op":"volume","dir":-1}],"seeds":[],"tags":[],"energy":3,"text":"","say":"Quieter"}' }) };

test('handler: signed out and bad token are 401 signedOut', async () => {
  const env = mkEnv(goodAi);
  assert.equal((await call(env, { text: 'hi there' })).status, 401);
  const r = await call(env, { idToken: 'nope', text: 'hi there' });
  assert.equal(r.status, 401); assert.equal(r.body.signedOut, true);
});

test('handler: happy path, validated plan, counts', async () => {
  const r = await call(mkEnv(goodAi), { idToken: 'ebs1.good', text: 'a bit quieter in here' });
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'ai'); assert.equal(r.body.used, 1); assert.equal(r.body.limit, VOICE_CAPS.free);
  assert.deepEqual(r.body.plan.ops, [{ op: 'volume', dir: -1 }]);
});

test('handler: 7 free requests a day, then capped with a heuristic plan', async () => {
  const env = mkEnv(goodAi);
  for (let i = 0; i < 7; i++) assert.equal((await call(env, { idToken: 'ebs1.good', text: 'something calm please' })).body.source, 'ai');
  const r = await call(env, { idToken: 'ebs1.good', text: 'something calm please' });
  assert.equal(r.body.capped, true); assert.equal(r.body.source, 'heuristic'); assert.ok(r.body.plan);
});

test('handler: model error or off-schema output falls back and does not charge', async () => {
  for (const ai of [{ run: async () => { throw new Error('boom'); } }, { run: async () => ({ response: '{"kind":"hack","ops":[]}' }) }, undefined]) {
    const env = mkEnv(ai);
    const r = await call(env, { idToken: 'ebs1.good', text: 'make it sparkle' });
    assert.equal(r.status, 200); assert.equal(r.body.source, 'heuristic'); assert.equal(r.body.used, 0);
  }
});

test('handler: tier comes from ent:<sub>, defaults to free', async () => {
  assert.equal(await voiceTierFor(mkEnv(goodAi), 'u1'), 'free');
  assert.equal(await voiceTierFor(mkEnv(goodAi, { 'ent:u1': '{"tier":"flow"}' }), 'u1'), 'paid');
  assert.equal(await voiceTierFor(mkEnv(goodAi, { 'ent:u1': 'not json' }), 'u1'), 'free');
  const r = await call(mkEnv(goodAi, { 'ent:u1': '{"tier":"horizon"}' }), { idToken: 'ebs1.good', text: 'more energy please' });
  assert.equal(r.body.limit, 100); assert.equal(r.body.tier, 'paid');
});

test('global ceiling: constants are conservative and consistent', () => {
  assert.equal(VOICE_DAILY_NEURON_BUDGET, 10000);
  assert.ok(VOICE_GLOBAL_SHARE <= 0.5);
  assert.equal(VOICE_GLOBAL_LIMIT, Math.floor(VOICE_DAILY_NEURON_BUDGET * VOICE_GLOBAL_SHARE));
  assert.ok(VOICE_NEURONS_PER_CALL >= 20);
});

test('global ceiling: stops calling the model once the voice share is used, refunds the user', async () => {
  let aiCalls = 0;
  const ai = { run: async () => { aiCalls++; return goodAi.run(); } };
  const quota = fakeQuota();
  const day = new Date().toISOString().slice(0, 10);
  quota.spent.set('g:' + day, VOICE_GLOBAL_LIMIT - VOICE_NEURONS_PER_CALL);   // room for exactly one more call
  const env = mkEnv(ai, {}, quota);
  const a = await call(env, { idToken: 'ebs1.good', text: 'a bit quieter in here' });
  assert.equal(a.body.source, 'ai'); assert.equal(aiCalls, 1);
  const b = await call(env, { idToken: 'ebs1.good', text: 'a bit quieter in here' });
  assert.equal(b.body.capped, true); assert.equal(b.body.reason, 'global'); assert.equal(b.body.source, 'heuristic'); assert.ok(b.body.plan);
  assert.equal(aiCalls, 1, 'model must not be called past the ceiling');
  assert.equal(b.body.used, 1, 'the refused request is not charged to the user');
});

test('global ceiling: fails closed if the counter errors', async () => {
  let aiCalls = 0;
  const env = mkEnv({ run: async () => { aiCalls++; return goodAi.run(); } }, {}, fakeQuota({ spendThrows: true }));
  const r = await call(env, { idToken: 'ebs1.good', text: 'a bit quieter in here' });
  assert.equal(r.body.reason, 'global'); assert.equal(aiCalls, 0);
});

test('per-user cap reports reason user', async () => {
  const env = mkEnv(goodAi);
  for (let i = 0; i < 7; i++) await call(env, { idToken: 'ebs1.good', text: 'something calm please' });
  assert.equal((await call(env, { idToken: 'ebs1.good', text: 'something calm please' })).body.reason, 'user');
});

test('mood plan carries a grounded interp (so the client skips /vibe-interpret); not for commands or empty grounding', async () => {
  const moodAi = { run: async () => ({ response: '{"kind":"mood","ops":[],"seeds":[{"artist":"A","title":"T"}],"tags":["soul"],"energy":3,"text":"slow warm soul","say":"Slowing it down"}' }) };
  let seen = null;
  const groundMood = async (plan, said) => { seen = { plan, said }; return { title: 'X', tags: plan.tags, keywords: [plan.text], energy: [0.1, 0.5], bpm: [60, 100], tracks: [{ title: 'T', artist: 'A' }] }; };
  const r = await call(mkEnv(moodAi), { idToken: 'ebs1.good', text: 'something slow and warm' }, { groundMood });
  assert.equal(r.body.plan.kind, 'mood'); assert.equal(r.body.interp.tracks.length, 1); assert.deepEqual(seen.plan.tags, ['soul']);
  const c = await call(mkEnv(goodAi), { idToken: 'ebs1.good', text: 'a bit quieter in here' }, { groundMood });
  assert.equal(c.body.interp, undefined);
  const empty = await call(mkEnv(moodAi), { idToken: 'ebs1.good', text: 'something slow and warm' }, { groundMood: async () => ({ tracks: [] }) });
  assert.equal(empty.body.interp, undefined);
  const boom = await call(mkEnv(moodAi), { idToken: 'ebs1.good', text: 'something slow and warm' }, { groundMood: async () => { throw new Error('x'); } });
  assert.equal(boom.status, 200); assert.equal(boom.body.interp, undefined);
});
