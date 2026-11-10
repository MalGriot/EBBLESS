// #746 follow-up: what an album/playlist link does once its songs are matched. Run: node --test tools/link-collection.test.js
// Loads the LINK-COLLECTION block from index.html.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = /\/\* LINK-COLLECTION:BEGIN \*\/([\s\S]*?)\/\* LINK-COLLECTION:END \*\//.exec(html);
assert.ok(m, 'LINK-COLLECTION block not found in index.html');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.mode = linkLandingMode; this.counts = linkMatchCounts; this.line = linkResultLine; this.missing = linkMissingLine; this.saved = linkSavedLine; this.acts = linkCollectionActions;', ctx);
const plain = (f) => (...a) => JSON.parse(JSON.stringify(f(...a)));
const { mode, line, missing, saved } = ctx;
const counts = plain(ctx.counts), acts = plain(ctx.acts);
const song = (title, videoId) => ({ title, videoId: videoId === undefined ? 'v' + title : videoId });

test('landing mode: a single song keeps its own flow whatever is playing', () => {
  assert.strictEqual(mode(true, true, undefined), 'single');
  assert.strictEqual(mode(true, false, undefined), 'single');
});

test('landing mode: a collection with a queue going shows the sheet, otherwise it plays', () => {
  assert.strictEqual(mode(false, true, undefined), 'sheet');
  assert.strictEqual(mode(false, false, undefined), 'play');
});

test('landing mode: a shared song position (targetIndex) always plays', () => {
  assert.strictEqual(mode(false, true, 3), 'play');
});

test('match counts: matched, total and missing names', () => {
  const c = counts([song('A'), song('B', null), song('C'), null, song('D', '')]);
  assert.deepStrictEqual(c, { total: 4, matched: 2, missing: ['B', 'D'] });
  assert.deepStrictEqual(counts(undefined), { total: 0, matched: 0, missing: [] });
});

test('result line wording', () => {
  assert.strictEqual(line({ total: 12, matched: 11, missing: [] }), 'Matched 11 of 12 songs');
  assert.strictEqual(line({ total: 12, matched: 12, missing: [] }), 'Matched all 12 songs');
  assert.strictEqual(line({ total: 1, matched: 1, missing: [] }), 'Matched 1 song');
  assert.strictEqual(line({ total: 5, matched: 0, missing: [] }), 'None of the 5 songs matched');
  assert.strictEqual(line({ total: 0, matched: 0, missing: [] }), 'No songs found');
  assert.strictEqual(line(null), 'No songs found');
});

test('missing line: up to three names, then a count', () => {
  assert.strictEqual(missing({ missing: [] }), '');
  assert.strictEqual(missing({ missing: ['A'] }), 'Not found: A');
  assert.strictEqual(missing({ missing: ['A', 'B', 'C'] }), 'Not found: A, B, C');
  assert.strictEqual(missing({ missing: ['A', 'B', 'C', 'D', 'E'] }), 'Not found: A, B, C and 2 more');
});

test('saved line names the library section', () => {
  assert.strictEqual(saved('album'), 'Saved in your Library under Albums');
  assert.strictEqual(saved('playlist'), 'Saved in your Library under Playlists');
  assert.strictEqual(saved('artist'), 'Saved in your Library under Artists');
  assert.strictEqual(saved('weird'), 'Saved in your Library');
});

test('actions: the single-song four, in order, none when nothing matched', () => {
  assert.deepStrictEqual(acts(11).map(a => a.id), ['now', 'next', 'queue', 'playlist']);
  assert.deepStrictEqual(acts(11).map(a => a.label), ['Play now', 'Play next', 'Add to queue', 'Add to playlist']);
  assert.strictEqual(acts(11).filter(a => a.primary).length, 1);
  assert.deepStrictEqual(acts(0), []);
});
