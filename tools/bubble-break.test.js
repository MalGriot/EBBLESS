// bubble-break: "Break my bubble" mixes in songs outside the listener's history that still sound like the seed (#744). Run: node --test tools/bubble-break.test.js
// Loads the BREAK-MY-BUBBLE block from index.html.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = /\/\* BREAK-MY-BUBBLE:BEGIN[^*]*\*\/([\s\S]*?)\/\* BREAK-MY-BUBBLE:END \*\//.exec(html);
assert.ok(m, 'BREAK-MY-BUBBLE block not found in index.html');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.bubbleBreakOrder = bubbleBreakOrder; this.bubbleQuota = bubbleQuota;', ctx);
const { bubbleBreakOrder, bubbleQuota } = ctx;

const BLACKLIST = new Set(['seen live', 'favorites', '80s']);
// 20 songs by artists the listener knows (strong matches, so they lead) and 40 by strangers
function pool(){
  const out = [];
  for (let i = 0; i < 20; i++) out.push({ title: 'known' + i, artist: 'known' + i, tags: ['soul', 'funk'], plays: 5e7 });
  for (let i = 0; i < 40; i++) out.push({ title: 'new' + i, artist: 'new' + i, tags: i % 2 ? ['soul', 'afrobeat'] : ['jazz', 'soul'], plays: 2000 + i * 5000 });
  return out;
}
function opts(over){
  const known = new Set();
  for (let i = 0; i < 20; i++) known.add('known' + i);
  return Object.assign({
    on: true, count: 12, seed: 'seed|2026-11-09',
    seedTags: ['soul', 'funk'], blacklist: BLACKLIST, langBlocked: new Set(['hindi']),
    historyArtists: known, historyKeys: new Set(), declinedKeys: new Set(), declinedArtists: new Set(), recentKeys: new Set(),
    keyOf: t => (t.title + '|' + t.artist).toLowerCase(), artistOf: t => t.artist.toLowerCase(),
    tagsOf: t => t.tags, playsOf: t => t.plays || 0, fitOf: () => null,
    order: pool(),
  }, over || {});
}
// What the Discover loop does: walk the order, one song per slot, stop at count
function walk(r, count, ok){
  const out = [], filled = new Set();
  for (const t of r.order){
    if (out.length >= count) break;
    const key = (t.title + '|' + t.artist).toLowerCase(), slot = r.slotOf(key);
    if (slot !== undefined && filled.has(slot)) continue;
    if (ok && !ok(t)) continue;
    if (slot !== undefined) filled.add(slot);
    out.push(Object.assign({ bubble: slot !== undefined }, t));
  }
  return out;
}

test('off: the order comes back untouched', () => {
  const o = opts({ on: false });
  const r = bubbleBreakOrder(o);
  assert.strictEqual(r.order, o.order);
  assert.strictEqual(r.quota, 0);
  assert.strictEqual(r.slotOf('new1|new1'), undefined);
});

test('on: about a third of the songs are outside the listener history, never all', () => {
  const r = bubbleBreakOrder(opts());
  assert.strictEqual(r.quota, 4);
  const got = walk(r, 12);
  assert.strictEqual(got.length, 12);
  assert.strictEqual(got.filter(t => t.bubble).length, 4);
  assert.ok(got.some(t => !t.bubble), 'the usual picks stay');
  assert.strictEqual(bubbleQuota(1), 0);
  assert.strictEqual(bubbleQuota(2), 0);
  assert.strictEqual(bubbleQuota(3), 1);
  assert.strictEqual(bubbleQuota(28), 9);
});

test('a bubble song that cannot be played is replaced by a stand-in, not left as a gap', () => {
  const r = bubbleBreakOrder(opts());
  const first = walk(r, 12).filter(t => t.bubble).map(t => t.title);
  const got = walk(r, 12, t => !first.includes(t.title));
  assert.strictEqual(got.filter(t => t.bubble).length, 4);
});

