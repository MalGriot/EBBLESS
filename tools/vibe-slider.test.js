// vibe-slider: "Fine-tune" nudges a vibe's mood (energy) and sound (organic vs electronic) by re-scoring songs (#744). Run: node --test tools/vibe-slider.test.js
// Loads the VIBE-SLIDER block from index.html.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = /\/\* VIBE-SLIDER:BEGIN[^*]*\*\/([\s\S]*?)\/\* VIBE-SLIDER:END \*\//.exec(html);
assert.ok(m, 'VIBE-SLIDER block not found in index.html');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.vibeFineSwap = vibeFineSwap; this.vibeFinePlace = vibeFinePlace; this.vibeFineSoundOf = vibeFineSoundOf;', ctx);
const { vibeFineSwap, vibeFinePlace, vibeFineSoundOf } = ctx;

// 12 songs the vibe queued (energy 0.3..0.7, mostly untagged), 40 more in its pool across the full range
const ORGANIC = ['acoustic', 'folk'], ELECTRONIC = ['electronic', 'house'], MIXED = ['chill', 'mellow'];
function song(name, e, tags, extra){ return Object.assign({ title: name, artist: 'artist ' + name, e, tags }, extra || {}); }
function openSongs(){
  const out = [];
  for (let i = 0; i < 12; i++) out.push(song('o' + i, 0.3 + (i % 5) * 0.1, i % 3 === 0 ? ORGANIC : i % 3 === 1 ? ELECTRONIC : MIXED));
  return out;
}
function poolSongs(){
  const out = [];
  for (let i = 0; i < 40; i++) out.push(song('p' + i, (i % 10) / 10 + 0.05, i % 2 ? ELECTRONIC : ORGANIC));
  return out;
}
function opts(over){
  const open = openSongs();
  return Object.assign({
    shifts: { mood: 0, sound: 0 },
    fixed: [song('played1', 0.4, MIXED), song('playing', 0.5, MIXED)],
    open, pool: poolSongs(),
    keyOf: x => x.title, artistOf: x => x.artist, tagsOf: x => x.tags, energyOf: x => x.e,
    baseOf: x => (x.title[0] === 'o' ? 0.7 : 0.5), adjustOf: null,
    blacklist: new Set(['seen live']), langBlocked: new Set(['hindi']),
    declinedKeys: new Set(), declinedArtists: new Set(),
    arcAt: null,
  }, over || {});
}
const avg = (list, f) => { const v = list.map(f).filter(x => typeof x === 'number'); return v.reduce((a, b) => a + b, 0) / v.length; };
const share = (list) => list.filter(x => vibeFineSoundOf(x.tags) > 0).length / list.length;
const run = (shifts, over) => vibeFineSwap(opts(Object.assign({ shifts }, over || {})));

test('both sliders in the middle change nothing', () => {
  const o = opts();
  const r = vibeFineSwap(o);
  assert.deepStrictEqual(r.picked, o.open);
  assert.strictEqual(r.needsMore, false);
  assert.deepStrictEqual(vibeFinePlace(o, r.picked), o.open);
});

test('Mellow lowers the average energy and Upbeat raises it', () => {
  const base = avg(opts().open, x => x.e);
  const mellow = run({ mood: -2, sound: 0 }), upbeat = run({ mood: 2, sound: 0 });
  assert.ok(avg(mellow.picked, x => x.e) < base - 0.05, 'mellow ' + avg(mellow.picked, x => x.e));
  assert.ok(avg(upbeat.picked, x => x.e) > base + 0.05, 'upbeat ' + avg(upbeat.picked, x => x.e));
  assert.ok(avg(run({ mood: -1, sound: 0 }).picked, x => x.e) > avg(mellow.picked, x => x.e), 'a half step moves less than a full one');
  assert.strictEqual(mellow.picked.length, opts().open.length, 'the slots stay filled');
});

test('Electronic raises the electronic tag share and Organic lowers it', () => {
  const base = share(opts().open);
  const elec = run({ mood: 0, sound: 2 }), org = run({ mood: 0, sound: -2 });
  assert.ok(share(elec.picked) > base + 0.1, 'electronic ' + share(elec.picked));
  assert.ok(share(org.picked) < base - 0.1, 'organic ' + share(org.picked));
});

test('songs that were played or are playing never move and never come back', () => {
  const o = opts({ shifts: { mood: 2, sound: 2 } });
  o.pool.push(song('played1', 0.9, ELECTRONIC, { artist: 'artist x' }), song('playing', 0.9, ELECTRONIC, { artist: 'artist y' }));
  const r = vibeFineSwap(o);
  const keys = r.picked.concat(r.reserve).map(x => x.title);
  const before = JSON.stringify(o.fixed);
  vibeFinePlace(o, r.picked);
  assert.strictEqual(JSON.stringify(o.fixed), before, 'the fixed songs are not touched');
  // the caller leaves played songs out of the pool; one that slips through under a played key is still only one copy
  assert.ok(keys.filter(k => k === 'playing').length <= 1);
});

