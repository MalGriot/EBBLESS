// Voice DJ (#553) phase 2: the arc filler. Run: node --test tools/voice-sets.test.js
// Loads exactly the SET-ARC block from index.html (no DOM, no network).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = /\/\* SET-ARC:BEGIN[\s\S]*?\*\/([\s\S]*?)\/\* SET-ARC:END \*\//.exec(html);
assert.ok(m, 'SET-ARC block not found in index.html');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.fillSetArc = fillSetArc; this.createSetSession = createSetSession; this.setRng = setRng; this.setArcSummary = setArcSummary; this.MAXJ = SET_MAX_BPM_JUMP; this.DEF = SET_DEFAULT_SONG_SEC;', ctx);
const { fillSetArc, createSetSession, setRng, setArcSummary, MAXJ, DEF } = ctx;
const plain = (x) => JSON.parse(JSON.stringify(x));

const ARC = [
  { label: 'Warm-up', minutes: 20, energyFrom: 2, energyTo: 4, tags: ['downtempo'], bpmFrom: 90, bpmTo: 105 },
  { label: 'Build', minutes: 25, energyFrom: 4, energyTo: 8, tags: ['afrobeat'], bpmFrom: 105, bpmTo: 122 },
  { label: 'Peak', minutes: 30, energyFrom: 8, energyTo: 9, tags: ['house'], bpmFrom: 122, bpmTo: 130 },
  { label: 'Cool-down', minutes: 15, energyFrom: 6, energyTo: 2, tags: ['ambient'], bpmFrom: 105, bpmTo: 80 },
];
// A rich synthetic pool: every energy 0-10 x bpm 70-135 combination, 3 to 4.5 minutes.
function richPool(n = 400, seed = 7) {
  const r = setRng(seed), out = [];
  for (let i = 0; i < n; i++) {
    const energy = Math.round(r() * 100) / 10, bpm = Math.round(70 + energy * 6 + (r() - 0.5) * 20);
    out.push({ key: 't' + i + '|a' + (i % 40), title: 't' + i, artist: 'a' + (i % 40), energy, bpm, tags: [], durationSec: 180 + Math.round(r() * 90) });
  }
  return out;
}
const run = (arc, pool, opts) => fillSetArc(arc, pool.map((c) => ({ ...c })), opts);

test('fills each step to its minutes (within slack) and totals about the target', () => {
  const r = run(ARC, richPool(), { rng: setRng(1) });
  assert.deepStrictEqual(plain(r.shortfall), []);
  const per = ARC.map(() => 0);
  r.picks.forEach((p) => { per[p.stepIdx] += p.sec; });
  ARC.forEach((s, i) => { assert.ok(per[i] >= s.minutes * 60 - 90, s.label + ' underfilled: ' + per[i]); assert.ok(per[i] <= s.minutes * 60 + 300, s.label + ' overfilled: ' + per[i]); });
  assert.ok(Math.abs(r.totalSec - r.targetSec) / r.targetSec < 0.1, 'within 10 percent of 90 min');
  assert.ok(r.picks.every((p, i, a) => i === 0 || p.stepIdx >= a[i - 1].stepIdx), 'steps in order');
});

test('never jumps more than the BPM limit between neighbours', () => {
  for (const seed of [1, 2, 3]) {
    const r = run(ARC, richPool(400, seed), { rng: setRng(seed) });
    for (let i = 1; i < r.picks.length; i++) {
      const a = r.picks[i - 1].cand.bpm, b = r.picks[i].cand.bpm;
      if (a && b) assert.ok(Math.abs(a - b) <= MAXJ, 'jump ' + a + ' -> ' + b);
    }
  }
  const tight = run(ARC, richPool(), { rng: setRng(1), maxJump: 5 });
  for (let i = 1; i < tight.picks.length; i++) assert.ok(Math.abs(tight.picks[i].cand.bpm - tight.picks[i - 1].cand.bpm) <= 5);
});

