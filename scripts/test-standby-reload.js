#!/usr/bin/env node
// The next-song deck kept playing muted in the background after a reload on
// a slow phone: the reload and the wait cap landed in the same check, so the
// confirm (pauseVideo) went out before the new load started. Runs the real
// checkDeckReady() from index.html against a fake player.
// Usage: node scripts/test-standby-reload.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('function checkDeckReady(deck){');
const end = html.indexOf('\nfunction onDeckConfirmed(deck){', start);
if (start < 0 || end < 0) { console.error('checkDeckReady not found in index.html'); process.exit(1); }

function setup({ elapsedMs, reason, playing = true, adReloaded = false, adAltTried = false, reloadedAgoMs = 0 }) {
  const calls = [];
  const timers = [];
  const now = Date.now();
  const player = {
    getPlayerState: () => (playing ? 1 : 3),
    loadVideoById: () => calls.push('load'),
    mute: () => calls.push('mute'),
  };
  const deck = { player, kind: 'yt', videoId: 'abc', pos: 1, muteStartTs: now - elapsedMs, adReloaded, adAltTried, adReloadedAt: now - reloadedAgoMs };
  const active = { id: 'active' };
  const env = {
    deckAdReason: () => reason,
    activeDeck: () => active,
    adWaitShown: false,
    showAdWait: () => {},
    adStandIn: () => {},
    state: { queue: [{}, {}], queuePos: 0 },
    adLog: (d, what) => calls.push('log:' + what),
    LOWEST_QUALITY: 'tiny',
    forceLowestQuality: () => {},
    adTryAlternate: () => calls.push('alt'),
    YT: { PlayerState: { PLAYING: 1 } },
    STANDBY_AD_RELOAD_MS: 1000, STANDBY_AD_ALT_MS: 1500, STANDBY_AD_ALT_SLOW_MS: 25000, STANDBY_AD_WAIT_MS: 60000,
    AD_MUTE_MAX_MS: 120000, UNMUTE_MAX_WAIT_MS: 20000, UNMUTE_RECHECK_MS: 3000,
    onDeckConfirmed: () => calls.push('confirm'),
    setTimeout: (fn, ms) => { timers.push(ms); return timers.length; },
  };
  const names = Object.keys(env);
  const make = new Function(...names, html.slice(start, end) + '\nreturn checkDeckReady;');
  const checkDeckReady = make(...names.map(n => env[n]));
  return { deck, calls, timers, run: () => checkDeckReady(deck) };
}

let pass = 0;
function check(name, fn) { fn(); pass++; console.log('ok  ' + name); }

check('reload past the wait cap rechecks instead of confirming in the same pass', () => {
  const t = setup({ elapsedMs: 61000, reason: 'not-moving' });
  t.run();
  assert.ok(t.calls.includes('load'), 'reload issued');
  assert.ok(!t.calls.includes('confirm'), 'not confirmed in the same pass as the reload');
  assert.deepStrictEqual(t.timers, [3000]);
});

check('after the reload, the next pass past the cap confirms (and so parks the deck)', () => {
  const t = setup({ elapsedMs: 64000, reason: 'not-moving', adReloaded: true, reloadedAgoMs: 3000 });
  t.run();
  assert.ok(!t.calls.includes('load'));
  assert.ok(t.calls.includes('confirm'));
});

check('switching to an alternate past the cap also rechecks first', () => {
  const t = setup({ elapsedMs: 90000, reason: 'not-moving', adReloaded: true, reloadedAgoMs: 26000 });
  t.run();
  assert.ok(t.calls.includes('alt'));
  assert.ok(!t.calls.includes('confirm'));
});

check('clean deck confirms at once', () => {
  const t = setup({ elapsedMs: 5000, reason: '' });
  t.run();
  assert.deepStrictEqual(t.calls, ['confirm']);
});

check('ad within the wait: reload once and keep waiting', () => {
  const t = setup({ elapsedMs: 2000, reason: 'duration' });
  t.run();
  assert.ok(t.calls.includes('load'));
  assert.ok(!t.calls.includes('confirm'));
});

console.log(pass + ' passed');
