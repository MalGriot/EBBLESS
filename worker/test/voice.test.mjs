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
    unspend: async (cost) => { spent.set(id, Math.max(0, (spent.get(id) || 0) - cost)); },
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

// ---- phase 2: sets ----
import { SET_TEMPLATES, templateFor, defaultArc, parseMinutes, setToMood, looksLikeSet } from '../src/voice.js';
const sumMin = (a) => a.reduce((n, s) => n + s.minutes, 0);
const goodSet = { kind: 'set', durationMin: 90, intention: 'ecstatic dance', tags: ['dance'], seeds: [], energy: 6, text: '', ops: [], say: 'Building a 90 minute set', arc: [
  { label: 'Warm-up', minutes: 20, energyFrom: 2, energyTo: 4, tags: ['downtempo'], bpmFrom: 90, bpmTo: 105 },
  { label: 'Build', minutes: 25, energyFrom: 4, energyTo: 8, tags: ['afrobeat'] },
  { label: 'Peak', minutes: 30, energyFrom: 8, energyTo: 9, tags: ['house'] },
  { label: 'Ease out', minutes: 15, energyFrom: 6, energyTo: 2, tags: ['ambient'] }] };
const setAi = (o) => ({ run: async () => ({ response: JSON.stringify(o) }) });

test('set: valid plan passes, minutes sum to duration, energy and bpm clamped', () => {
  const p = validatePlan(goodSet);
  assert.equal(p.kind, 'set'); assert.equal(p.durationMin, 90); assert.equal(p.arc.length, 4);
  assert.equal(sumMin(p.arc), 90); assert.equal(p.arc[0].bpmFrom, 90); assert.equal(p.arc[1].bpmFrom, undefined);
  const w = validatePlan({ ...goodSet, durationMin: 9999, arc: [{ label: 'A', minutes: 5, energyFrom: 99, energyTo: -4, tags: ['x'], bpmFrom: 10, bpmTo: 500 }, { label: 'B', minutes: 10, energyFrom: 3.6, energyTo: 'x' }] });
  assert.equal(w.durationMin, 240); assert.equal(sumMin(w.arc), 240);
  assert.deepEqual([w.arc[0].energyFrom, w.arc[0].energyTo, w.arc[0].bpmFrom], [10, 0, undefined]);
  assert.equal(w.arc[1].energyFrom, 4); assert.equal(w.arc[1].energyTo, 4);
  assert.equal(validatePlan({ ...goodSet, durationMin: 1 }).durationMin, 10);
  assert.equal(sumMin(validatePlan({ ...goodSet, durationMin: 10 }).arc), 10);
});

test('set: caps steps at 8, strips urls and control chars, allowlists tags', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ label: 'S' + i, minutes: 5, energyFrom: 5, energyTo: 5 }));
  assert.equal(validatePlan({ ...goodSet, durationMin: 120, arc: many }).arc.length, 8);
  const p = validatePlan({ ...goodSet, intention: 'dance https://evil.example/x\u0000now', say: 'y'.repeat(200), arc: [{ label: 'Go www.bad.com\u0007', minutes: 30, energyFrom: 3, energyTo: 6, tags: ['<script>', 'Soul', 'a'.repeat(50), 'lo-fi', 'x', 'y', 'z'] }] });
  assert.ok(!/https?:|www\.|\u0000|\u0007/.test(JSON.stringify(p)));
  assert.ok(p.say.length <= 60);
  assert.deepEqual(p.arc[0].tags, ['soul', 'a'.repeat(30), 'lo-fi', 'x']);
});

test('set: off-schema arc falls back to the intention template; a bare set is rejected', () => {
  for (const arc of [[], [{ label: '', minutes: 5, energyFrom: 1, energyTo: 2 }], [{ label: 'x', minutes: 'soon', energyFrom: 1, energyTo: 2 }], ['junk'], [{ label: 'x', minutes: -4, energyFrom: 1, energyTo: 2 }]]) {
    const p = validatePlan({ ...goodSet, arc });
    assert.equal(p.arc.length, SET_TEMPLATES.ecstatic.length, JSON.stringify(arc)); assert.equal(sumMin(p.arc), 90);
  }
  assert.equal(validatePlan({ ...goodSet, arc: 'nope' }), null);
  assert.equal(validatePlan({ kind: 'set' }), null);
  assert.deepEqual(validatePlan({ kind: 'set', intention: 'deep focus study', durationMin: 60 }).arc.map((s) => s.label), ['Settle', 'Steady', 'Ease out']);
});

test('set: templates per intention, duration parsing, always valid', () => {
  assert.deepEqual(['ecstatic dance', 'deep focus', 'house party ramp', 'wind down for sleep', 'something'].map(templateFor), ['ecstatic', 'focus', 'party', 'sleep', 'ecstatic']);
  for (const k of Object.keys(SET_TEMPLATES)) for (const d of [10, 37, 90, 240]) { const a = defaultArc(k === 'ecstatic' ? 'dance' : k, d); assert.equal(sumMin(a), d); assert.ok(a.every((s) => s.minutes >= 1 && s.energyFrom >= 0 && s.energyTo <= 10)); }
  assert.deepEqual(['90 minutes', '2 hours', 'an hour', '1.5 hours', 'forever'].map(parseMinutes), [90, 120, 60, 90, null]);
  assert.equal(validatePlan({ kind: 'set', intention: 'x' }, 'dance for 2 hours').durationMin, 120);
  assert.ok(looksLikeSet('ecstatic dance for 90 minutes, start gentle, build to a peak') && !looksLikeSet('something calm'));
});

