// vibe-energy-arc: typed vibe playlists ordered as an energy arc. Run: node --test tools/vibe-arc.test.js
// Loads the VIBE-ARC block from index.html with a stub fetchTrackMetrics.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = /\/\* VIBE-ARC:BEGIN[^*]*\*\/([\s\S]*?)\/\* VIBE-ARC:END \*\//.exec(html);
assert.ok(m, 'VIBE-ARC block not found in index.html');
const ctx = { energies: new Map() };
ctx.fetchTrackMetrics = async (tracks) => tracks.map(t => ctx.energies.has(t.title) ? { energy: ctx.energies.get(t.title) } : null);
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.vibeEnergyArc = vibeEnergyArc; this.vibeSpreadArtists = vibeSpreadArtists; this.vibeArcShape = vibeArcShape; this.vibeJoinScore = vibeJoinScore; this.vibeTimeScore = vibeTimeScore; this.vibeLyricsDark = vibeLyricsDark;', ctx);

const song = (i, artist) => ({ title: 's' + i, artist: artist || 'a' + i });

test('calmest first, peak about two thirds through, eases out', async () => {
  const tracks = [];
  for (let i = 0; i < 20; i++){ tracks.push(song(i)); ctx.energies.set('s' + i, ((i * 7) % 20) / 20); }
  const r = await ctx.vibeEnergyArc(tracks);
  assert.strictEqual(r.shape, 'rise');
  const e = r.tracks.map(t => ctx.energies.get(t.title));
  const peak = e.indexOf(Math.max(...e));
  assert.strictEqual(e[0], Math.min(...e));
  assert.ok(peak >= 11 && peak <= 14, 'peak at ' + peak);
  for (let i = 1; i <= peak; i++) assert.ok(e[i] >= e[i - 1], 'rises up to the peak');
  for (let i = peak + 1; i < e.length; i++) assert.ok(e[i] <= e[i - 1], 'falls after the peak');
  assert.ok(e[e.length - 1] > e[0], 'ends above where it started');
  assert.strictEqual(r.tracks.length, 20);
  assert.strictEqual(new Set(r.tracks.map(t => t.title)).size, 20, 'no song lost or doubled');
});

test('songs without metrics keep their spot', async () => {
  ctx.energies.clear();
  const tracks = [];
  for (let i = 0; i < 12; i++){ tracks.push(song(i)); if (i % 3) ctx.energies.set('s' + i, i / 12); }
  const r = await ctx.vibeEnergyArc(tracks);
  assert.strictEqual(r.shape, 'rise');
  [0, 3, 6, 9].forEach(i => assert.strictEqual(r.tracks[i].title, 's' + i));
});

test('too few known energies leaves the order alone', async () => {
  ctx.energies.clear();
  const tracks = [];
  for (let i = 0; i < 10; i++){ tracks.push(song(i)); if (i < 3) ctx.energies.set('s' + i, 1 - i / 10); }
  const r = await ctx.vibeEnergyArc(tracks);
  assert.strictEqual(r.shape, null);
  assert.deepStrictEqual(r.tracks.map(t => t.title), tracks.map(t => t.title));
});

test('danceability and BPM stand in when energy is missing', async () => {
  const saved = ctx.fetchTrackMetrics;
  ctx.fetchTrackMetrics = async (tracks) => tracks.map((t, i) => ({ energy: null, danceability: 0.3 + (i % 5) * 0.1, bpm: 70 + i * 6 }));
  const tracks = [];
  for (let i = 0; i < 10; i++) tracks.push(song(i));
  const r = await ctx.vibeEnergyArc(tracks);
  ctx.fetchTrackMetrics = saved;
  assert.strictEqual(r.shape, 'rise');
  assert.strictEqual(r.tracks[0].title, 's0', 'slowest, least danceable song opens');
});

test('no artist twice in a row after reordering', async () => {
  ctx.energies.clear();
  const tracks = [];
  for (let i = 0; i < 12; i++){ tracks.push(song(i, i < 4 ? 'same' : null)); ctx.energies.set('s' + i, i < 4 ? 0.1 + i * 0.01 : 0.5 + i * 0.01); }
  const r = await ctx.vibeEnergyArc(tracks);
  for (let i = 1; i < r.tracks.length; i++) assert.notStrictEqual(r.tracks[i].artist, r.tracks[i - 1].artist, 'at ' + i);
});

test('the vibe picks the arc shape', () => {
  assert.strictEqual(ctx.vibeArcShape('something to fall asleep to'), 'winddown');
  assert.strictEqual(ctx.vibeArcShape('deep work, coding all afternoon'), 'steady');
  assert.strictEqual(ctx.vibeArcShape('gym session, need hype'), 'build');
  assert.strictEqual(ctx.vibeArcShape('rainy sunday morning, making coffee'), 'rise');
});

