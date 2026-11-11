#!/usr/bin/env node
// #767: songs added in EBBLESS to an imported (Spotify) playlist must survive
// a refresh from the source. Runs the real withManualTracks() from index.html
// against a fake cache. Usage: node scripts/test-manual-carry.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('const manualCarry = new Map();');
const end = html.indexOf('async function resolvePlaylist(', start);
if (start < 0 || end < 0) { console.error('withManualTracks not found in index.html'); process.exit(1); }
const cache = {};
const make = new Function('getCachedPlaylist', html.slice(start, end) + '\nreturn { withManualTracks, manualCarry };');
const { withManualTracks, manualCarry } = make((id) => cache[id] || null);

const sp = (n, vid) => ({ title: 'Spotify ' + n, artist: 'A', videoId: vid === undefined ? 'sp' + n : vid });
const mine = (n, vid) => ({ title: 'Mine ' + n, artist: 'B', videoId: vid === undefined ? 'my' + n : vid, manual: true });
const ids = (list) => list.map(t => t.videoId || t.title);
let pass = 0;
function check(name, fn) {
  for (const k of Object.keys(cache)) delete cache[k];
  manualCarry.clear();
  fn(); pass++; console.log('ok  ' + name);
}

check('hand-added song survives a refresh', () => {
  cache.p = { tracks: [sp(1), sp(2), mine(1)] };
  assert.deepStrictEqual(ids(withManualTracks('p', [sp(1), sp(3)])), ['sp1', 'sp3', 'my1']);
});

check('hand-added song with no match yet survives', () => {
  cache.p = { tracks: [sp(1), mine(2, null)] };
  assert.deepStrictEqual(ids(withManualTracks('p', [sp(1)])), ['sp1', 'Mine 2']);
});

check('song added during a running refresh is not wiped by the next snapshot', () => {
  cache.p = { tracks: [sp(1), mine(1)] };
  manualCarry.set('p', [mine(1)]);                 // captured when the refresh started
  cache.p = { tracks: [sp(1), mine(1), mine(2)] }; // user adds one mid-refresh
  assert.deepStrictEqual(ids(withManualTracks('p', [sp(1)])), ['sp1', 'my1', 'my2']);
});

check('no duplicate when Spotify now lists the hand-added song too', () => {
  cache.p = { tracks: [sp(1), mine(1)] };
  const out = withManualTracks('p', [sp(1), { title: 'Mine 1', artist: 'B', videoId: 'my1' }]);
  assert.deepStrictEqual(ids(out), ['sp1', 'my1']);
  assert.strictEqual(out[1].manual, true);
});

check('...and it survives Spotify dropping it again later', () => {
  cache.p = { tracks: [sp(1), mine(1)] };
  cache.p = { tracks: withManualTracks('p', [sp(1), { title: 'Mine 1', artist: 'B', videoId: 'my1' }]) };
  assert.deepStrictEqual(ids(withManualTracks('p', [sp(1)])), ['sp1', 'my1']);
});

check('same song by title + artist (unmatched add, Spotify row matched) is not doubled', () => {
  cache.p = { tracks: [sp(1), mine(3, null)] };
  manualCarry.set('p', [mine(3, null)]);
  const first = withManualTracks('p', [sp(1), { title: 'Mine 3', artist: 'B', videoId: 'v3' }]);
  cache.p = { tracks: first };
  assert.deepStrictEqual(ids(withManualTracks('p', [sp(1), { title: 'Mine 3', artist: 'B', videoId: 'v3' }])), ['sp1', 'v3']);
});

check('a song the user removed is not brought back from the cache', () => {
  cache.p = { tracks: [sp(1)] };
  assert.deepStrictEqual(ids(withManualTracks('p', [sp(1), sp(2)])), ['sp1', 'sp2']);
});

console.log(pass + ' passed');