test('songs in the history never count as bubble songs', () => {
  const got = walk(bubbleBreakOrder(opts({ count: 28 })), 28);
  got.filter(t => t.bubble).forEach(t => assert.ok(t.title.startsWith('new'), t.title));
  const byTitle = walk(bubbleBreakOrder(opts({ historyArtists: new Set(), historyKeys: new Set(pool().filter(t => t.title.startsWith('new')).map(t => (t.title + '|' + t.artist).toLowerCase())) })), 12);
  byTitle.filter(t => t.bubble).forEach(t => assert.ok(t.title.startsWith('known'), t.title));
});

test('thumbs-down songs and artists never appear', () => {
  const o = opts({
    declinedKeys: new Set(['new1|new1', 'new3|new3']),
    declinedArtists: new Set(['new5', 'new7']),
  });
  const r = bubbleBreakOrder(o);
  const titles = r.order.map(t => t.title);
  ['new1', 'new3', 'new5', 'new7'].forEach(x => assert.ok(!titles.includes(x), x));
  assert.ok(walk(r, 12).some(t => t.bubble));
});

test('blacklisted tags do not count as a shared tag, and unpicked languages stay out', () => {
  const odd = [
    { title: 'live', artist: 'liveband', tags: ['seen live', 'rock'], plays: 100 },
    { title: 'dec', artist: 'decband', tags: ['80s'], plays: 100 },
    { title: 'hin', artist: 'hinband', tags: ['soul', 'hindi'], plays: 100 },
    { title: 'ok', artist: 'okband', tags: ['soul'], plays: 100 },
  ];
  const r = bubbleBreakOrder(opts({ order: odd, count: 3, seedTags: ['seen live', '80s', 'soul'] }));
  const got = walk(r, 3);
  assert.deepStrictEqual(got.filter(t => t.bubble).map(t => t.title), ['ok']);
});

test('a song outside the seed sound band (known /metrics fit) is not a bubble song', () => {
  const r = bubbleBreakOrder(opts({ fitOf: t => (t.title === 'new0' ? 0.2 : 0.8) }));
  assert.ok(!walk(r, 12).some(t => t.bubble && t.title === 'new0'));
  const all = bubbleBreakOrder(opts({ count: 28, fitOf: () => 0.2 }));
  assert.strictEqual(walk(all, 28).filter(t => t.bubble).length, 0);
});

test('prefers lower play counts and a different top tag than the seed', () => {
  const list = [
    { title: 'hit', artist: 'hitband', tags: ['soul'], plays: 5e7 },
    { title: 'deep', artist: 'deepband', tags: ['soul'], plays: 1500 },
    { title: 'other', artist: 'otherband', tags: ['jazz', 'soul'], plays: 1500 },
  ];
  const r = bubbleBreakOrder(opts({ order: list, count: 3, historyArtists: new Set(), seedTags: ['soul'] }));
  const first = walk(r, 3).find(t => t.bubble);
  assert.strictEqual(first.title, 'other');
  const r2 = bubbleBreakOrder(opts({ order: list.slice(0, 2), count: 3, historyArtists: new Set(), seedTags: ['soul'] }));
  assert.strictEqual(walk(r2, 3).find(t => t.bubble).title, 'deep');
});

test('same seed and day: same answer; another seed varies it', () => {
  const titles = o => bubbleBreakOrder(o).order.map(t => t.title).join(',');
  assert.strictEqual(titles(opts()), titles(opts()));
  const seeds = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(s => titles(opts({ seed: s + '|2026-11-09' }))));
  assert.ok(seeds.size > 1);
});

test('recently served songs are rotated out', () => {
  const base = walk(bubbleBreakOrder(opts()), 12).filter(t => t.bubble).map(t => t.title);
  const recent = new Set(base.map(t => t + '|' + t));
  const again = walk(bubbleBreakOrder(opts({ recentKeys: recent })), 12).filter(t => t.bubble).map(t => t.title);
  assert.strictEqual(again.filter(t => base.includes(t)).length < base.length, true);
});

test('a thin pool never fills past a third', () => {
  const few = pool().slice(0, 20).concat(pool().slice(20, 22));
  const got = walk(bubbleBreakOrder(opts({ order: few })), 12);
  assert.ok(got.filter(t => t.bubble).length <= 2);
});
