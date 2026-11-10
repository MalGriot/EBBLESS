// #746: the Android "open music links in EBBLESS" prompt decisions. Run: node --test tools/link-prompt.test.js
// Loads the LINK-PROMPT block from index.html.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = /\/\* LINK-PROMPT:BEGIN \*\/([\s\S]*?)\/\* LINK-PROMPT:END \*\//.exec(html);
assert.ok(m, 'LINK-PROMPT block not found in index.html');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.decide = linkPromptDecide; this.label = linkPromptLabel; this.info = linkPromptSettingsInfo; this.C = { P1: LINK_PROMPT_SNOOZE_MS, SP: LINK_SPOTIFY_SNOOZE_MS, WAIT: LINK_SPOTIFY_WAIT_MS, SONGS: LINK_SPOTIFY_MIN_SONGS };', ctx);
const plain = (f) => (...a) => JSON.parse(JSON.stringify(f(...a)));   // objects from the vm context have another prototype
const decide = plain(ctx.decide), info = plain(ctx.info), label = ctx.label, C = ctx.C;
const DAY = 24 * 60 * 60 * 1000, NOW = 1.8e12;
const AM = 'music.apple.com', YT = 'music.youtube.com', SP = 'open.spotify.com';

// new bridge, first card territory: one song played, nothing on
const base = { isNative: true, hosts: '', songsPlayed: 1, loading: false, now: NOW, spotifyInstalled: false,
  shownAt: 0, dismissedAt: 0, visitedAt: 0, confirmed: false, spDismissedAt: 0, spVisitedAt: 0, spConfirmed: false, spForced: false };
const w = (o) => Object.assign({}, base, o);
// first card settled and old enough, ten songs in: Spotify card territory
const late = (o) => w(Object.assign({ hosts: AM + ',' + YT, confirmed: true, shownAt: NOW - 4 * DAY, songsPlayed: 10 }, o));
const shown = (o) => decide(o).show;
const resolved = (o) => decide(o).resolve;

test('constants: 14 and 30 day snoozes, 3 days, 10 songs', () => {
  assert.strictEqual(C.P1, 14 * DAY);
  assert.strictEqual(C.SP, 30 * DAY);
  assert.strictEqual(C.WAIT, 3 * DAY);
  assert.strictEqual(C.SONGS, 10);
});

test('never shown or resolved outside the native app', () => {
  for (const isNative of [false, undefined, 'yes']) {
    assert.deepStrictEqual(decide(w({ isNative })), { show: null, resolve: [] });
    assert.deepStrictEqual(decide(late({ isNative, hosts: '', confirmed: true })), { show: null, resolve: [] });
  }
  assert.deepStrictEqual(decide(null), { show: null, resolve: [] });
});

test('first card shows after the first song when Apple Music and YouTube Music are off', () => {
  assert.strictEqual(shown(base), 'p1');
  assert.strictEqual(shown(w({ songsPlayed: 40 })), 'p1');
  assert.strictEqual(shown(w({ hosts: SP })), 'p1');          // only Spotify on: still offered
  assert.strictEqual(shown(w({ hosts: AM })), 'p1');          // one of two, no settings visit yet
  assert.strictEqual(shown(w({ hosts: YT })), 'p1');
});

test('first card waits for the first song and a song that is not mid-load', () => {
  for (const songsPlayed of [0, undefined, null, -1, 'x']) assert.strictEqual(shown(w({ songsPlayed })), null, String(songsPlayed));
  assert.strictEqual(shown(w({ loading: true })), null);
});

test('both on resolves the first card; confirmed never shows it again', () => {
  const both = w({ hosts: AM + ',' + YT });
  assert.strictEqual(shown(both), null);
  assert.deepStrictEqual(resolved(both), ['p1']);
  assert.deepStrictEqual(resolved(w({ hosts: AM + ',' + YT, confirmed: true })), []);
  assert.strictEqual(shown(w({ confirmed: true })), null);
  assert.deepStrictEqual(resolved(w({ hosts: AM + ',' + YT + ',' + SP })), ['p1', 'p2']);
});

