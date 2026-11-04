// /vibe-interpret attaches metrics to its tracks (vibeAttachMetrics). index.js
// imports cloudflare:workers, so this pulls the helper out of the source and
// runs it with stubs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const start = src.indexOf('const VIBE_METRICS_MAX');
const end = src.indexOf('\n}\n', src.indexOf('async function vibeAttachMetrics')) + 3;
assert.ok(start > 0 && end > start, 'vibeAttachMetrics not found');
const mapStart = src.indexOf('async function mapWithConcurrency');
const mapSrc = src.slice(mapStart, src.indexOf('\n}\n', mapStart) + 3);

function load(metricsForTrack) {
  const ctx = { metricsForTrack, setTimeout, clearTimeout, Promise, Map, Array, String };
  vm.createContext(ctx);
  vm.runInContext(mapSrc + src.slice(start, end) + '\nthis.vibeAttachMetrics = vibeAttachMetrics; this.DEADLINE = VIBE_METRICS_DEADLINE_MS;', ctx);
  return ctx;
}
const waitCtx = () => { const p = []; return { waitUntil: (x) => p.push(x), done: () => Promise.all(p) }; };

test('metrics come back aligned with the tracks, null where unknown', async () => {
  const c = load(async (title) => (title === 'b' ? null : { bpm: title.length * 100, energy: 0.5 }));
  const w = waitCtx();
  const out = await c.vibeAttachMetrics([{ title: 'a', artist: 'x' }, { title: 'b', artist: 'y' }, { title: '', artist: 'z' }, { title: 'ccc', artist: 'w' }], {}, w);
  assert.deepEqual(JSON.parse(JSON.stringify(out)), [{ bpm: 100, energy: 0.5 }, null, null, { bpm: 300, energy: 0.5 }]);
});

test('a lookup that throws leaves that track null, not an error', async () => {
  const c = load(async (title) => { if (title === 'bad') throw new Error('boom'); return { bpm: 90 }; });
  const out = await c.vibeAttachMetrics([{ title: 'bad', artist: 'x' }, { title: 'ok', artist: 'y' }], {}, waitCtx());
  assert.equal(out[0], null);
  assert.equal(out[1].bpm, 90);
});

test('answers by the deadline; slow lookups keep running under waitUntil', async () => {
  let finished = 0;
  const c = load(async (title) => { if (title === 'slow') { await new Promise(r => setTimeout(r, c.DEADLINE + 300)); finished++; } return { bpm: 1 }; });
  const w = waitCtx();
  const t0 = Date.now();
  const out = await c.vibeAttachMetrics([{ title: 'fast', artist: 'x' }, { title: 'slow', artist: 'y' }], {}, w);
  assert.ok(Date.now() - t0 < c.DEADLINE + 250, 'returned late');
  assert.equal(out[0].bpm, 1);
  assert.equal(out[1], null);
  await w.done();
  assert.equal(finished, 1);
});

test('at most 25 tracks are looked up', async () => {
  let calls = 0;
  const c = load(async () => { calls++; return null; });
  const tracks = Array.from({ length: 40 }, (_, i) => ({ title: 't' + i, artist: 'a' }));
  const out = await c.vibeAttachMetrics(tracks, {}, waitCtx());
  assert.equal(out.length, 25);
  assert.equal(calls, 25);
});
