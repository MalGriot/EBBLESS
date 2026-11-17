#!/usr/bin/env node
// First-play funnel (T-0007). Runs the real play-funnel counters from index.html with stubbed
// browser pieces, and checks the one-tap Play wiring and the Sheet changes in the source.
// Usage: node scripts/test-first-play.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const gs = fs.readFileSync(path.join(root, 'tools', 'beta-sheet.gs'), 'utf8');
const start = html.indexOf('/* play-funnel:start */');
const end = html.indexOf('/* play-funnel:end */', start);
if (start < 0 || end < 0) { console.error('play-funnel block not found in index.html'); process.exit(1); }

// The real counters, with a fake clock, fake timers and in-memory stats.
function funnel(enabled = true) {
  const env = { now: 1_000_000, timers: [], enabled, saves: 0 };
  const stats = { attempt: 0, pend: { playTapped: 0, playStarted: 0, playFailed: 0 } };
  const api = new Function('env', 'stats', `
    const Date = { now: () => env.now };
    const setTimeout = (fn, ms) => { env.timers.push({ fn, at: env.now + ms }); return env.timers.length; };
    const clearTimeout = () => { env.timers.length = 0; };
    const statsEnabled = () => env.enabled;
    const statsTouch = () => {};
    const statsSave = () => { env.saves++; };
    ${html.slice(start, end)}
    return { statsPlayTapped, statsPlayStarted, statsPlayError, statsAttemptExpire, STATS_PLAY_TIMEOUT_MS };
  `)(env, stats);
  const advance = (ms) => { env.now += ms; env.timers.filter(t => t.at <= env.now).forEach(t => t.fn()); };
  return { env, stats, api, advance };
}

let pass = 0;
const check = (name, fn) => { fn(); pass++; console.log('ok  ' + name); };

check('tap then a real playing event: one tapped, one started, no failure', () => {
  const f = funnel();
  f.api.statsPlayTapped();
  f.advance(3000);
  f.api.statsPlayStarted();
  f.advance(60_000);
  assert.deepStrictEqual(f.stats.pend, { playTapped: 1, playStarted: 1, playFailed: 0 });
});
check('tap with no playing event: counted as failed after the timeout (20 s)', () => {
  const f = funnel();
  f.api.statsPlayTapped();
  f.advance(19_000);
  assert.strictEqual(f.stats.pend.playFailed, 0);
  f.advance(1_500);
  assert.deepStrictEqual(f.stats.pend, { playTapped: 1, playStarted: 0, playFailed: 1 });
});
check('a start that arrives after the timeout does not also count as started', () => {
  const f = funnel();
  f.api.statsPlayTapped();
  f.env.now += 25_000;                 // timer never fired (tab was suspended)
  f.api.statsPlayStarted();
  assert.deepStrictEqual(f.stats.pend, { playTapped: 1, playStarted: 0, playFailed: 1 });
});
check('a deck error counts as failed straight away, once', () => {
  const f = funnel();
  f.api.statsPlayTapped();
  f.api.statsPlayError();
  f.api.statsPlayError();
  f.advance(60_000);
  assert.deepStrictEqual(f.stats.pend, { playTapped: 1, playStarted: 0, playFailed: 1 });
});
check('repeat taps while one is waiting count once; a playing event with no tap counts nothing', () => {
  const f = funnel();
  f.api.statsPlayStarted();
  assert.strictEqual(f.stats.pend.playStarted, 0);
  f.api.statsPlayTapped(); f.api.statsPlayTapped(); f.api.statsPlayTapped();
  assert.strictEqual(f.stats.pend.playTapped, 1);
});
check('a tap the tester left behind (tab closed) is counted failed on the next open', () => {
  const f = funnel();
  f.api.statsPlayTapped();
  f.env.timers.length = 0; f.env.now += 3600_000;   // page gone, timer lost
  f.api.statsAttemptExpire();
  assert.deepStrictEqual(f.stats.pend, { playTapped: 1, playStarted: 0, playFailed: 1 });
});
check('non-testers and opted-out browsers record nothing', () => {
  const f = funnel(false);
  f.api.statsPlayTapped(); f.api.statsPlayStarted(); f.api.statsPlayError();
  assert.deepStrictEqual(f.stats.pend, { playTapped: 0, playStarted: 0, playFailed: 0 });
});

