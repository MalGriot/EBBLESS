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

check('the 12 s splash safety net no longer hides the Play choice on any device', () => {
  const i = html.indexOf('splashSafetyEl.classList.add(');
  const w = html.slice(i - 400, i);
  assert.ok(w.includes("!splashSafetyEl.classList.contains('is-choice')"));
  assert.ok(!w.includes('ebb-android'));
});

// ---- behavior: the real splash Play code, run in the real click order ----
const slice = (name) => {
  const a = html.indexOf('/* ' + name + ':start */'), b = html.indexOf('/* ' + name + ':end */', a);
  if (a < 0 || b < 0) { console.error(name + ' block not found in index.html'); process.exit(1); }
  return html.slice(a, b);
};
// Builds the splash Play pieces with stubs. `startApp` is what Enter runs: like the real startApp() it
// restores a saved queue first and starts seedStarterLibrary() without waiting for it.
function splashPlay({ savedQueue, defer = false }) {
  const log = { imports: [], resolved: [], tapped: 0, order: [], pending: [] };
  const state = { queue: savedQueue ? [{ id: 'old' }] : [], queuePos: savedQueue ? 0 : -1 };
  const URLS = ['https://soundcloud.com/starter-album', 'https://open.spotify.com/playlist/second'];
  let handler = null;
  const enterEl = { click() { log.order.push('enter'); startApp(); } };
  const api = new Function('ctx', `
    const { state, URLS, log } = ctx;
    const STARTER_LIBRARY_URLS = URLS;
    const starterLibraryEntry = (u) => ({ id: 'id:' + u, type: 'x' });
    const isSingleTrackType = () => false;
    const getCachedPlaylist = () => null, isResolveStale = () => false, saveToLibrary = () => {}, renderLibrary = () => {};
    const queueBackgroundLoad = async (id) => { log.resolved.push(id); return true; };
    const statsPlayTapped = () => { log.tapped++; log.order.push('tapped'); };
    const run = (id, type, ti) => { log.imports.push({ id, keep: importKeepsQueue(type, ti, id) }); };
    // like importChain: with defer on, the import waits its turn behind anything queued earlier
    const beginImport = (id, force, type, ti) => { log.order.push('import'); if (ctx.defer) log.pending.push(() => run(id, type, ti)); else run(id, type, ti); };
    const $ = (id) => (id === 'splashSkipTutorial' ? ctx.enterEl : null);
    const document = { addEventListener: (ev, fn) => { if (ev === 'click') ctx.setHandler(fn); } };
    ${slice('seed-starter')}
    ${slice('first-song')}
    ${slice('splash-play')}
    ctx.startApp = () => { log.order.push('startApp'); seedStarterLibrary(); };
    return { importKeepsQueue };
  `);
  const ctx = { state, URLS, log, enterEl, defer, setHandler: (fn) => { handler = fn; } };
  var startApp;
  const ret = api(ctx);
  startApp = ctx.startApp;
  const click = () => handler({ target: { closest: (sel) => sel === '#splashPlayNow' ? {} : null }, stopPropagation() {}, preventDefault() {} });
  return { log, click, importKeepsQueue: ret.importKeepsQueue, URLS };
}
const tick = () => new Promise(r => setImmediate(r));

const queued = (async () => {
  const f = splashPlay({ savedQueue: true });
  f.click(); await tick();
  assert.strictEqual(f.log.imports.length, 1);
  assert.strictEqual(f.log.imports[0].id, 'id:' + f.URLS[0]);
  assert.strictEqual(f.log.imports[0].keep, false, 'a saved queue must not turn Play into a quiet "file it" import');
  // the force is used up: a link pasted afterwards keeps the queue as before (#386)
  assert.strictEqual(f.importKeepsQueue('playlist', 0, 'id:pasted'), true);
})();
const fresh = (async () => {
  const f = splashPlay({ savedQueue: false });
  f.click(); await tick();
  assert.strictEqual(f.log.imports[0].keep, false);
})();
const ahead = (async () => {
  // a signup playlist (#446) or ?import= link is already on importChain when Play is tapped, so it runs first
  const f = splashPlay({ savedQueue: true, defer: true });
  f.click(); await tick();
  assert.strictEqual(f.log.pending.length, 1);
  const signup = f.importKeepsQueue('playlist', 0, 'id:signup-playlist');   // runs first, with the saved queue
  assert.strictEqual(signup, true, 'the earlier import keeps the queue (#386)');
  f.log.pending.shift()();                                                  // now the starter's own import
  assert.strictEqual(f.log.imports[0].id, 'id:' + f.URLS[0]);
  assert.strictEqual(f.log.imports[0].keep, false, 'the earlier import must not use up the starter force');
  assert.strictEqual(f.importKeepsQueue('playlist', 0, 'id:later-paste'), true, 'a later pasted link keeps the queue (#386)');
  assert.strictEqual(f.importKeepsQueue('playlist', 0, 'id:' + f.URLS[0]), true, 'one-shot: used up by the starter import');
})();
const order = (async () => {
  const f = splashPlay({ savedQueue: true });
  f.click(); await tick();
  assert.deepStrictEqual(f.log.order.slice(0, 4), ['enter', 'startApp', 'tapped', 'import']);
  // the starter is resolved once (by the import), the other starter is still seeded by startApp
  assert.deepStrictEqual(f.log.resolved, ['id:' + f.URLS[1]], 'seedStarterLibrary must skip the starter the Play tap is loading');
  assert.strictEqual(f.log.tapped, 1);
})();

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
Promise.all([queued, fresh, ahead, order]).then(() => {
  pass += 4;
  console.log('ok  Play with a saved queue replaces the queue, starts once, and the force is used up (async)');
  console.log('ok  Play on a fresh install starts the starter (async)');
  console.log('ok  a signup or ?import= import ahead of Play keeps the queue and leaves the starter force intact (async)');
  console.log('ok  real click order: Enter first, then tap and import; the starter is not resolved twice (async)');
  console.log(pass + ' passed');
}).catch((e) => { console.error(e); process.exit(1); });
