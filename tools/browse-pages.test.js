// browse-pages: the genre / region filter on the Browse pages. Run: node --test tools/browse-pages.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = /\/\* BROWSE-PAGES:BEGIN[^*]*\*\/([\s\S]*?)\/\* BROWSE-PAGES:END \*\//.exec(html);
assert.ok(m, 'BROWSE-PAGES block not found in index.html');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.api = { bpFilterGenres, bpFilterKeys };', ctx);
const A = ctx.api;
const G = { 'Hip-Hop': ['Boom bap', 'Trap'], 'Jazz': ['Bebop', 'Soul jazz'], 'Funk': ['Classic funk'] };

test('no text lists every genre with all its styles', () => {
  const r = A.bpFilterGenres(G, '  ');
  assert.deepStrictEqual([...r.map(x => x.g)], ['Hip-Hop', 'Jazz', 'Funk']);
  assert.ok(r.every(x => !x.byStyle));
});
test('a genre name hit keeps all its styles; case ignored', () => {
  const r = A.bpFilterGenres(G, 'JAZZ');
  assert.strictEqual(r.length, 1);
  assert.deepStrictEqual([...r[0].subs], ['Bebop', 'Soul jazz']);
  assert.strictEqual(r[0].byStyle, false);
});
test('a style hit lists only the matching styles and flags byStyle', () => {
  const r = A.bpFilterGenres(G, 'trap');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].g, 'Hip-Hop');
  assert.deepStrictEqual([...r[0].subs], ['Trap']);
  assert.strictEqual(r[0].byStyle, true);
});
test('no match gives an empty list; odd input does not throw', () => {
  assert.strictEqual(A.bpFilterGenres(G, 'zzz').length, 0);
  assert.strictEqual(A.bpFilterGenres(G, null).length, 3);
  assert.deepStrictEqual([...A.bpFilterKeys(['West Africa', 'UK'], 'af')], ['West Africa']);
  assert.deepStrictEqual([...A.bpFilterKeys(['UK'], undefined)], ['UK']);
});
