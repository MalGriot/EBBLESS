# Release 580 (vibe window) and 581 (first-timer start): integration, app only

Branch `release-vibe-and-first-timer` in `/Users/malcolm/Documents/CLAUDE-CODE/ebbless-worktrees/release-vibe-and-first-timer`,
cut from `origin/main` 183cbb2 (release 579, the ebbless.space move). Local only: nothing is pushed or deployed.

## Merge order and what was resolved
1. `claude/vibe-window-2a4457` (T-0012, head 257a67c) merged first, renumbered to **580**. Conflicts: `index.html`
   (top WHATS_NEW: kept main's 579 entry, vibe entry added as 580 above it), `scripts/check.sh` (kept `test-move.js`
   from main plus both vibe-window tests), `sw.js` (auto-merged at v579, set to v580).
2. `claude/first-timer-start-db2de5` (T-0011, head 38503af) merged second, renumbered to **581**. Conflicts:
   `index.html` (WHATS_NEW: 581 on top of 580 and 579, three separate entries; the app merges same-day entries into
   one block at render time, highest version as heading), `scripts/check.sh` (every test line from every branch kept),
   `sw.js` (v581). The docs of both branches now say 580 and 581 (`docs/vibe-window-2026-11.md`,
   `docs/first-timer-start-2026-11.md`, `docs/first-play-build-2026-11.md`, `docs/splash-fixes-2026-11.md`).

## Does main's new work interact with ours?
Read: `git diff 5ce8f77 origin/main -- index.html` (471d83a and 183cbb2). Their `index.html` changes are three things:
two `og:image` / `twitter:image` meta URLs, the WHATS_NEW 579 entry, and a block appended near the end of the script
(`moveSnapshot`, `startMove`, `maybeOfferMove`, called by `setTimeout(maybeOfferMove, 25000)`).
- **Landing in `startApp()`, `splashResumable()`, `hasEverPlayed()`:** not touched. `maybeOfferMove` runs 25 s after start,
  only when `location.origin === 'https://malgriot.github.io'`, not in the desktop or Android apps, and only if the
  library list is non-empty. It reads storage and shows a toast; it does not change the view, the splash or any
  history flag. Our tests run on `ebb.test`, so the offer never fires in them.
- **Start here tile:** a toast on the old address could show for 20 s over Home 25 s after load. That is existing
  behavior for anyone with a (seeded) library, not caused by this merge. Not changed.
- **Vibe overlay:** not touched.
- **One real-world effect to know:** `moveSnapshot` copies every `ebbless:` key (including `ebbless:firstPlayed`) to
  ebbless.space, so someone who moves keeps their returning status. Someone who opens ebbless.space without moving has
  empty storage and is a new person: they get Home and the tile. That is the intended behavior.
- Their `worker/src/admin.js` change, `move/`, `scripts/deploy-site.sh` and `scripts/test-move.js` are theirs.

## What a push of this branch to main ships
`git log --oneline origin/main..HEAD` (10 commits):

    1a3d8e7 Merge the first-timer start (T-0011) onto main as release 581.
    554c35a Merge the vibe result window (T-0012) onto main as release 580 (main took 579).
    38503af First-timer start: the non-tile first-play browser test waits for the album panel to settle before tapping, so the full browser suite is green
    3dc19af QA round 1 fixes for the first-timer start (items 1-4, 6-9; item 5 browser test still failing): true WHATS_NEW copy, no paste bubble on top of
    257a67c Vibe window doc: name is 24 px one line in the sticky row; note long names are cut with an ellipsis and the wrap alternative.
    d9656fc Vibe result: name, Share and X stay in one sticky 44 px row while the list scrolls; real-Chrome scroll test; all after screenshots retaken.
    ccd1e97 Vibe tags wrap between tags instead of clipping at 390 px, use the readable grey, test catches it; all after screenshots retaken; sticky-heade
    484480b Take release 580 for the first-timer start because T-0012 holds 579.
    32748fb First-timer start: new people land on Home with a Start here tile (starter track list stored in the app, plays only on tap), checklist step 1 
    4e9cbe6 Vibe result window is now a full page: name, one line, Save & play, then the whole song list in one scroller, using the app's own buttons and 

Files changed vs main: `index.html`, `sw.js` (v581), `scripts/check.sh`, `scripts/lib/headless.js`,
`scripts/test-first-play.js`, `scripts/test-first-timer-start.js`, `scripts/test-vibe-window.js`,
`scripts/test-vibe-window-chrome.js`, four docs, and 13 vibe-window screenshots under `docs/vibe-window-2026-11/` and
`docs/first-play-evidence/`. **No worker, Sheet or `house-vibes.json` change is shipped.** Main's own
`worker/src/admin.js` change from the other lane is already on main and is NOT part of this release: do not deploy
the worker for it here.

## Release steps (app only)
1. On the CEO's yes: push this branch to `main` as a fast-forward (GitHub Pages deploys the app).
2. Phone check. Use a Private tab or clear this site's data first: the CEO's normal phone has played before, so it is
   a returning person and lands on the Library with no tile. With a blank profile expect: Enter, then Home with the Start
   here tile; the Library checklist says "Play this song"; a tap on the tile plays in a few seconds (headless Chrome
   measured 2 to 9 s, mostly SoundCloud). Then Search "sexy time": a full-page vibe window with the name, share and X in
   a sticky row while the song list scrolls under it; X closes it.
3. Rollback: revert the two merges separately, newest first (`git revert -m 1 <first-timer merge>` then
   `git revert -m 1 <vibe merge>`), bump `sw.js` to v582, commit with `SKIP_WHATS_NEW=1`.

## Test results on the merged tree
- `bash scripts/check.sh`: pass.
- `node scripts/test-first-play.js`: 37 passed. `node scripts/test-house-vibes.js`: 5 passed.
- `node scripts/test-first-timer-start.js --no-browser`: 10 passed.
- `node scripts/test-first-timer-start.js` (full, real SoundCloud over the network): 21 passed.
- `node scripts/test-vibe-window.js`: 15 passed. `node scripts/test-vibe-window-chrome.js`: 12 passed.
- `node scripts/test-move.js`: ok. Worker tests: 268 passed.
- End to end in headless Chrome at 390 px (blank profile, fake tester token, `/beta/*` blocked): landed on Home with the
  tile; "sexy time" in Search opened the full-page "Midnight Rendezvous" window; scrolled 600 px, the name, share and X
  stayed pinned; X closed it and returned to Home with the tile still there; tapping the tile played (8.9 s tap to PLAYING
  in that run) and opened the player, `firstPlayed` set. Screenshots: `docs/release-vibe-and-first-timer-2026-11-*.jpg`.
