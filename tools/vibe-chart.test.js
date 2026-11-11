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
vm.runInContext(m[1] + '\nthis.api = { VC_MAX, VC_NODES, VC_EDGES, VC_BY_ID, vcClean, vcToggle, vcFill, vcCompose, vcEdgePath, vcNeighbor, vcPos };', ctx);
const A = ctx.api;
const arr = (x) => [...x];

test('chart data: unique ids and cells, every edge joins known feelings', () => {
  assert.strictEqual(new Set(arr(A.VC_NODES).map(n => n.id)).size, A.VC_NODES.length);
  assert.strictEqual(new Set(arr(A.VC_NODES).map(n => n.c + ',' + n.r)).size, A.VC_NODES.length);
  const seen = new Set();
  A.VC_EDGES.forEach(([a, b]) => { assert.ok(A.VC_BY_ID[a] && A.VC_BY_ID[b], a + '>' + b); assert.notStrictEqual(a, b); const k = a + '>' + b; assert.ok(!seen.has(k)); seen.add(k); });
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

test('edge paths exist for most edges and neighbour keys move the right way', () => {
  const ok = A.VC_EDGES.filter(([a, b]) => /^M[\d. -]+ Q[\d. -]+$/.test(A.vcEdgePath(A.VC_BY_ID[a], A.VC_BY_ID[b])));
  assert.ok(ok.length >= A.VC_EDGES.length - 2);
  assert.strictEqual(A.vcNeighbor('calm', 'right'), 'content');
  assert.strictEqual(A.vcNeighbor('calm', 'left'), 'peaceful');
  assert.strictEqual(A.vcNeighbor('calm', 'up'), 'healing');
  assert.strictEqual(A.vcNeighbor('numb', 'left'), null);
});
