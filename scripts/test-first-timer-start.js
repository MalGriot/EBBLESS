#!/usr/bin/env node
// First-timer start (T-0011): a new person lands on Home with a Start here tile, the first checklist step is
// "Play this song", nothing plays by itself, and the tile counts like any other play tap.
// Part 1 reads index.html. Part 2 drives real headless Chrome at 390 px and desktop (skipped, loudly, if Chrome is missing;
// set CHROME=/path to override; --shots writes the 390 px screenshots into docs/first-play-evidence/).
// Part 2 uses the real SoundCloud player over the network and blocks the worker's /beta/* routes so a fake tester token
// is never sent anywhere. Usage: node scripts/test-first-timer-start.js [--shots] [--no-browser] [--slow]
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const args = process.argv.slice(2);

let pass = 0;
const check = async (name, fn) => { await fn(); pass++; console.log('ok  ' + name); };
const block = (name) => {
  const a = html.indexOf('/* ' + name + ':start */'), b = html.indexOf('/* ' + name + ':end */', a);
  assert.ok(a >= 0 && b > a, name + ' block missing');
  return html.slice(a, b);
};

(async () => {
  // ---------- Part 1: source checks ----------
  const tile = block('start-here');
  await check('the starter track list is stored in the app: 10 tracks, each with a SoundCloud id, title, art and duration', () => {
    const rows = [...tile.matchAll(/^\s+\[(\d{8,}), "([^"]+)", "([^"]+)", "(https:\/\/[^"]+)", (\d+)\]/gm)];
    assert.strictEqual(rows.length, 10);
    assert.ok(tile.includes("soundcloud.com/mal-griot/sets/breathelovedeep"));
  });
  await check('nothing plays by itself: the tile function is only reached from the tile click', () => {
    const uses = [...html.matchAll(/startHereTap/g)].length;
    assert.strictEqual(uses, 2, 'defined once, wired once');
    assert.ok(/b\.addEventListener\('click', startHereTap\)/.test(html));
    assert.ok(!/playFirstSong|autoPlayStarter/.test(html));
    // the landing code only changes the view
    assert.ok(/setView\(currentTrack\(\) \? 'player' : isNewPerson\(\) \? 'home' : 'library'\)/.test(html));
  });
  await check('a new person is the existing rule: no real play and nothing to resume', () => {
    assert.ok(/function isNewPerson\(\)\{ return !hasEverPlayed\(\) && !splashResumable\(\); \}/.test(tile));
  });
  await check('the tile is only built for a new person and sits first on Home', () => {
    assert.ok(/\(isNewPerson\(\) \? \['start'\] : \[\]\)\.concat\(homeSectionOrder\(returning\)\)/.test(html));
  });
  await check('counters: the tile\'s tap is counted once by playPlaylistNow, PLAYING marks started, failure is the existing 20 s rule only', () => {
    assert.ok(/playPlaylistNow\(pl\.id\);/.test(tile) && !/statsPlayTapped\(\)/.test(tile.replace(/\/\/.*\n/g, '')));
    assert.ok(!/statsPlayError\(\)/.test(tile.replace(/\/\/.*\n/g, '')));
    assert.ok(/noteRealPlay\(\); statsPlayStarted\(\); startHerePlaying\(\);/.test(html));
  });
  await check('a first-timer starting a song by any path (search result, tile, link) is counted as one tap', () => {
    assert.ok(/if \(autoplay && !hasEverPlayed\(\)\) try\{ statsPlayTapped\(\); \}/.test(html));
  });
  await check('the starter tile has an honest failure state with a way to retry', () => {
    assert.ok(tile.includes("Couldn't start. Tap to try again.") && tile.includes("You're offline. Connect and tap to try again."));
    assert.ok(tile.includes('START_HERE_FAIL_MS'));
  });
  await check('checklist: Play this song replaces Search for a new person, ticks on the first real play, count stays n of 5', () => {
    assert.ok(/\['firstplay', 'Play this song', 5, 'library'/.test(html));
    assert.ok(/function msTasks\(page, done\)/.test(html));
    assert.ok(/if \(!hasEverPlayed\(\)\) try \{ awardMilestone\('firstplay'\); \} catch\(e\)\{\}/.test(html));
    assert.ok(!/MILESTONES\.filter\(m => m\[3\] === page\)/.test(html), 'every library-page list goes through msTasks');
  });
  await check('a new person never gets the paste bubble (also called Start here) on top of the tile', () => {
    assert.ok(/if \(isNewPerson\(\)\) return false;/.test(html));
  });
  await check('the vibe result window code is untouched by this change', () => {
    assert.ok(html.includes('function renderHomeVibe(body, mk){'));
  });

  if (args.includes('--no-browser')) { console.log(pass + ' passed (browser part skipped)'); return; }

  // ---------- Part 2: real browser ----------
  const { launch, chromePath } = require('./lib/headless');
  if (!chromePath()) { console.log('SKIP browser part: no Chrome found (set CHROME=/path)'); console.log(pass + ' passed'); return; }
  const b = await launch();
  const TOKEN = "try{ if(!localStorage.getItem('ebbless:betaToken')) localStorage.setItem('ebbless:betaToken','t0123456789ab-0123456789abcdef0123456789abcdef'); }catch(e){}";
  const SLOW_4G = { latency: 562.5, downloadThroughput: Math.round(1.6 * 1024 * 1024 / 8), uploadThroughput: Math.round(750 * 1024 / 8) };
  const shots = args.includes('--shots') ? path.join(root, 'docs', 'first-play-evidence') : null;
  const views = (p) => p.eval(`[...document.querySelectorAll('main.view')].filter(v => !v.hidden).map(v => v.id).join()`);
  // pending batch plus every batch already handed to the sender: the 15 s tick may flush between a tap and its PLAYING event
  const stats = async (p) => {
    const s = JSON.parse(await p.eval(`localStorage.getItem('ebbless:stats')`) || '{}'), t = Object.assign({ playTapped: 0, playStarted: 0, playFailed: 0 }, s.pend || {});
    p.sent.forEach(x => { t.playTapped += x.playTapped || 0; t.playStarted += x.playStarted || 0; t.playFailed += x.playFailed || 0; });
    return t;
  };
  // first visit: wait for the page to finish loading, press Enter, wait for the splash to clear
  const enter = async (p, host) => {
    await p.goto('/index.html', host);
    assert.ok(await p.waitFor(`document.readyState === 'complete' && document.getElementById('splash').classList.contains('is-choice')`, 120000), 'splash choice never showed');
    await p.sleep(300);
    await p.click('#splashSkipTutorial');
    assert.ok(await p.waitFor(`document.getElementById('splash').classList.contains('is-hidden')`, 60000), 'splash never cleared');
    await p.sleep(500);
  };

  try {
    // new person, phone
    const p = await b.page({ blockHosts: ['*/beta/*'], init: TOKEN });
    await enter(p, 'ebb.test');
    await check('new person at 390 px lands on Home, not the Library, with Start here at the top', async () => {
      assert.strictEqual(await views(p), 'view-home');
      assert.ok(await p.eval(`document.querySelector('#hmBody > :first-child h2')?.textContent === 'Start here' && !!document.querySelector('#hmBody .hm-start')`));
      assert.ok(/Play this song/.test(await p.eval(`document.querySelector('.hm-start').innerText`)));
    });
    await p.sleep(1500);
    if (shots) await p.shot(path.join(shots, '7-new-person-lands-on-home.jpg'));
    await check('no auto-play: after landing and waiting, nothing started, no tap counted, no play recorded', async () => {
      await p.sleep(6000);
      const s = await stats(p);
      assert.deepStrictEqual([s.playTapped, s.playStarted, s.playFailed], [0, 0, 0]);
      assert.strictEqual(await p.eval(`localStorage.getItem('ebbless:firstPlayed')`), null);
      assert.strictEqual(await p.eval(`!!window.__ebbStartHere`), false);
      assert.strictEqual(await p.eval(`document.getElementById('playBtn').classList.contains('is-playing') || document.body.classList.contains('is-playing')`), false);
    });
    await check('the checklist for a new person starts with "1 of 5 · Play this song" (Library page card)', async () => {
      await p.eval(`document.querySelector('#bottom-nav button[data-view="library"]').click()`);
      await p.sleep(400);
      assert.strictEqual(await p.eval(`document.querySelector('#msCard-library .ms-head-text').textContent`), '1 of 5 · Play this song');
      await p.eval(`document.querySelector('#bottom-nav button[data-view="search"]').click()`);
      await p.sleep(300);
    });
    await check('tapping the tile: one tap, one started, no failure; the song plays and step 1 ticks; the next step is 2 of 5', async () => {
      await p.click('.hm-start');
      assert.ok(await p.waitFor(`window.__ebbStartHere && window.__ebbStartHere.playingAt > 0`, 60000), 'never reached PLAYING');
      const t = await p.eval(`Math.round(window.__ebbStartHere.playingAt - window.__ebbStartHere.tapAt)`);
      console.log('    tap to PLAYING: ' + t + ' ms (normal network, headless Chrome 390 px)');
      await p.sleep(1500);
      const s = await stats(p);
      assert.deepStrictEqual([s.playTapped, s.playStarted, s.playFailed], [1, 1, 0]);
      assert.strictEqual(await p.eval(`localStorage.getItem('ebbless:firstPlayed')`), '1');
      assert.ok(await p.eval(`!!JSON.parse(localStorage.getItem('ebbless:milestones')).firstplay`));
      await p.sleep(2500);
      await p.eval(`document.querySelector('#bottom-nav button[data-view="library"]').click()`);
      await p.sleep(800);
      assert.strictEqual(await p.eval(`document.querySelector('#msCard-library .ms-head-text').textContent`), '2 of 5 \u00B7 Open an artist or album');
      await p.sleep(25000);   // 20 s failure window: still no false failure with music playing
      const s2 = await stats(p);
      assert.strictEqual(s2.playFailed, 0);
    });
    await p.close();

    // new person, desktop
    const d = await b.page({ width: 1280, height: 800, mobile: false, blockHosts: ['*/beta/*'], init: TOKEN });
    await enter(d, 'ebb.test');
    await check('new person on desktop lands on Home with the tile, not the Library', async () => {
      assert.ok((await views(d)).includes('view-home'));
      assert.ok(await d.eval(`!!document.querySelector('#hmBody .hm-start')`));
    });
    await check('desktop 1280 px: the first-run "Start here" paste bubble never covers the tile title (checked after it would have appeared)', async () => {
      await d.sleep(6000);
      assert.ok(await d.eval(`document.getElementById('pasteGuide') ? document.getElementById('pasteGuide').hidden : true`), 'paste bubble must stay hidden for a new person');
      const hit = await d.eval(`(() => { const t = document.querySelector('.hm-start-t b'); const r = t.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e && !!e.closest('.hm-start'); })()`);
      assert.ok(hit, 'the tile title is covered by something else');
    });
    await d.close();

    // returning person: has played before, goes straight in, lands where they did before
    const r = await b.page({ blockHosts: ['*/beta/*'], init: TOKEN + "try{localStorage.setItem('ebbless_onboarding_complete','true');localStorage.setItem('ebbless:tutorialWatched','true');localStorage.setItem('ebbless:firstPlayed','1');}catch(e){}" });
    await r.goto('/index.html', 'ebb.test');
    assert.ok(await r.waitFor(`document.getElementById('splash').classList.contains('is-hidden')`, 60000));
    await r.sleep(800);
    await check('returning person (has played) lands on the Library, no Start here tile, Search step in the checklist', async () => {
      assert.strictEqual(await views(r), 'view-library');
      assert.ok(await r.eval(`!document.querySelector('.hm-start')`));
      await r.eval(`document.querySelector('#bottom-nav button[data-view="search"]').click()`);
      await r.sleep(400);
      assert.ok(await r.eval(`!document.querySelector('.hm-start')`));
      await r.eval(`document.querySelector('#bottom-nav button[data-view="library"]').click()`);
      await r.sleep(300);
      assert.strictEqual(await r.eval(`document.querySelector('#msCard-library .ms-head-text').textContent`), '1 of 5 · Search for a song, artist or album');
    });
    if (shots) await r.shot(path.join(shots, '8-returning-person-lands-on-library.jpg'));
    await r.close();

    // the starter cannot load: SoundCloud blocked
    const f = await b.page({ blockHosts: ['*/beta/*', '*soundcloud.com*', '*sndcdn.com*'], init: TOKEN });
    await enter(f, 'ebb.test');
    await check('starter cannot load (SoundCloud blocked): honest state after 15 s, one failure at the existing 20 s rule, not stuck', async () => {
      await f.click('.hm-start');
      await f.sleep(500);
      assert.ok(/Starting/.test(await f.eval(`document.querySelector('.hm-start')?.innerText || ''`)) || (await views(f)) === 'view-player');
      assert.ok(await f.waitFor(`window.__ebbStartHere && !window.__ebbStartHere.playingAt && document.body.innerText.includes("Couldn't start the song")`, 30000), 'no failure message');
      const s = await stats(f);
      assert.deepStrictEqual([s.playTapped, s.playStarted, s.playFailed], [1, 0, 0], 'the 15 s message does not count a failure by itself');
      // not stuck: the nav still works and the tile says try again
      await f.eval(`document.querySelector('#bottom-nav button[data-view="search"]').click()`);
      await f.sleep(500);
      assert.strictEqual(await views(f), 'view-home');
      assert.ok(/Couldn't start\. Tap to try again\./.test(await f.eval(`document.querySelector('.hm-start').innerText`)));
      assert.ok(await f.waitFor(`localStorage.getItem('ebbless:stats') && JSON.parse(localStorage.getItem('ebbless:stats')).pend.playFailed === 1`, 15000), 'the existing 20 s rule never counted the failure');
      await f.sleep(8000);
      assert.strictEqual((await stats(f)).playFailed, 1, 'counted once');
    });
    await f.close();

    // a start after the "couldn't start" message (the message is forced to 0.5 s; real audio arrives seconds later)
    const l = await b.page({ blockHosts: ['*/beta/*'], init: TOKEN + 'window.__ebbStartHereFailMs = 500;' });
    await enter(l, 'ebb.test');
    await check('a start after the failure message clears it and counts as started, never failed (inside the 20 s rule)', async () => {
      await l.click('.hm-start');
      assert.ok(await l.waitFor(`document.body.innerText.includes("Couldn't start the song")`, 10000), 'message never showed');
      assert.ok(await l.waitFor(`window.__ebbStartHere.playingAt > 0`, 60000), 'never reached PLAYING');
      await l.eval(`document.querySelector('#bottom-nav button[data-view="search"]').click()`);
      await l.sleep(500);
      // a person who has played is no longer new, so the tile is gone; the state itself was cleared by PLAYING
      const s = await stats(l);
      assert.deepStrictEqual([s.playTapped, s.playStarted, s.playFailed], [1, 1, 0]);
    });
    await l.close();

    // a first-timer starts a song from a NON-tile path: the starter album the app seeds into the Library (worker lookup, real network)
    const n = await b.page({ blockHosts: ['*/beta/*'], init: TOKEN });
    await enter(n, 'ebb.test');
    await check('first-timer starts a song from the Library album panel (not the tile): tapped 1, started 1, failed 0', async () => {
      await n.eval(`document.querySelector('#bottom-nav button[data-view="library"]').click()`);
      assert.ok(await n.waitFor(`!!document.querySelector('#libraryListWrap .lib-card[data-pl-id^="sc:"]')`, 120000), 'starter album never seeded into the Library');
      await n.eval(`document.querySelector('#libFilterAlbums').click()`);
      await n.sleep(800);
      await n.click('#libraryListWrap .lib-card[data-pl-id^="sc:"]');
      assert.ok(await n.waitFor(`!!document.querySelector('#libplBody .track-row:not(.is-missing)')`, 20000), 'album panel never opened with tracks');
      assert.strictEqual(await n.eval(`localStorage.getItem('ebbless:firstPlayed')`), null);
      await n.click('#libplBody .track-row:not(.is-missing)');
      assert.ok(await n.waitFor(`localStorage.getItem('ebbless:firstPlayed') === '1'`, 60000), 'never reached PLAYING');
      await n.sleep(1500);
      assert.strictEqual(await n.eval(`!!window.__ebbStartHere`), false, 'the tile was not used');
      const s = await stats(n);
      assert.deepStrictEqual([s.playTapped, s.playStarted, s.playFailed], [1, 1, 0]);
      await n.sleep(21000);
      assert.strictEqual((await stats(n)).playFailed, 0);
    });
    await n.close();

    // offline at tap time
    const o = await b.page({ blockHosts: ['*/beta/*'], init: TOKEN });
    await enter(o, 'ebb.test');
    await check('offline at tap time: the tile says so at once, no tap is counted, the person can still move around', async () => {
      await o.eval(`Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true })`);
      await o.click('.hm-start');
      await o.sleep(500);
      assert.ok(/offline/i.test(await o.eval(`document.querySelector('.hm-start').innerText`)));
      assert.strictEqual((await stats(o)).playTapped || 0, 0);
      assert.strictEqual(await views(o), 'view-home');
    });
    await o.close();

    if (args.includes('--slow')) {
      const sp = await b.page({ throttle: SLOW_4G, blockHosts: ['*/beta/*'], init: TOKEN });
      await enter(sp, 'ebb.test');
      await check('Slow 4G: tap to PLAYING', async () => {
        await sp.click('.hm-start');
        assert.ok(await sp.waitFor(`window.__ebbStartHere && window.__ebbStartHere.playingAt > 0`, 90000), 'never reached PLAYING');
        console.log('    tap to PLAYING: ' + await sp.eval(`Math.round(window.__ebbStartHere.playingAt - window.__ebbStartHere.tapAt)`) + ' ms (Slow 4G)');
      });
      await sp.close();
    }
  } finally {
    await b.close();
  }
  console.log(pass + ' passed');
})().catch(e => { console.error('FAIL', e && e.stack || e); process.exit(1); });
