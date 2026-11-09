// swirl-daily: Swirl as an hour-long set of the day built around Liked Songs (#740). Run: node --test tools/swirl-daily.test.js
// Loads the SWIRL-DAILY block (and vibeSpreadArtists from VIBE-ARC) from index.html.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const block = name => {
  const m = new RegExp('/\\* ' + name + ':BEGIN[^*]*\\*/([\\s\\S]*?)/\\* ' + name + ':END \\*/').exec(html);
  assert.ok(m, name + ' block not found in index.html');
  return m[1];
};
const ctx = {};
vm.createContext(ctx);
vm.runInContext(block('VIBE-ARC') + '\n' + block('SWIRL-DAILY') + '\nthis.swirlDailyPick = swirlDailyPick;', ctx);

// n songs, every one by its own artist, energies spread over 0..1, 4 minutes each
function lib(prefix, n, extra){
  const out = [];
  for (let i = 0; i < n; i++) out.push(Object.assign({ videoId: prefix + i, title: prefix + i, artist: prefix + 'artist' + i, duration: 240, energy: ((i * 7) % n) / n, tags: ['soul'] }, extra && extra(i)));
  return out;
}
function opts(liked, library, more){
  return Object.assign({
    liked, library,
    tagsOf: t => t.tags || [],
    energyOf: t => (typeof t.energy === 'number' ? t.energy : null),
    durOf: t => t.duration || 0,
    artistOf: t => String(t.artist || '').toLowerCase(),
    declinedIds: new Set(), declinedArtists: new Set(), prev: new Set(),
    mood: { energy: 0.6, tags: ['soul'], avoid: [] },
    seed: '2026-11-05',
  }, more || {});
}
const total = (r, all) => r.tracks.reduce((n, t) => n + (all.get(t.videoId).duration || 0), 0);
const index = arr => new Map(arr.map(t => [t.videoId, t]));

test('runs mid > high > mid > low > mid', () => {
  const liked = lib('l', 30), library = lib('b', 60);
  const r = ctx.swirlDailyPick(opts(liked, library));
  assert.ok(r, 'built');
  assert.strictEqual(r.segments.length, 5);
  const all = index(liked.concat(library));
  const avg = [];
  let at = 0;
  r.segments.forEach(n => {
    assert.ok(n > 0, 'every part has songs');
    const es = r.tracks.slice(at, at + n).map(t => all.get(t.videoId).energy);
    avg.push(es.reduce((a, b) => a + b, 0) / es.length);
    at += n;
  });
  assert.ok(avg[1] > avg[0] + 0.15, 'rises to the peak: ' + avg);
  assert.ok(avg[1] > avg[2] + 0.15, 'comes down from the peak: ' + avg);
  assert.ok(avg[3] < avg[2] - 0.15, 'settles low: ' + avg);
  assert.ok(avg[4] > avg[3] + 0.15, 'mid finale: ' + avg);
  assert.strictEqual(new Set(r.tracks.map(t => t.videoId)).size, r.tracks.length, 'no song twice');
});

test('an hour, never past 70 minutes', () => {
  const liked = lib('l', 20, i => ({ duration: 150 + (i * 37) % 300 })), library = lib('b', 80, i => ({ duration: 180 + (i * 53) % 360 }));
  const all = index(liked.concat(library));
  for (const seed of ['2026-11-05', '2026-11-06', '2026-12-25']){
    const s = total(ctx.swirlDailyPick(opts(liked, library, { seed })), all);
    assert.ok(s >= 3600 && s <= 4200, seed + ': ' + s + 's');
  }
});

test('missing lengths count as the library average, long uploads stay out', () => {
  const liked = lib('l', 20, i => ({ duration: i % 2 ? 0 : 240 })), library = lib('b', 40);
  library.push({ videoId: 'mix', title: 'mix', artist: 'dj', duration: 3600, energy: 0.9, tags: ['soul'] });
  const r = ctx.swirlDailyPick(opts(liked, library));
  assert.ok(!r.tracks.some(t => t.videoId === 'mix'), 'no hour-long mix');
  const est = r.tracks.reduce((n, t) => n + (t.duration || 240), 0);
  assert.ok(est >= 3600 && est <= 4200, est + 's');
});

test('same date, same Swirl; another date, another one', () => {
  const liked = lib('l', 40), library = lib('b', 120);
  const ids = seed => ctx.swirlDailyPick(opts(liked, library, { seed })).tracks.map(t => t.videoId).join();
  assert.strictEqual(ids('2026-11-05'), ids('2026-11-05'));
  assert.notStrictEqual(ids('2026-11-05'), ids('2026-11-06'));
});

test('liked songs come first, then songs like them', () => {
  const liked = lib('l', 10, () => ({ tags: ['afro house'] }));
  const like = lib('s', 40, i => ({ artist: 'lartist' + (i % 10), tags: ['afro house'] }));
  const unlike = lib('u', 40, () => ({ tags: ['country'] }));
  const r = ctx.swirlDailyPick(opts(liked, unlike.concat(like)));
  const n = p => r.tracks.filter(t => t.videoId[0] === p).length;
  assert.ok(n('l') >= 8, 'liked songs: ' + n('l'));
  assert.ok(n('s') > n('u'), 'similar ' + n('s') + ' over unrelated ' + n('u'));
  assert.strictEqual(r.vibe, 'afro house');
});

test('thumbs-down songs and artists stay out', () => {
  const liked = lib('l', 20), library = lib('b', 60);
  const r = ctx.swirlDailyPick(opts(liked, library, { declinedIds: new Set(['l0', 'l1', 'b2']), declinedArtists: new Set(['lartist3', 'bartist4']) }));
  const ids = new Set(r.tracks.map(t => t.videoId));
  ['l0', 'l1', 'b2', 'l3', 'b4'].forEach(v => assert.ok(!ids.has(v), v + ' is out'));
});

test('too few liked songs falls back to the old blend', () => {
  assert.strictEqual(ctx.swirlDailyPick(opts([], lib('b', 60))), null);
  assert.strictEqual(ctx.swirlDailyPick(opts(lib('l', 4), lib('b', 60))), null);
  // thumbs-downs count against the minimum too
  assert.strictEqual(ctx.swirlDailyPick(opts(lib('l', 6), lib('b', 60), { declinedIds: new Set(['l0', 'l1']) })), null);
  assert.ok(ctx.swirlDailyPick(opts(lib('l', 5), lib('b', 60))));
});