test('one of the two on after a settings visit counts as done', () => {
  for (const hosts of [AM, YT]) {
    const o = w({ hosts, visitedAt: NOW - 1000 });
    assert.strictEqual(shown(o), null, hosts);
    assert.deepStrictEqual(resolved(o), ['p1'], hosts);
  }
  // visited but nothing ticked: the card stays on offer
  assert.strictEqual(shown(w({ hosts: '', visitedAt: NOW - 1000 })), 'p1');
  assert.deepStrictEqual(resolved(w({ hosts: '', visitedAt: NOW - 1000 })), []);
  // Spotify alone does not count as done
  assert.deepStrictEqual(resolved(w({ hosts: SP, visitedAt: NOW - 1000 })), ['p2']);
});

test('Spotify greyed forever does not keep the first card alive', () => {
  const o = w({ hosts: AM + ',' + YT });   // Spotify never appears
  assert.strictEqual(shown(o), null);
  assert.deepStrictEqual(resolved(o), ['p1']);
  assert.strictEqual(shown(w({ hosts: AM, visitedAt: NOW - 1 })), null);
});

test('first card: Not now hides it 14 days, then back; a future stamp does not hide it forever', () => {
  assert.strictEqual(shown(w({ dismissedAt: NOW - 1000 })), null);
  assert.strictEqual(shown(w({ dismissedAt: NOW - 13 * DAY })), null);
  assert.strictEqual(shown(w({ dismissedAt: NOW - 14 * DAY })), 'p1');
  assert.strictEqual(shown(w({ dismissedAt: NOW - 30 * DAY })), 'p1');
  assert.strictEqual(shown(w({ dismissedAt: NOW + 365 * DAY })), 'p1');
});

test('no card when links are unsupported or unknown', () => {
  for (const hosts of ['unsupported', 'unknown']) {
    assert.deepStrictEqual(decide(late({ hosts })), { show: null, resolve: [] }, hosts);
    assert.deepStrictEqual(decide(w({ hosts })), { show: null, resolve: [] }, hosts);
  }
});

test('Spotify card: shows when everything is met', () => {
  assert.strictEqual(shown(late()), 'p2B');
});

test('Spotify card: only once the first card is settled', () => {
  // first card never settled: first card is the one offered, not Spotify
  assert.strictEqual(shown(late({ hosts: '', confirmed: false })), 'p1');
  // first card dismissed 5 days ago: settled, Spotify may show
  assert.strictEqual(shown(late({ hosts: '', confirmed: false, dismissedAt: NOW - 5 * DAY })), 'p2B');
  // first card satisfied by hosts alone also counts
  assert.strictEqual(shown(late({ confirmed: false })), 'p2B');
});

test('Spotify card: needs 10 songs', () => {
  assert.strictEqual(shown(late({ songsPlayed: 9 })), null);
  assert.strictEqual(shown(late({ songsPlayed: 10 })), 'p2B');
  assert.strictEqual(shown(late({ songsPlayed: undefined })), null);
});

test('Spotify card: needs 3 days since the first card was shown', () => {
  assert.strictEqual(shown(late({ shownAt: NOW - 3 * DAY + 1000 })), null);
  assert.strictEqual(shown(late({ shownAt: NOW - 3 * DAY })), 'p2B');
  assert.strictEqual(shown(late({ shownAt: 0 })), null);
  assert.strictEqual(shown(late({ shownAt: NOW + DAY })), null);
});

test('Spotify card: step A when Spotify is installed, step B when it is not', () => {
  assert.strictEqual(shown(late({ spotifyInstalled: true })), 'p2A');
  assert.strictEqual(shown(late({ spotifyInstalled: false })), 'p2B');
  assert.strictEqual(shown(late({ spotifyInstalled: undefined })), 'p2B');
  // back from Spotify's settings: step B
  assert.strictEqual(shown(late({ spotifyInstalled: true, spVisitedAt: NOW - 1000 })), 'p2B');
});

test('Spotify card: Not now hides it 30 days', () => {
  assert.strictEqual(shown(late({ spDismissedAt: NOW - DAY })), null);
  assert.strictEqual(shown(late({ spDismissedAt: NOW - 29 * DAY })), null);
  assert.strictEqual(shown(late({ spDismissedAt: NOW - 30 * DAY })), 'p2B');
  assert.strictEqual(shown(late({ spDismissedAt: NOW + 365 * DAY })), 'p2B');
});

test('Spotify card: once open.spotify.com is on it resolves and never shows again', () => {
  const on = late({ hosts: AM + ',' + YT + ',' + SP });
  assert.strictEqual(shown(on), null);
  assert.deepStrictEqual(resolved(on), ['p2']);
  assert.deepStrictEqual(resolved(late({ hosts: AM + ',' + YT + ',' + SP, spConfirmed: true })), []);
  assert.strictEqual(shown(late({ spConfirmed: true })), null);
});

