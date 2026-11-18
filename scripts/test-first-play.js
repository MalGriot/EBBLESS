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
check('taps are counted from the splash Resume, the play button, a playlist Play and the toggle', () => {
  assert.ok(/function splashResume\(\)\{\n  statsPlayTapped\(\);/.test(html));
  assert.ok(/if \(s !== 1\) statsPlayTapped\(\);\n  playIndex\(state\.queuePos\)/.test(html));
  assert.ok(/statsPlayTapped\(\);\n  if \(nudgeId\)/.test(html));
  assert.ok(/statsPlayTapped\(\);\n  loadPlaylistIntoPlayer\(pl\);\n  setView\('player'\)/.test(html));
});

// ---- Resume (history) or Enter (no history) on the first screen (T-0010) ----
check('the splash button for people with history says Resume, is the primary button and sits ahead of Import, Tutorial and Enter', () => {
  const i = html.indexOf('id="splashPlayNow"');
  assert.ok(i > 0);
  assert.ok(/id="splashPlayNow" type="button" class="splash-choice-btn splash-choice-btn-primary[^"]*">Resume<\/button>/.test(html));
  assert.ok(i < html.indexOf('id="splashBringMusic"') && i < html.indexOf('id="splashPlayTutorial"') && i < html.indexOf('id="splashSkipTutorial"'));
  assert.ok(!/id="splashBringMusic"[^>]*splash-choice-btn-primary/.test(html), 'Import must not also be primary');
});
check('Tutorial and Enter still exist and are handled by the same splash code', () => {
  assert.ok(html.includes("const playBtn = $('splashPlayTutorial'), skipBtn = $('splashSkipTutorial');"));
  assert.ok(html.includes("if (skipBtn) skipBtn.addEventListener('click'"));
  assert.ok(html.includes("if (playBtn) playBtn.addEventListener('click'"));
});
check('a returning tester who never played still sees the splash choice on every visit (Enter, or Resume if a song is saved)', () => {
  assert.ok(/else if \(onboardingComplete && !hasEverPlayed\(\)\)\{\n[^\n]*\n  showSplashChoice\(\);\n\}/.test(html));
});

check('the 12 s splash safety net no longer hides the choice on any device', () => {
  const i = html.indexOf('splashSafetyEl.classList.add(');
  const w = html.slice(i - 400, i);
  assert.ok(w.includes("!splashSafetyEl.classList.contains('is-choice')"));
  assert.ok(!w.includes('ebb-android'));
});

// ---- behavior: the real splash Resume code, run in the real click order ----
const slice = (name) => {
  const a = html.indexOf('/* ' + name + ':start */'), b = html.indexOf('/* ' + name + ':end */', a);
  if (a < 0 || b < 0) { console.error(name + ' block not found in index.html'); process.exit(1); }
  return html.slice(a, b);
};
// Builds the splash Resume pieces with stubs. Enter runs startApp(), which (like the real one) restores a saved queue
// through tryResume. `readyAfter` = how many 250 ms waits pass before startApp has a current track (0 = in the same tap).
function splashResume({ readyAfter = 0, never = false } = {}) {
  const log = { order: [], tapped: 0, resumed: 0, timers: [] };
  let ready = false, handler = null;
  const enterEl = { click() { log.order.push('enter'); if (readyAfter === 0) ready = true; } };
  const ctx = { log, enterEl, setHandler: (fn) => { handler = fn; }, isReady: () => ready };
  new Function('ctx', `
    const { log } = ctx;
    const statsPlayTapped = () => { log.tapped++; log.order.push('tapped'); };
    const currentTrack = () => (ctx.isReady() ? { id: 'saved' } : null);
    const resumePlayback = () => { log.resumed++; log.order.push('resume'); };
    const setTimeout = (fn, ms) => { log.timers.push({ fn, ms }); };
    const $ = (id) => (id === 'splashSkipTutorial' ? ctx.enterEl : null);
    const document = { addEventListener: (ev, fn) => { if (ev === 'click') ctx.setHandler(fn); } };
    ${slice('splash-play')}
  `)(ctx);
  const click = () => handler({ target: { closest: (sel) => sel === '#splashPlayNow' ? {} : null }, stopPropagation() {}, preventDefault() {} });
  const later = () => { ready = !never; const t = log.timers.shift(); if (t) t.fn(); };
  return { log, click, later };
}
check('Resume enters like Enter, counts one tap, then continues the saved queue in the same tap', () => {
  const f = splashResume();
  f.click();
  assert.deepStrictEqual(f.log.order, ['enter', 'tapped', 'resume']);
  assert.strictEqual(f.log.tapped, 1);
  assert.strictEqual(f.log.timers.length, 0);
});
check('Resume waits for startApp when the saved song is not ready yet, then resumes once', () => {
  const f = splashResume({ readyAfter: 1 });
  f.click();
  assert.deepStrictEqual(f.log.order, ['enter', 'tapped']);
  assert.strictEqual(f.log.timers[0].ms, 250);
  f.later();
  assert.deepStrictEqual(f.log.order, ['enter', 'tapped', 'resume']);
  assert.strictEqual(f.log.resumed, 1);
});
check('Resume with nothing to resume gives up quietly after about 5 s (the app is still entered)', () => {
  const f = splashResume({ readyAfter: 1, never: true });
  f.click();
  let n = 0; while (f.log.timers.length && n < 100) { f.later(); n++; }
  assert.strictEqual(n, 19);
  assert.strictEqual(f.log.resumed, 0);
  assert.strictEqual(f.log.tapped, 1);
});
check('Resume never loads the starter album or replaces the saved queue (the old Play path is gone)', () => {
  const code = slice('splash-play');
  assert.ok(!/beginImport|STARTER_LIBRARY|firstSong|importKeepsQueue|state\.queue\s*=/.test(code));
  assert.ok(!/firstSongForce|firstSongStarting|playFirstSong|firstSongEntry/.test(html), 'no leftover starter-Play code anywhere');
});

// ---- behavior: "has played" follows the real PLAYING event, not a track loading ----
function playedFlag({ personalize = true, playLogMs = 0 } = {}) {
  const store = {}, timers = [];
  const ctx = { store, timers, shown: 0, tapped: 0 };
  const api = new Function('ctx', `
    const localStorage = { getItem: (k) => (k in ctx.store ? ctx.store[k] : null), setItem: (k, v) => { ctx.store[k] = String(v); } };
    const personalizeOn = () => ${personalize};
    let playLog = { ms: ${playLogMs} };
    let signInNudgeWaiting = true, oneTapWaiting = true;
    const showSignInNudge = () => { ctx.shown++; };
    const initGoogleOneTap = () => { ctx.tapped++; };
    const setTimeout = (fn, ms) => { ctx.timers.push({ fn, ms }); };
    ${slice('played-flag')}
    return { hasEverPlayed, noteRealPlay, waiting: () => [signInNudgeWaiting, oneTapWaiting] };
  `)(ctx);
  return { ctx, api };
}
check('a track loading is not a play: nothing marks it until the deck reports PLAYING', () => {
  const p = playedFlag();
  assert.strictEqual(p.api.hasEverPlayed(), false);
  assert.deepStrictEqual(p.ctx.timers, []);
});
check('the first real PLAYING event marks the first play and releases the sign-in card and One Tap, once', () => {
  const p = playedFlag();
  p.api.noteRealPlay(); p.api.noteRealPlay();
  assert.strictEqual(p.api.hasEverPlayed(), true);
  assert.deepStrictEqual(p.api.waiting(), [false, false]);
  assert.strictEqual(p.ctx.timers.length, 2);
  p.ctx.timers.forEach(t => { assert.strictEqual(t.ms, 6000); t.fn(); });
  assert.deepStrictEqual([p.ctx.shown, p.ctx.tapped], [1, 1]);
});
check('listeners from before the flag count as played once the play log shows listening; personalization off never waits', () => {
  assert.strictEqual(playedFlag({ playLogMs: 5000 }).api.hasEverPlayed(), true);
  assert.strictEqual(playedFlag({ personalize: false }).api.hasEverPlayed(), true);
});
check('the PLAYING branch calls noteRealPlay and track load no longer releases the waiting prompts', () => {
  assert.ok(/setPlayingUI\(true\); announceTabPlaying\(\); noteRealPlay\(\); statsPlayStarted\(\);/.test(html));
  const rl = html.slice(html.indexOf('function recordLatestPlayed(t){'), html.indexOf('function reflectCurrentTrackUI'));
  assert.ok(!/signInNudgeWaiting|oneTapWaiting/.test(rl));
});
check('Google One Tap and the sign-in card both wait on hasEverPlayed', () => {
  assert.ok(html.includes('if (!returning && !hasEverPlayed()){ oneTapWaiting = true; return; }'));
  assert.ok(html.includes('if (!hasEverPlayed()){ signInNudgeWaiting = true; return; }'));
});

// ---- behavior: exactly one way in on the splash (Resume or Enter) ----
// Reads the page's own CSS rule and decides, per class state, which of the two buttons it hides.
const ruleM = /(#splash[^{}]*#splashPlayNow[^{}]*)\{display:none\}/.exec(html);
function cssHides(state) {   // state: { canResume }; returns the ids hidden by the shipped rule
  assert.ok(ruleM, 'the Resume/Enter display:none rule must exist in index.html');
  const hidden = new Set();
  ruleM[1].split(',').map(x => x.trim()).forEach(sel => {
    const m = /^#splash(\.can-resume|:not\(\.can-resume\)) #(\w+)$/.exec(sel);
    assert.ok(m, 'unexpected selector in the splash rule: ' + sel);
    if ((m[1] === '.can-resume') === state.canResume) hidden.add(m[2]);
  });
  return hidden;
}
// What the real syncSplashEntry() leaves on #splash, given the saved-resume data and the playlist cache.
function splashClassFor({ resume, cached = true, throws = false }) {
  const classes = new Set();
  const sp = { classList: { toggle: (c, on) => { on ? classes.add(c) : classes.delete(c); } } };
  new Function('$', 'lsGet', 'LS_RESUME', 'getCachedPlaylist', slice('splash-entry') + '; syncSplashEntry();')(
    () => sp, () => { if (throws) throw new Error('storage'); return resume; }, 'ebbless:resume',
    (id) => (cached ? { id, tracks: [{ title: 'a' }] } : (cached === null ? { id, tracks: [] } : null)));
  return { canResume: classes.has('can-resume') };
}
const shows = (o) => { const h = cssHides(splashClassFor(o)); return { resume: !h.has('splashPlayNow'), enter: !h.has('splashSkipTutorial') }; };
check('no music history (nothing saved): the shipped CSS shows Enter only, no Resume; Import and Tutorial are untouched', () => {
  assert.deepStrictEqual(shows({ resume: null }), { resume: false, enter: true });
  assert.ok(!ruleM[1].includes('splashBringMusic') && !ruleM[1].includes('splashPlayTutorial'));
  assert.ok(html.includes('id="splashSkipTutorial"') && html.includes('id="splashPlayNow"'));
});
check('a saved queue or last song: the shipped CSS shows Resume only, no Enter', () => {
  assert.deepStrictEqual(shows({ resume: { playlistId: 'p1', trackIndex: 2, position: 40 } }), { resume: true, enter: false });
});
check('history but nothing resumable (saved song deleted, empty playlist, bad data, storage error): Enter only, never neither', () => {
  assert.deepStrictEqual(shows({ resume: { playlistId: 'gone' }, cached: false }), { resume: false, enter: true });
  assert.deepStrictEqual(shows({ resume: { playlistId: 'empty' }, cached: null }), { resume: false, enter: true });
  assert.deepStrictEqual(shows({ resume: {} }), { resume: false, enter: true });
  assert.deepStrictEqual(shows({ resume: { playlistId: 'p1' }, throws: true }), { resume: false, enter: true });
});
check('exactly one of Resume / Enter shows in every class state (never both, never neither)', () => {
  [true, false].forEach(canResume => {
    const h = cssHides({ canResume });
    assert.strictEqual(h.size, 1, 'exactly one button hidden when canResume=' + canResume);
    assert.ok(h.has(canResume ? 'splashSkipTutorial' : 'splashPlayNow'));
  });
});
check('with no sync at all (no can-resume class) the default is Enter only, so a missed sync still leaves a way in', () => {
  const h = cssHides({ canResume: false });
  assert.ok(h.has('splashPlayNow') && !h.has('splashSkipTutorial'));
});
check('the CSS hides Resume by default and the first-load splash code is wired: syncSplashEntry reads the same data tryResume does', () => {
  assert.ok(/function splashResumable\(\)\{[\s\S]*?lsGet\(LS_RESUME, null\)[\s\S]*?getCachedPlaylist\(r\.playlistId\)/.test(html));
});
check('every place that adds is-choice syncs Resume/Enter first: showSplashChoice, returnToSplash and the Android web splash in startApp', () => {
  const re = /classList\.add\([^)]*'is-choice'[^)]*\)/g;
  let m, sites = 0;
  while ((m = re.exec(html))) {
    sites++;
    const before = html.slice(0, m.index);
    const lines = before.split('\n');
    const near = lines.slice(-4).join('\n');                       // the 3 lines above the add
    const fnStart = Math.max(before.lastIndexOf('\nfunction '), before.lastIndexOf('\nasync function '));
    const fn = before.slice(fnStart + 1);
    const inSmallFn = /^function (showSplashChoice|returnToSplash)\(/.test(fn) && fn.includes('syncSplashEntry();');
    assert.ok(near.includes('syncSplashEntry();') || inSmallFn, 'is-choice added without syncSplashEntry(): ' + m[0] + ' near line ' + lines.length);
  }
  assert.ok(sites >= 3, 'expected the three is-choice sites, found ' + sites);
  // the Android web splash branch specifically
  const i = html.indexOf("Android app: stay on the splash until Enter");
  assert.ok(html.slice(i, i + 400).indexOf('syncSplashEntry();') > 0 && html.slice(i, i + 400).indexOf('syncSplashEntry();') < html.slice(i, i + 400).indexOf("add('is-choice')"));
  // Enter must never be removed from the page: native splash, Skip paths and returnToSplash click it from code
  assert.ok(!/getElementById\('splashSkipTutorial'\)\.remove|\$\('splashSkipTutorial'\)\.remove/.test(html));
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
// ---- splash video first-load glitch (T-0010): stalls must not cut back to the poster ----
check('the splash video latches is-playing: a stall (waiting) or pause no longer removes it, only an emptied source does', () => {
  const i = html.indexOf("const sync = () => {\n      if (!v.paused && v.readyState >= 3) v.classList.add('is-playing');");
  assert.ok(i > 0, 'latching sync() not found');
  assert.ok(!/v\.classList\.toggle\('is-playing'/.test(html), 'the toggling version must be gone');
  const classes = new Set();
  const mk = (o) => new Function('v', `const sync = () => {
      if (!v.paused && v.readyState >= 3) v.classList.add('is-playing');
      else if (!v.currentSrc) v.classList.remove('is-playing');
    }; return sync;`)(Object.assign({ classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } }, o));
  mk({ paused: false, readyState: 4, currentSrc: 'x.mp4' })();
  assert.ok(classes.has('is-playing'));
  mk({ paused: false, readyState: 2, currentSrc: 'x.mp4' })();   // buffering stall
  assert.ok(classes.has('is-playing'), 'a stall keeps the last frame instead of cutting to the poster');
  mk({ paused: true, readyState: 4, currentSrc: 'x.mp4' })();
  assert.ok(classes.has('is-playing'));
  mk({ paused: true, readyState: 0, currentSrc: '' })();         // source unloaded
  assert.ok(!classes.has('is-playing'));
  assert.ok(/#splash \.splash-video\.is-playing\{opacity:1;transition:opacity 400ms/.test(html), 'it fades in once instead of popping');
});
Promise.resolve().then(() => {
  console.log(pass + ' passed');
}).catch((e) => { console.error(e); process.exit(1); });