test('sleep vibes wind down from start to finish', async () => {
  ctx.energies.clear();
  const tracks = [];
  for (let i = 0; i < 10; i++){ tracks.push(song(i)); ctx.energies.set('s' + i, i / 10); }
  const r = await ctx.vibeEnergyArc(tracks, 'help me fall asleep');
  assert.strictEqual(r.shape, 'winddown');
  const e = r.tracks.map(t => ctx.energies.get(t.title));
  for (let i = 1; i < e.length; i++) assert.ok(e[i] <= e[i - 1], 'falls at ' + i);
});

test('Camelot neighbours and close tempo join best', () => {
  assert.ok(ctx.vibeJoinScore({ camelot: '8A', bpm: 120 }, { camelot: '9A', bpm: 122 }) > ctx.vibeJoinScore({ camelot: '8A', bpm: 120 }, { camelot: '2B', bpm: 122 }));
  assert.ok(ctx.vibeJoinScore({ camelot: '12A' }, { camelot: '1A' }) > 0.5, 'the wheel wraps');
  assert.ok(Math.abs(ctx.vibeJoinScore({ bpm: 70 }, { bpm: 140 }) - 0.4) < 1e-9, 'double time counts as a full tempo match (tempo is 0.4 of the score)');
  assert.strictEqual(ctx.vibeJoinScore(null, { bpm: 100 }), 0);
});

test('near-equal neighbours swap for a smoother key join', async () => {
  const saved = ctx.fetchTrackMetrics;
  // s1 and s2 sit at almost the same energy; s2 shares s0's key, s1 clashes.
  const m = { s0: { energy: 0.1, camelot: '5A', bpm: 100 }, s1: { energy: 0.30, camelot: '11B', bpm: 100 }, s2: { energy: 0.31, camelot: '5A', bpm: 100 } };
  for (let i = 3; i < 8; i++) m['s' + i] = { energy: 0.4 + i * 0.05, camelot: null, bpm: null };
  ctx.fetchTrackMetrics = async (tracks) => tracks.map(t => m[t.title] || null);
  const tracks = [];
  for (let i = 0; i < 8; i++) tracks.push(song(i));
  const r = await ctx.vibeEnergyArc(tracks, 'winding down');
  ctx.fetchTrackMetrics = saved;
  const order = r.tracks.map(t => t.title);
  assert.strictEqual(r.shape, 'winddown');
  assert.ok(order.indexOf('s2') === order.indexOf('s0') - 1 || order.indexOf('s2') === order.indexOf('s0') + 1, 'same-key songs sit together: ' + order.join(' '));
});

test('right-now score: close in time of day counts, far does not, old plays fade', () => {
  const now = new Date(2026, 10, 4, 23, 0).getTime();   // a Wednesday, 11pm
  const lastWeekSameTime = new Date(2026, 9, 28, 22, 30).getTime();
  const sameTimeLongAgo = new Date(2026, 6, 1, 23, 0).getTime();
  const morning = new Date(2026, 10, 3, 8, 0).getTime();
  const near = ctx.vibeTimeScore(lastWeekSameTime, now);
  assert.ok(near > 1, 'last week at about this time: ' + near);
  assert.strictEqual(ctx.vibeTimeScore(morning, now), 0);
  assert.ok(ctx.vibeTimeScore(sameTimeLongAgo, now) < near / 4, 'months old plays fade');
  const justAfterMidnight = new Date(2026, 10, 4, 0, 30).getTime();
  assert.ok(ctx.vibeTimeScore(justAfterMidnight, new Date(2026, 10, 4, 23, 30).getTime()) > 0, 'wraps round midnight');
});

test('lyric darkness needs both enough dark words and a dark share', () => {
  const filler = 'we walk along the river in the morning light and talk about the summer '.repeat(6);
  assert.strictEqual(ctx.vibeLyricsDark(filler), false);
  assert.strictEqual(ctx.vibeLyricsDark(filler + 'I cry alone at the funeral, death and grief, tears and pain, goodbye'), true);
  assert.strictEqual(ctx.vibeLyricsDark('cry die death funeral grave tears'), false, 'too short to judge');
});

