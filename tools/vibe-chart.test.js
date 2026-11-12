// vibe-chart: selection cap, text composition, chart data. Run: node --test tools/vibe-chart.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = /\/\* VIBE-CHART:BEGIN[^*]*\*\/([\s\S]*?)\/\* VIBE-CHART:END \*\//.exec(html);
assert.ok(m, 'VIBE-CHART block not found in index.html');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.api = { VC_MAX, VC_NODES, VC_GRID, VC_EMOJI_GRID, vcBeatMs, vcGrow, VC_BY_ID, vcClean, vcToggle, vcFill, vcCompose, vcNeighbor, vcHeat, vcPathPoints, vcNear, vcFlowCell, VC_JOURNEYS, VC_HAPPY };', ctx);
const A = ctx.api;
const arr = (x) => [...x];

test('grid: 10 x 10, unique plain words, each cell placed where its row and column say', () => {
  assert.strictEqual(A.VC_NODES.length, 100);
  assert.strictEqual(new Set(arr(A.VC_NODES).map(n => n.id)).size, 100);
  assert.ok(arr(A.VC_NODES).every(n => /^[a-z]{3,11}$/.test(n.label)));
  assert.strictEqual(A.VC_BY_ID.furious.c, 0); assert.strictEqual(A.VC_BY_ID.furious.r, 0);
  assert.strictEqual(A.VC_BY_ID.elated.c, 9); assert.strictEqual(A.VC_BY_ID.elated.r, 0);
  assert.strictEqual(A.VC_BY_ID.numb.c, 0); assert.strictEqual(A.VC_BY_ID.numb.r, 8);
  assert.ok(A.VC_BY_ID.calm.r > A.VC_BY_ID.anxious.r && A.VC_BY_ID.joyful.c > A.VC_BY_ID.sad.c);
});