// ---- the counters are wired end to end ----
check('the batch carries the counters and an empty batch is still skipped', () => {
  assert.ok(html.includes('playTapped: 0, playStarted: 0, playFailed: 0, features: {}'));
  assert.ok(html.includes('!p.playTapped && !p.playStarted && !p.playFailed'));
});
check('play_started comes from the deck PLAYING event, not statsTick', () => {
  const m = /if \(e\.data === YT\.PlayerState\.PLAYING\)\{[^\n]*statsPlayStarted\(\)/.exec(html);
  assert.ok(m, 'onDeckStateChange PLAYING branch must call statsPlayStarted');
  const tick = html.slice(html.indexOf('function statsTick()'), html.indexOf('function statsTick()') + 1500);
  assert.ok(!/playStarted/.test(tick), 'statsTick must not touch playStarted');
});
check('taps are counted from the splash Play, the play button, a playlist Play and the toggle', () => {
  assert.ok(/function playFirstSong\(\)\{[\s\S]*?statsPlayTapped\(\)/.test(html));
  assert.ok(/if \(s !== 1\) statsPlayTapped\(\);\n  playIndex\(state\.queuePos\)/.test(html));
  assert.ok(/statsPlayTapped\(\);\n  if \(nudgeId\)/.test(html));
  assert.ok(/statsPlayTapped\(\);\n  loadPlaylistIntoPlayer\(pl\);\n  setView\('player'\)/.test(html));
});

// ---- one-tap Play on the first screen ----
check('the splash shows Play first, as the primary button, ahead of Import, Tutorial and Enter', () => {
  const i = html.indexOf('id="splashPlayNow"');
  assert.ok(i > 0);
  assert.ok(/id="splashPlayNow" type="button" class="splash-choice-btn splash-choice-btn-primary/.test(html));
  assert.ok(i < html.indexOf('id="splashBringMusic"') && i < html.indexOf('id="splashPlayTutorial"') && i < html.indexOf('id="splashSkipTutorial"'));
  assert.ok(!/id="splashBringMusic"[^>]*splash-choice-btn-primary/.test(html), 'Import must not also be primary');
});
check('tapping Play enters the app like Enter and starts the first starter in the same tap, with no sign-in step', () => {
  const h = html.slice(html.indexOf("closest('#splashPlayNow')") - 120, html.indexOf("closest('#splashPlayNow')") + 400);
  assert.ok(h.includes("$('splashSkipTutorial')") && h.includes('enter.click()') && h.includes('playFirstSong()'));
  const body = html.slice(html.indexOf('function playFirstSong()'), html.indexOf('function playFirstSong()') + 700);
  assert.ok(body.includes('beginImport(entry.id, false, entry.type)'));
  assert.ok(!/signIn|google|prompt\(/i.test(body), 'first song path must not sign in');
});
check('the first song is the SoundCloud starter, so it needs no Spotify and no Google', () => {
  assert.ok(/STARTER_LIBRARY_URLS = \[\n  'https:\/\/soundcloud\.com\//.test(html));
});
check('Tutorial and Enter still exist and are handled by the same splash code', () => {
  assert.ok(html.includes("const playBtn = $('splashPlayTutorial'), skipBtn = $('splashSkipTutorial');"));
  assert.ok(html.includes("if (skipBtn) skipBtn.addEventListener('click'"));
  assert.ok(html.includes("if (playBtn) playBtn.addEventListener('click'"));
});
check('a returning tester who never played sees the choice (with Play) on every visit', () => {
  assert.ok(/else if \(onboardingComplete && !hasEverPlayed\(\)\)\{\n[^\n]*\n  showSplashChoice\(\);\n\}/.test(html));
});
check('Google One Tap waits for the first song (018fce4 already held the nudge card and install bar)', () => {
  assert.ok(html.includes('if (!returning && !hasEverPlayed()){ oneTapWaiting = true; return; }'));
  assert.ok(html.includes('if (oneTapWaiting){ oneTapWaiting = false; setTimeout(() => initGoogleOneTap(), 6000); }'));
  assert.ok(html.includes('if (!hasEverPlayed()){ signInNudgeWaiting = true; return; }'));
});
check('the splash starter is not resolved twice and does not inflate playlists_added', () => {
  assert.ok(html.includes('if (id === firstSongStarting) continue;'));
  assert.ok(html.includes('function statsImport(id){ if (id === firstSongStarting) return;'));
});

check('the 12 s splash safety net no longer hides the Play choice on any device', () => {
  const i = html.indexOf('splashSafetyEl.classList.add(');
  const w = html.slice(i - 400, i);
  assert.ok(w.includes("!splashSafetyEl.classList.contains('is-choice')"));
  assert.ok(!w.includes('ebb-android'));
});

// ---- Sheet: new columns and rows only, nothing moved ----
check('Analytics: the original headers keep their order and the three new ones come last', () => {
  const m = /HEADERS\[ANALYTICS\] = \[([\s\S]*?)\]\.concat\(FEATURES\.map\(function \(f\) \{ return 'uses_' \+ f; \}\), \[([^\]]*)\]\);/.exec(gs);
  assert.ok(m, 'HEADERS[ANALYTICS] shape');
  const old = m[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
  assert.deepStrictEqual(old, ['tester_number', 'tester_id', 'first_active', 'last_active', 'days_since_active', 'sessions',
    'listening_minutes', 'songs_played', 'playlists_played', 'playlists_added', 'days_active', 'returned_within_7d', 'active_days']);
  assert.deepStrictEqual(m[2].split(',').map(x => x.trim().replace(/^'|'$/g, '')), ['plays_tapped', 'plays_started', 'plays_failed']);
});
check('the Sheet adds the three counts to the tester row', () => {
  ['plays_tapped', 'plays_started', 'plays_failed'].forEach((h, i) => {
    const f = ['playTapped', 'playStarted', 'playFailed'][i];
    assert.ok(gs.includes("add('" + h + "', d." + f + ");"));
  });
});
check('Dashboard: the old rows are untouched and the new FIRST PLAY block sits after "7-day return rate"', () => {
  const rate = gs.indexOf("['7-day return rate'");
  const first = gs.indexOf("['FIRST PLAY (Analytics tab, anonymous)'");
  assert.ok(rate > 0 && first > rate);
  assert.ok(gs.indexOf("['Opened, tapped play, never started'") > first);
  assert.ok(gs.includes('=IFERROR(TEXT(B29/B28,"0%"),"-")'), 'B29/B28 references must not move');
  assert.ok(gs.includes('[1, 8, 14, 17, 20, 32].forEach'));
});
console.log(pass + ' passed');