test('follows the energy curve: low, rising, peak, falling', () => {
  const r = run(ARC, richPool(), { rng: setRng(4) });
  const avg = (i) => { const x = r.picks.filter((p) => p.stepIdx === i).map((p) => p.cand.energy); return x.reduce((a, b) => a + b, 0) / x.length; };
  assert.ok(avg(0) < avg(1) && avg(1) < avg(2), [avg(0), avg(1), avg(2)].join());
  assert.ok(avg(3) < avg(2));
});

test('no repeats, honours the recent set, spreads artists', () => {
  const pool = richPool();
  const recent = new Set(pool.slice(0, 120).map((c) => c.key));
  const r = run(ARC, pool, { rng: setRng(2), recent });
  const keys = r.picks.map((p) => p.cand.key);
  assert.strictEqual(new Set(keys).size, keys.length);
  assert.ok(keys.every((k) => !recent.has(k)));
  let back2back = 0;
  for (let i = 1; i < r.picks.length; i++) if (r.picks[i].cand.artist === r.picks[i - 1].cand.artist) back2back++;
  assert.ok(back2back <= 1, 'artist back to back: ' + back2back);
});

test('deterministic for a seeded rng, different for another seed', () => {
  const keys = (seed) => run(ARC, richPool(), { rng: setRng(seed) }).picks.map((p) => p.cand.key).join(',');
  assert.strictEqual(keys(5), keys(5));
  assert.notStrictEqual(keys(5), keys(6));
});

test('thin pool degrades gracefully and reports the shortfall', () => {
  const pool = richPool(12);
  const r = run(ARC, pool, { rng: setRng(1) });
  assert.ok(r.picks.length > 0 && r.picks.length <= 12);
  assert.ok(r.totalSec < r.targetSec);
  assert.ok(r.shortfall.length > 0 && r.shortfall.every((s) => s.missingMin > 1 && typeof s.label === 'string'));
  assert.deepStrictEqual(plain(run(ARC, [], { rng: setRng(1) }).picks), []);
  assert.strictEqual(run(ARC, [], { rng: setRng(1) }).shortfall.length, ARC.length);
});

test('unmatched songs are replaced by the next best, and a step can be given up on', () => {
  const pool = richPool();
  const bad = new Set(pool.filter((_, i) => i % 3 === 0).map((c) => c.key));
  const r = run(ARC, pool, { rng: setRng(1), resolve: (c) => (bad.has(c.key) ? 0 : c.durationSec) });
  assert.ok(r.picks.every((p) => !bad.has(p.cand.key)));
  assert.deepStrictEqual(plain(r.shortfall), []);
  const S = createSetSession(ARC, { rng: setRng(1) });
  assert.strictEqual(S.next([]), null);
  S.skipStep();
  assert.strictEqual(S.step().label, 'Build');
});

test('unknown metrics: tag-derived energy estimate is used and counted; unknown duration falls back to 3.5 min', () => {
  const pool = [];
  for (let i = 0; i < 60; i++) pool.push({ key: 'k' + i, title: 'k' + i, artist: 'x' + i, tags: [['ambient', 'chill', 'house', 'dance'][i % 4]] });
  const r = run([{ label: 'Calm', minutes: 14, energyFrom: 2, energyTo: 2, tags: [] }], pool, { rng: setRng(1) });
  assert.ok(r.picks.length >= 3 && r.estimated === r.picks.length);
  assert.ok(r.picks.every((p) => ['ambient', 'chill'].includes(p.cand.tags[0])), 'low-energy tags only');
  assert.ok(r.picks.every((p) => p.sec === DEF));
});

test('summary line is static text', () => {
  assert.strictEqual(setArcSummary({ intention: 'ecstatic dance', durationMin: 90, arc: ARC }), 'ecstatic dance - 90 min - Warm-up > Build > Peak > Cool-down');
});