test('heat goes from cool (heavy, calm) to warm (bright, intense)', () => {
  const hue = (c, r) => Number(/hsl\((\d+)/.exec(A.vcHeat(c, r))[1]);
  assert.ok(hue(0, 9) > 200); assert.ok(hue(9, 0) < 30); assert.ok(hue(4, 4) > hue(9, 0) && hue(4, 4) < hue(0, 9));
});

test('path points follow pick order; near cells exclude picks', () => {
  assert.strictEqual(A.vcPathPoints(['calm', 'furious']), '8.5,8.5 0.5,0.5');
  assert.strictEqual(A.vcPathPoints([]), '');
  const near = A.vcNear(['calm']);
  assert.ok(near.has('serene') && near.has('tranquil') && !near.has('calm') && !near.has('furious'));
  assert.strictEqual(near.size, 8);
});

test('toggle adds in order, removes, and stops at 7', () => {
  let s = [];
  ['calm', 'sad', 'tense', 'tired', 'hopeful', 'joyful', 'focused'].forEach(id => { const r = A.vcToggle(s, id); assert.strictEqual(r.change, 'added'); s = arr(r.sel); });
  assert.strictEqual(s.length, 7);
  const full = A.vcToggle(s, 'angry');
  assert.strictEqual(full.change, 'full');
  assert.deepStrictEqual(arr(full.sel), s);
  const rm = A.vcToggle(s, 'tense');
  assert.strictEqual(rm.change, 'removed');
  assert.deepStrictEqual(arr(rm.sel), ['calm', 'sad', 'tired', 'hopeful', 'joyful', 'focused']);
  assert.strictEqual(A.vcToggle(s, 'nope').change, 'none');
});

test('clean drops unknown, repeated and surplus ids', () => {
  assert.deepStrictEqual(arr(A.vcClean(['calm', 'calm', '<b>x</b>', 7, 'sad'])), ['calm', 'sad']);
  assert.deepStrictEqual(arr(A.vcClean('calm')), []);
  assert.strictEqual(A.vcClean(A.VC_NODES.map(n => n.id)).length, 7);
});

test('compose keeps the order and stays short', () => {
  assert.strictEqual(A.vcCompose([]), '');
  assert.strictEqual(A.vcCompose(['calm']), 'feeling calm');
  assert.strictEqual(A.vcCompose(['tense', 'calm']), 'starting out tense, ending up calm');
  assert.strictEqual(A.vcCompose(['sad', 'healing', 'hopeful']), 'starting out sad, moving through healing, ending up hopeful');
  assert.strictEqual(A.vcCompose(['sad', 'healing', 'calm', 'hopeful']), 'starting out sad, moving through healing and calm, ending up hopeful');
  const all = A.vcCompose(A.VC_NODES.map(n => n.id));
  assert.ok(all.length <= 300 && /^[a-z ,]+$/.test(all));
  assert.strictEqual(A.vcCompose(['<script>']), '');
});

test('fill goes from 0 to 1 over 7', () => {
  assert.strictEqual(A.vcFill(0), 0); assert.strictEqual(A.vcFill(7), 1); assert.strictEqual(A.vcFill(9), 1);
  assert.ok(Math.abs(A.vcFill(3) - 3 / 7) < 1e-9);
});

test('arrow keys move one cell and stop at the edge', () => {
  assert.strictEqual(A.vcNeighbor('calm', 'right'), 'comforted');
  assert.strictEqual(A.vcNeighbor('calm', 'left'), 'serene');
  assert.strictEqual(A.vcNeighbor('calm', 'up'), 'healing');
  assert.strictEqual(A.vcNeighbor('tranquil', 'down'), null);
  assert.strictEqual(A.vcNeighbor('furious', 'left'), null);
});

test('phone flow: one continuous rainbow, every feeling in its own slot, coolest first and warmest last', () => {
  const used = new Set();
  A.VC_NODES.forEach(n => { const f = A.vcFlowCell(n.c, n.r); assert.ok(f.col >= 1 && f.col <= 4); used.add(f.col + ',' + f.row); });
  assert.strictEqual(used.size, 100);
  assert.deepStrictEqual({ ...A.vcFlowCell(0, 9) }, { col: 1, row: 1 });
  assert.deepStrictEqual({ ...A.vcFlowCell(9, 0) }, { col: 4, row: 25 });
});

test('red exists: the warm corner reaches hue 0 and a good share of cells are warm', () => {
  const hues = arr(A.VC_NODES).map(n => Number(/hsl\((\d+)/.exec(A.vcHeat(n.c, n.r))[1]));
  assert.ok(hues.filter(h => h <= 15).length >= 8);
  assert.ok(hues.some(h => h >= 250));
});

test('journeys use real feelings and fit the cap', () => {
  A.VC_JOURNEYS.forEach(j => {
    assert.strictEqual(A.vcClean(j.ids).length, j.ids.length, j.label);
    assert.ok(j.ids.length >= 3 && j.ids.length <= A.VC_MAX);
    assert.ok(A.vcCompose(j.ids).length > 0);
  });
});

test('happy chips are real, light-side feelings', () => {
  assert.ok(A.VC_HAPPY.length >= 5);
  A.VC_HAPPY.forEach(id => { assert.ok(A.VC_BY_ID[id] && A.VC_BY_ID[id].c >= 6, id); });
});

test('every feeling has its own emoji', () => {
  const all = arr(A.VC_NODES).map(n => n.emoji);
  assert.strictEqual(all.length, 100);
  assert.ok(all.every(e => typeof e === 'string' && e.length >= 1));
  assert.strictEqual(new Set(all).size, 100);
  assert.strictEqual(A.VC_EMOJI_GRID.length, 10);
  A.VC_EMOJI_GRID.forEach(row => assert.strictEqual(row.length, 10));
});

test('heart beats faster and grows with every pick, and rests at zero', () => {
  assert.strictEqual(A.vcBeatMs(0), 0);
  assert.strictEqual(A.vcBeatMs(1), 1500); assert.strictEqual(A.vcBeatMs(7), 500); assert.strictEqual(A.vcBeatMs(12), 500);
  for (let n = 1; n < 7; n++){ assert.ok(A.vcBeatMs(n + 1) < A.vcBeatMs(n)); assert.ok(A.vcGrow(n + 1) > A.vcGrow(n)); }
  assert.strictEqual(A.vcGrow(0), 1); assert.strictEqual(A.vcGrow(7), 1.42);
});