test('set handler: paid user gets the set, grounded interp built from all step tags', async () => {
  let seen = null;
  const groundMood = async (plan) => { seen = plan; return { tracks: [{ title: 'T', artist: 'A' }] }; };
  const r = await call(mkEnv(setAi(goodSet), { 'ent:u1': '{"tier":"flow"}' }), { idToken: 'ebs1.good', text: 'ecstatic dance for 90 minutes, start gentle, build to a peak, end calm' }, { groundMood });
  assert.equal(r.body.plan.kind, 'set'); assert.equal(r.body.upsell, undefined); assert.equal(sumMin(r.body.plan.arc), 90);
  assert.equal(r.body.interp.tracks.length, 1); assert.ok(seen.tags.includes('afrobeat') && seen.text === 'ecstatic dance');
});

test('set handler: free user gets a single-mood plan plus upsell, and the request is refunded', async () => {
  const r = await call(mkEnv(setAi(goodSet)), { idToken: 'ebs1.good', text: 'ecstatic dance for 90 minutes, build to a peak' });
  assert.equal(r.body.plan.kind, 'mood'); assert.equal(r.body.plan.arc, undefined); assert.equal(r.body.upsell, 'sets');
  assert.equal(r.body.plan.text, 'ecstatic dance'); assert.equal(r.body.used, 0, 'downgrade is refunded'); assert.equal(r.body.tier, 'free');
  const plain = await call(mkEnv(goodAi), { idToken: 'ebs1.good', text: 'a bit quieter in here' });
  assert.equal(plain.body.upsell, undefined);
});

test('set handler: model error / cap / global ceiling still serve a template set to paid, mood + upsell to free', async () => {
  const text = 'ecstatic dance for 90 minutes, start gentle, build to a peak, end calm';
  const paid = { 'ent:u1': '{"tier":"horizon"}' };
  const down = { run: async () => { throw new Error('boom'); } };
  const a = await call(mkEnv(down, paid), { idToken: 'ebs1.good', text });
  assert.equal(a.body.source, 'heuristic'); assert.equal(a.body.plan.kind, 'set'); assert.equal(a.body.plan.durationMin, 90); assert.equal(sumMin(a.body.plan.arc), 90); assert.equal(a.body.used, 0);
  const b = await call(mkEnv(down), { idToken: 'ebs1.good', text });
  assert.equal(b.body.plan.kind, 'mood'); assert.equal(b.body.upsell, 'sets');
  const q = fakeQuota(); const day = new Date().toISOString().slice(0, 10); q.spent.set('g:' + day, VOICE_GLOBAL_LIMIT);
  const c = await call(mkEnv(setAi(goodSet), paid, q), { idToken: 'ebs1.good', text });
  assert.equal(c.body.reason, 'global'); assert.equal(c.body.plan.kind, 'set');
  assert.equal(setToMood(c.body.plan).kind, 'mood');
});

test('set handler: want=set forces a set from the heuristic and tells the model', async () => {
  let user = null;
  const ai = { run: async (m, o) => { user = o.messages[1].content; return { response: JSON.stringify(goodSet) }; } };
  const r = await call(mkEnv(ai, { 'ent:u1': '{"tier":"flow"}' }), { idToken: 'ebs1.good', text: 'rainy evening', want: 'set' });
  assert.equal(r.body.plan.kind, 'set'); assert.match(user, /timed set/);
  const h = await call(mkEnv(undefined, { 'ent:u1': '{"tier":"flow"}' }), { idToken: 'ebs1.good', text: 'deep focus', want: 'set' });
  assert.equal(h.body.plan.kind, 'set'); assert.equal(h.body.plan.arc[1].label, 'Steady');
});

test('set downgrade refund: free user daily count and global neurons are given back; paid sets and plain moods still count', async () => {
  const q = fakeQuota(); const day = new Date().toISOString().slice(0, 10);
  const env = mkEnv(setAi(goodSet), {}, q);
  for (let i = 0; i < 10; i++) { const r = await call(env, { idToken: 'ebs1.good', text: 'ecstatic dance for 90 minutes, build to a peak' }); assert.equal(r.body.upsell, 'sets'); assert.equal(r.body.used, 0); assert.ok(!r.body.capped, 'never capped by downgrades'); }
  assert.equal(q.spent.get('g:' + day), 0);
  const paid = await call(mkEnv(setAi(goodSet), { 'ent:u1': '{"tier":"flow"}' }, q), { idToken: 'ebs1.good', text: 'ecstatic dance for 90 minutes' });
  assert.equal(paid.body.used, 1); assert.equal(q.spent.get('g:' + day), VOICE_NEURONS_PER_CALL);
  const mood = await call(mkEnv(goodAi, {}, fakeQuota()), { idToken: 'ebs1.good', text: 'a bit quieter in here' });
  assert.equal(mood.body.used, 1);
});
