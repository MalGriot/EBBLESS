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
vm.runInContext(m[1] + '\nthis.api = { VC_MAX, VC_NODES, VC_GRID, VC_BY_ID, vcClean, vcToggle, vcFill, vcCompose, vcNeighbor, vcHeat, vcPathPoints, vcNear, VC_COMPACT };', ctx);
const A = ctx.api;
const arr = (x) => [...x];

test('grid: 7 x 7, unique plain words, each cell placed where its row and column say', () => {
  assert.strictEqual(A.VC_NODES.length, 49);
  assert.strictEqual(new Set(arr(A.VC_NODES).map(n => n.id)).size, 49);
  assert.ok(arr(A.VC_NODES).every(n => /^[a-z]{3,11}$/.test(n.label)));
  assert.strictEqual(A.VC_BY_ID.furious.c, 0); assert.strictEqual(A.VC_BY_ID.furious.r, 0);
  assert.strictEqual(A.VC_BY_ID.euphoric.c, 6); assert.strictEqual(A.VC_BY_ID.euphoric.r, 0);
  assert.strictEqual(A.VC_BY_ID.numb.c, 0); assert.strictEqual(A.VC_BY_ID.numb.r, 6);
  assert.ok(A.VC_BY_ID.calm.r > A.VC_BY_ID.anxious.r && A.VC_BY_ID.joyful.c > A.VC_BY_ID.sad.c);
});

test('heat goes from cool (heavy, calm) to warm (bright, intense)', () => {
  const hue = (c, r) => Number(/hsl\((\d+)/.exec(A.vcHeat(c, r))[1]);
  assert.ok(hue(0, 6) > 200); assert.ok(hue(6, 0) < 30); assert.ok(hue(3, 3) > hue(6, 0) && hue(3, 3) < hue(0, 6));
});

test('path points follow pick order; near cells exclude picks', () => {
  assert.strictEqual(A.vcPathPoints(['calm', 'furious']), '4.5,6.5 0.5,0.5');
  assert.strictEqual(A.vcPathPoints([]), '');
  // compact 5 x 5: calm (col 4,row 6) is not a cell there, furious and numb are; picks without a cell are skipped
  assert.strictEqual(A.vcPathPoints(['furious', 'calm', 'numb'], A.VC_COMPACT), '0.5,0.5 0.5,4.5');
  assert.strictEqual(A.vcPathPoints(['sad', 'joyful'], A.VC_COMPACT), '4.5,1.5');
  const near = A.vcNear(['calm']);
  assert.ok(near.has('serene') && near.has('relaxed') && !near.has('calm') && !near.has('furious'));
  assert.strictEqual(near.size, 5);
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
  assert.strictEqual(A.vcNeighbor('calm', 'right'), 'serene');
  assert.strictEqual(A.vcNeighbor('calm', 'left'), 'quiet');
  assert.strictEqual(A.vcNeighbor('calm', 'up'), 'relaxed');
  assert.strictEqual(A.vcNeighbor('calm', 'down'), null);
  assert.strictEqual(A.vcNeighbor('furious', 'left'), null);
});

test('compact layout is a 5 x 5 subset made of real cells with short words', () => {
  const C = A.VC_COMPACT, words = [];
  C.rows.forEach(r => C.cols.forEach(c => words.push(A.VC_GRID[r][c])));
  assert.strictEqual(words.length, 25);
  assert.ok(words.every(w => w.length <= 10));
  assert.deepStrictEqual(arr(C.cols), [...C.cols].sort((a, b) => a - b));
});