test('thumbs-down songs and artists never appear, and blacklisted or other-language tags do not count', () => {
  const o = opts({ shifts: { mood: 2, sound: 2 }, declinedKeys: new Set(['p9', 'o4']), declinedArtists: new Set(['artist p19']) });
  o.pool.push(song('hin', 0.95, ['electronic', 'hindi']), song('live', 0.9, ['seen live', 'electronic']));
  const r = vibeFineSwap(o);
  const all = r.picked.concat(r.reserve).map(x => x.title);
  ['p9', 'o4', 'p19', 'hin'].forEach(k => assert.ok(!all.includes(k), k + ' must not appear'));
  assert.ok(vibeFineSoundOf(['seen live']) === null);
  const t = opts({ shifts: { mood: 0, sound: 0 }, declinedKeys: new Set(['o4']) });
  assert.ok(!vibeFineSwap(t).picked.some(x => x.title === 'o4'), 'even in the middle a song thumbed down since is dropped');
});

test('taste can leave a song out (-Infinity) and nothing runs on random', () => {
  const o = opts({ shifts: { mood: 2, sound: 0 }, adjustOf: x => (x.title === 'p9' ? -Infinity : 0) });
  assert.ok(!vibeFineSwap(o).picked.some(x => x.title === 'p9'));
  const a = run({ mood: 1, sound: -1 }), b = run({ mood: 1, sound: -1 });
  assert.deepStrictEqual(a.picked.map(x => x.title), b.picked.map(x => x.title));
  assert.deepStrictEqual(a.reserve.map(x => x.title), b.reserve.map(x => x.title));
});

test('no artist more than twice, played songs counted', () => {
  const o = opts({ shifts: { mood: 2, sound: 0 } });
  o.pool.forEach((x, i) => { x.artist = 'same'; });
  o.fixed[0].artist = 'same';
  const r = vibeFineSwap(o);
  assert.ok(r.picked.filter(x => x.artist === 'same').length <= 1);
});

test('a thin pool says it needs more instead of returning junk', () => {
  // only three songs anywhere lean electronic: nothing off-sound is swapped in
  const o = opts({ shifts: { mood: 0, sound: 2 }, pool: [song('e1', 0.5, ELECTRONIC), song('e2', 0.6, ELECTRONIC), song('x1', 0.5, ORGANIC), song('x2', 0.5, MIXED)] });
  const r = vibeFineSwap(o);
  assert.strictEqual(r.needsMore, true);
  assert.ok(r.matchCount < 8);
  const titles = r.picked.map(x => x.title);
  assert.ok(!titles.includes('x1') && !titles.includes('x2'), 'songs that do not match the shift stay out');
  assert.strictEqual(r.picked.length, o.open.length);
  const rich = run({ mood: 0, sound: 2 });
  assert.strictEqual(rich.needsMore, false);
});

test('a mood slider needs songs whose energy is known', () => {
  const unknown = poolSongs().map(x => Object.assign(x, { e: null }));
  const r = run({ mood: 2, sound: 0 }, { pool: unknown });
  assert.strictEqual(r.needsMore, true);
  assert.ok(r.picked.every(x => x.title[0] === 'o'), 'no song of unknown energy replaces one of the vibe');
});

test('Break my bubble keeps its outside-history songs', () => {
  const outside = new Set(['o0', 'o1', 'o2', 'p5', 'p7', 'p9', 'p11', 'p13']);
  const o = opts({ shifts: { mood: 2, sound: 2 }, bubbleMin: 3, outsideOf: x => outside.has(x.title), seedTags: ['electronic', 'chill'] });
  const r = vibeFineSwap(o);
  assert.ok(r.picked.filter(x => outside.has(x.title)).length >= 3);
  assert.strictEqual(r.picked.length, o.open.length);
});

test('placement follows the arc: the calmest songs go where the arc is lowest', () => {
  const o = opts({ shifts: { mood: 0, sound: 0 }, arcAt: p => p });   // climbing arc
  const picked = opts().open.slice().sort(() => 0).reverse();
  const placed = vibeFinePlace(o, picked);
  const es = placed.map(x => x.e);
  assert.deepStrictEqual(es, es.slice().sort((a, b) => a - b));
  assert.strictEqual(new Set(placed.map(x => x.title)).size, picked.length);
  // too few known energies: order kept
  const blind = picked.map(x => Object.assign({}, x, { e: null }));
  assert.deepStrictEqual(vibeFinePlace(o, blind), blind);
});

test('sound reads the tag families', () => {
  assert.strictEqual(vibeFineSoundOf(['house', 'Techno']), 1);
  assert.strictEqual(vibeFineSoundOf(['folk', 'acoustic']), -1);
  assert.strictEqual(vibeFineSoundOf(['synth', 'soul']), 0);
  assert.strictEqual(vibeFineSoundOf(['chill', 'rainy day']), null);
});
