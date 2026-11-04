// vibe-taste: what a listener keeps and skips inside a vibe shapes that vibe next time. Run: node --test tools/vibe-taste.test.js
// Loads the VIBE-TASTE block from index.html with an in-memory localStorage.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = /\/\* VIBE-TASTE:BEGIN[^*]*\*\/([\s\S]*?)\/\* VIBE-TASTE:END \*\//.exec(html);
assert.ok(m, 'VIBE-TASTE block not found in index.html');
const store = new Map();
const ctx = {
  personal: true,
  lsGet: (k, d) => store.has(k) ? JSON.parse(store.get(k)) : d,
  lsSet: (k, v) => store.set(k, JSON.stringify(v)),
  vibeMemoryKey: (t) => String(t || '').toLowerCase().trim(),
  tagCacheKey: (t) => (String(t.title) + '|' + String(t.artist)).toLowerCase(),
  primaryArtistKey: (a) => String(a || '').toLowerCase(),
};
ctx.personalizeOn = () => ctx.personal;
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.vibeTasteNote = vibeTasteNote; this.vibeTasteFor = vibeTasteFor; this.vibeTasteAdjust = vibeTasteAdjust; this.LS = LS_VIBE_TASTE;', ctx);

const song = (title, artist) => ({ title, artist });
const noProf = { declined: { a: {}, keys: new Set() }, artists: new Map() };

test('a song skipped in a vibe stays out of that vibe, not others', () => {
  store.clear();
  ctx.vibeTasteNote('late night', song('Loud', 'Band'), 'skip');
  assert.strictEqual(ctx.vibeTasteAdjust(song('Loud', 'Band'), ctx.vibeTasteFor('late night'), noProf), -Infinity);
  assert.strictEqual(ctx.vibeTasteAdjust(song('Loud', 'Band'), ctx.vibeTasteFor('workout'), noProf), 0);
});

test('the skipped artist leans down, a kept artist leans up', () => {
  store.clear();
  ctx.vibeTasteNote('late night', song('Loud', 'Band'), 'skip');
  ctx.vibeTasteNote('late night', song('Soft', 'Singer'), 'finish');
  ctx.vibeTasteNote('late night', song('Soft', 'Singer'), 'like');
  const vt = ctx.vibeTasteFor('late night');
  assert.ok(ctx.vibeTasteAdjust(song('Other', 'Band'), vt, noProf) < 0);
  assert.ok(ctx.vibeTasteAdjust(song('Another', 'Singer'), vt, noProf) > 0);
  assert.strictEqual(vt.songs.get('soft|singer').title, 'Soft', 'keeps the name to bring the song back');
  assert.ok(vt.songs.get('soft|singer').score >= 3);
});

test('a like then unlike cancels out', () => {
  store.clear();
  ctx.vibeTasteNote('v', song('A', 'B'), 'like');
  ctx.vibeTasteNote('v', song('A', 'B'), 'unlike');
  assert.strictEqual(ctx.vibeTasteFor('v').songs.get('a|b').score, 0);
});

test('app-wide thumbs-down keeps a song out of every vibe', () => {
  store.clear();
  const prof = { declined: { a: {}, keys: new Set(['a|b']) }, artists: new Map() };
  assert.strictEqual(ctx.vibeTasteAdjust(song('A', 'B'), ctx.vibeTasteFor('v'), prof), -Infinity);
  const prof2 = { declined: { a: { x: 2 }, keys: new Set() }, artists: new Map() };
  assert.strictEqual(ctx.vibeTasteAdjust(song('Any', 'X'), ctx.vibeTasteFor('v'), prof2), -Infinity);
});

test('old signals fade, and nothing is learned with personalization off', () => {
  store.clear();
  ctx.vibeTasteNote('v', song('A', 'B'), 'finish');
  const all = JSON.parse(store.get(ctx.LS));
  all.v.s['a|b'][1] = Date.now() - 60 * 864e5;   // one half-life ago
  store.set(ctx.LS, JSON.stringify(all));
  assert.ok(Math.abs(ctx.vibeTasteFor('v').songs.get('a|b').score - 0.5) < 0.01);
  ctx.personal = false;
  ctx.vibeTasteNote('v', song('C', 'D'), 'skip');
  assert.strictEqual(ctx.vibeTasteFor('v').songs.size, 0, 'ignored while off');
  ctx.personal = true;
  assert.ok(!ctx.vibeTasteFor('v').songs.has('c|d'), 'and not recorded');
});

test('memory stays bounded', () => {
  store.clear();
  for (let i = 0; i < 40; i++) ctx.vibeTasteNote('vibe ' + i, song('A', 'B'), 'finish');
  assert.strictEqual(Object.keys(JSON.parse(store.get(ctx.LS))).length, 30);
  store.clear();
  for (let i = 0; i < 150; i++) ctx.vibeTasteNote('v', song('s' + i, 'a' + i), 'finish');
  assert.strictEqual(Object.keys(JSON.parse(store.get(ctx.LS)).v.s).length, 120);
});