// vibe-live runs against the real queue; here the queue, tracks and metrics are stubs.
const live = /\/\* VIBE-LIVE:BEGIN[^*]*\*\/([\s\S]*?)\/\* VIBE-LIVE:END \*\//.exec(html);
assert.ok(live, 'VIBE-LIVE block not found in index.html');
function liveCtx(songs, energies){
  const c = { toasts: [], rendered: 0, preloaded: 0, lyrics: {} };
  c.state = { queue: songs.map((s, i) => ({ idx: i })), queuePos: 0 };
  c.trackAt = (pos) => { const e = c.state.queue[pos]; return e ? songs[e.idx] : null; };
  c.metricMemo = new Map(songs.map((s, i) => [s.title + '|' + s.artist, energies[i] == null ? null : { energy: energies[i] }]));
  c.tagCacheKey = (t) => t.title + '|' + t.artist;
  c.primaryArtistKey = (a) => String(a).toLowerCase();
  c.discoverVibeFor = () => c.vibe === undefined ? 'sunny brunch' : c.vibe;
  c.discoverOriginId = () => 'custom-vibe-session';
  c.showToast = (m) => c.toasts.push(m);
  c.renderQueuePanel = () => { c.rendered++; };
  c.schedulePreload = () => { c.preloaded++; };
  c.fetchLyrics = async (t) => ({ lines: (c.lyrics[t.title] || '').split('\n').map(text => ({ text })) });
  c.setTimeout = setTimeout;
  vm.createContext(c);
  vm.runInContext(m[1] + live[1] + '\nthis.vibeOnEarlySkip = vibeOnEarlySkip; this.vibeNotePause = vibeNotePause; this.vibeCheckUpcomingLyrics = vibeCheckUpcomingLyrics; this.setPaused = (t) => { vibePausedAt = t; };', c);
  return c;
}
const titles = (c) => c.state.queue.map(e => 's' + e.idx);

test('an early skip takes that artist out of the next stretch, never the very next song', () => {
  const songs = [song(0, 'x'), song(1, 'y'), song(2, 'x'), song(3, 'z'), song(4, 'x')];
  const c = liveCtx(songs, [0.5, 0.5, 0.5, 0.5, 0.5]);
  c.vibeOnEarlySkip(songs[0]);
  assert.deepStrictEqual(titles(c), ['s0', 's1', 's3']);
});

test('two early skips on the high side ease the next stretch back', () => {
  const songs = []; for (let i = 0; i < 12; i++) songs.push(song(i));
  const e = [0.9, 0.5, 0.88, 0.4, 0.85, 0.45, 0.9, 0.5, 0.42, 0.8, 0.48, 0.5];
  const c = liveCtx(songs, e);
  c.vibeOnEarlySkip(songs[0]);
  assert.strictEqual(c.toasts.length, 0, 'one skip is not a pattern');
  c.state.queuePos = 1;
  c.vibeOnEarlySkip(songs[2]);
  assert.deepStrictEqual(c.toasts, ['Easing it back']);
  const after = c.state.queue.slice(3, 11).map(x => e[x.idx]);
  const firstHigh = after.findIndex(x => x > 0.6);
  assert.ok(after.slice(firstHigh).every(x => x > 0.6), 'high songs moved to the end of the stretch: ' + after.join(' '));
});

test('nothing happens outside a vibe queue', () => {
  const songs = [song(0, 'x'), song(1, 'y'), song(2, 'x')];
  const c = liveCtx(songs, [0.5, 0.5, 0.5]);
  c.vibe = '';
  c.vibeOnEarlySkip(songs[0]);
  assert.deepStrictEqual(titles(c), ['s0', 's1', 's2']);
});

test('after a long pause a much stronger next song trades places with a calmer one', () => {
  const songs = []; for (let i = 0; i < 5; i++) songs.push(song(i));
  const c = liveCtx(songs, [0.3, 0.8, 0.7, 0.35, 0.6]);
  c.setPaused(Date.now() - 20 * 60000);
  c.vibeNotePause(false);
  assert.deepStrictEqual(titles(c), ['s0', 's3', 's1', 's2', 's4']);
  assert.strictEqual(c.preloaded, 1);
  const c2 = liveCtx(songs, [0.3, 0.8, 0.7, 0.35, 0.6]);
  c2.setPaused(Date.now() - 60000);
  c2.vibeNotePause(false);
  assert.deepStrictEqual(titles(c2), ['s0', 's1', 's2', 's3', 's4'], 'a short pause changes nothing');
});

test('a bright vibe drops an upcoming song whose lyrics are mostly grief', async () => {
  const songs = [0, 1, 2, 3].map(i => Object.assign(song(i), { videoId: 'v' + i }));
  const c = liveCtx(songs, [0.5, 0.5, 0.5, 0.5]);
  const filler = 'we walk along the river in the morning light and talk about the summer '.repeat(6);
  c.lyrics.s1 = filler;
  c.lyrics.s2 = filler + 'I cry alone at the funeral, death and grief, tears and pain, goodbye';
  await c.vibeCheckUpcomingLyrics();
  assert.deepStrictEqual(titles(c), ['s0', 's1', 's3']);
  c.vibe = 'late night drive';
  const c2 = liveCtx(songs, [0.5, 0.5, 0.5, 0.5]);
  c2.vibe = 'late night drive';
  c2.lyrics.s1 = c.lyrics.s2;
  await c2.vibeCheckUpcomingLyrics();
  assert.deepStrictEqual(titles(c2), ['s0', 's1', 's2', 's3'], 'only bright vibes are checked');
});