test('Spotify card: not mid-load', () => {
  assert.strictEqual(shown(late({ loading: true })), null);
});

test('never two cards at once: the first card wins while it is due', () => {
  // everything for Spotify is ready, but the first card (snooze over) is due again
  const o = late({ hosts: '', confirmed: false, dismissedAt: NOW - 15 * DAY });
  assert.strictEqual(shown(o), 'p1');
});

test('Settings-forced Spotify flow skips the waiting rules', () => {
  const o = w({ hosts: AM + ',' + YT, songsPlayed: 1, spForced: true, spotifyInstalled: true, spVisitedAt: NOW - 1000 });
  assert.strictEqual(shown(o), 'p2B');
  assert.strictEqual(shown(w({ hosts: AM + ',' + YT, spForced: true })), 'p2B');
  assert.strictEqual(shown(w({ hosts: AM + ',' + YT, spForced: true, spotifyInstalled: true })), 'p2A');
});

test('old app bridge (no linkHosts): first card only, from linkState', () => {
  const old = (o) => Object.assign({}, base, { hosts: undefined, legacyState: 'none' }, o);
  assert.strictEqual(shown(old()), 'p1');
  assert.strictEqual(shown(old({ legacyState: 'some' })), 'p1');
  assert.strictEqual(shown(old({ songsPlayed: 0 })), null);
  assert.strictEqual(shown(old({ loading: true })), null);
  assert.strictEqual(shown(old({ confirmed: true })), null);
  assert.strictEqual(shown(old({ dismissedAt: NOW - 13 * DAY })), null);
  assert.strictEqual(shown(old({ dismissedAt: NOW - 14 * DAY })), 'p1');
  assert.strictEqual(shown(old({ isNative: false })), null);
  for (const legacyState of ['unsupported', 'unknown', '', undefined, 'None', 'bogus']) assert.deepStrictEqual(decide(old({ legacyState })), { show: null, resolve: [] }, String(legacyState));
  assert.deepStrictEqual(decide(old({ legacyState: 'all' })), { show: null, resolve: ['p1'] });
  assert.deepStrictEqual(decide(old({ legacyState: 'all', confirmed: true })), { show: null, resolve: [] });
  // never the Spotify card on an old bridge, however late
  assert.strictEqual(shown(old({ legacyState: 'all', songsPlayed: 50, shownAt: NOW - 90 * DAY, confirmed: true })), null);
});

test('Settings row text', () => {
  assert.deepStrictEqual(info(AM + ',' + YT, undefined), { hidden: false, detail: 'Apple Music, YouTube Music: on. Spotify: off', appOn: true, spotifyOff: true });
  assert.strictEqual(info(AM + ',' + YT + ',' + SP).detail, 'Apple Music, YouTube Music, Spotify: on');
  assert.strictEqual(info(AM + ',' + YT + ',' + SP).spotifyOff, false);
  assert.strictEqual(info('').detail, 'Apple Music, YouTube Music, Spotify: off');
  assert.strictEqual(info('').appOn, false);
  assert.strictEqual(info(AM).detail, 'Apple Music: on. YouTube Music, Spotify: off');
  assert.strictEqual(info(YT + ',' + SP).detail, 'YouTube Music, Spotify: on. Apple Music: off');
  assert.strictEqual(info(SP).appOn, false);
});

test('Settings row: hidden when unsupported, plain when unknown', () => {
  assert.deepStrictEqual(info('unsupported'), { hidden: true, detail: '', appOn: false, spotifyOff: false });
  assert.deepStrictEqual(info('unknown'), { hidden: false, detail: '', appOn: false, spotifyOff: false });
});

test('Settings row on an old bridge keeps the old state words', () => {
  assert.deepStrictEqual(info(undefined, 'all'), { hidden: false, detail: 'On', appOn: true, spotifyOff: false });
  assert.strictEqual(info(undefined, 'some').detail, 'Partly on');
  assert.strictEqual(info(undefined, 'none').detail, 'Off');
  assert.strictEqual(info(undefined, 'unsupported').hidden, true);
  assert.strictEqual(info(undefined, 'unknown').detail, '');
  assert.strictEqual(label('all'), 'On');
  for (const s of ['unsupported', 'unknown', '', undefined]) assert.strictEqual(label(s), '', String(s));
});
