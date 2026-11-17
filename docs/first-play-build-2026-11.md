# One-tap first song and play counters (HQ T-0007)

Branch `claude/vigorous-morse-0bbe88`. Nothing is pushed, deployed or re-run on the live Sheet. Diagnosis:
[first-play-findings-2026-11.md](first-play-findings-2026-11.md). This is round 2 (after QA round 1).

## What changed

### Cause 1: one Play on the first screen

- Splash choice (`index.html`, `#splashPlayNow`): **Play** is the primary button, above Import your music,
  Tutorial and Enter. Tutorial and Enter work as before.
- One tap on Play enters the app exactly like Enter, then starts the first starter in the same tap
  (`playFirstSong()`). The first song is the owner's own SoundCloud album (Breathe Love Deep): no ads, no
  Spotify, no Google. This is the builder's call (T-0007 assumption): fewest moving parts.
- **Play always plays, even with a saved queue (round 2).** Before, a returning tester's resumed queue made the
  import "keep the queue" and nothing played. `importKeepsQueue()` now lets the Play import replace the queue
  (one-shot flag `firstSongForce`, used up by that import, so a pasted link afterwards still keeps the queue).
- Returning testers who never played (`!hasEverPlayed()`) get the same choice on every open until they do.
- A slow load can no longer hide it: the 12 s splash safety net skipped Android only; it now skips any splash
  showing the choice.
- The starter is marked (`firstSongStarting`) **before** Enter runs (round 2), so `seedStarterLibrary` skips it
  and it is resolved once, not twice.
- **"Has played" now follows a real play (round 2).** `hasEverPlayed()` used to be true as soon as a track loaded
  (history is written on load). It now follows the active deck's `PLAYING` event (`noteRealPlay`, flag
  `ebbless:firstPlayed`), plus the play log's listening time for people who played before the flag existed.
  The sign-in card and Google One Tap are released from that event, not from a track loading.
- What `018fce4` (2026-10-17) already did, kept as is: the sign-in card and the install bar wait for the first song.
  It did not cover Google One Tap, which still opened on load; that is deferred here.

### Cause 3: counters

| Counter | Where | When |
|---|---|---|
| `playTapped` (`plays_tapped`) | splash Play, the play button, a playlist's Play, the play/pause toggle when it starts | a deliberate play action; repeat taps while one is waiting count once |
| `playStarted` (`plays_started`) | `onDeckStateChange`, the active deck's `PLAYING` event | only when a tap is waiting. Not `statsTick` |
| `playFailed` (`plays_failed`) | timer in `statsPlayTapped`, `statsPlayError` | no `PLAYING` within 20 s (`STATS_PLAY_TIMEOUT_MS`), or an audio deck error. A tap left behind by a closed tab counts as failed on the next open |

- Worker `POST /beta/activity` (`worker/src/beta.js`): three optional keys, whole numbers clamped 0 to 500, same
  4000-byte cap, token check and per-IP throttle.
- `tools/beta-sheet.gs`: `plays_tapped`, `plays_started`, `plays_failed` appended after the `uses_*` columns.
  Dashboard: new block after "7-day return rate" (header at row 32): "Testers who tapped play", "Testers whose play
  started", "**Opened, tapped play, never started**", "Opened since release, never tapped play", "Play timeouts or
  errors". No existing column, header or row moved (`B29/B28` unchanged).
- Round 2: a tester's `plays_*` cells are blank until their first ping after the Sheet and worker ship, then
  hold a number. "Opened since release, never tapped play" counts cells equal to 0 only (blank rows are not
  counted). A tester still on the old app build shows 0 until their app updates.

## Tests (merged tree, round 2)

- `scripts/check.sh`: exit 0.
- `node scripts/test-first-play.js`: 26 checks. New in round 2, all running the real code from `index.html`:
  - a tester with a saved queue taps Play: the import is not a keep-queue import, the force is used up, a later
    pasted link still keeps the queue; fresh install still works;
  - the real click order (Enter, then tap, then import): the starter is resolved once, the other starter is still
    seeded. I confirmed these fail when the force line or the "mark before Enter" line is removed;
  - `hasEverPlayed` is false after a track merely loads, true after the first `PLAYING`, releases the waiting
    sign-in card and One Tap once, and keeps old listeners and personalization-off cases right.
- `cd worker && node --test test/*.test.mjs`: 263 pass, 0 fail (includes `beta-activity.test.mjs`).

## Evidence for acceptance criterion 1 (desktop)

Built-in browser (Chromium) against a local server on this branch, storage, service worker and caches cleared.
Screenshots in `docs/first-play-evidence/`:

1. `1-cold-start-splash-play.jpg`: first screen, Play is the primary button.
2. `2-after-one-tap-playing.jpg`: about 7 s after one click on Play: song playing (0:02 into "...gasp"), pause
   icon shown, `is-playing` set, play history written, `ebbless:firstPlayed` = 1. No sign-in or Google prompt at
   any point.
3. `3-returning-saved-queue-playing.jpg`: a tester with a saved queue and the daily tutorial invite (the QA path):
   Play starts the song.

The same flow also played on a 375 by 812 Android Chrome emulation in round 1. Emulation is not a phone.

### Steps for the CEO's Android phone (real Android Chrome)

1. Chrome, open the beta link in a Private tab (fresh storage) or clear site data for the app.
2. Wait for the splash. The Play button fades in about 4 s after load (longer on slow data).
3. Tap Play once. Expect: the app opens on the player and a song starts within about 10 s, with no Google
   sign-in prompt and no other tap.
4. Note: does a pause icon show and is there sound? A short "Add to Home Screen" splash may show first for a few
   seconds; the song is already playing underneath.
5. Close the tab, reopen the link. Because a song really played, the splash should not offer the Play choice again.
6. To see a returning tester who never played: clear only `ebbless:firstPlayed` and play log (or use a second
   profile that opened but never played) and reopen: the Play choice returns.
7. About 10 minutes later (or after closing the tab), check the beta Sheet Analytics tab for that tester:
   `plays_tapped` 1, `plays_started` 1 (needs the Sheet and worker release below).

## Security checklist (workspace CLAUDE.md), worker route `/beta/activity`

Result: **pass, nothing outstanding.** Allowlist-only keys, each counter `Math.round(Number(v))` clamped 0 to 500,
body 4000-byte cap, identity from the verified token (403 otherwise), existing 20 per 10 min per IP throttle,
no new write or subrequest (the counters ride the existing single Sheet call), generic errors, no secrets, no
dependency change, no public route renamed or reshaped, counts only (no track names or device info). Covered by
`worker/test/beta-activity.test.mjs`. `scripts/check-security.js` passes with no new baseline entry.

## What approving a release ships (exact, checked against `origin/main` on 2026-11-17)

While round 2 was in progress `origin/main` moved: the radio and station-page lane (including Release 570) was pushed
(`git fetch` shows `origin/main` = `f3ff169`). This branch already contains it. So a merge and `git push` of this
branch ships **only T-0007 commits** and nothing else: the three below plus the doc-only commit that last touched this file (`git log origin/main..HEAD` is the authority):

| Commit | What |
|---|---|
| `004450b` | one-tap Play, the three counters, worker route, Sheet columns and Dashboard rows, findings and build docs |
| `9da1c70` | merge of `main` (`f3ff169`); release number taken: **571** (`sw.js` `ebbless-shell-v571`, `WHATS_NEW` 571) |
| `b77ab1f` | round 2 fixes, behavior tests, evidence screenshots, this document |

Verify right before pushing: `git fetch && git log --oneline origin/main..HEAD` must list only T-0007 commits (those three and doc-only follow-ups). If `main`
moved again, merge it, take the next free release number in `sw.js` and `WHATS_NEW`, and re-run the checks below.

Worker. `git diff origin/main HEAD -- worker` is T-0007 only: `worker/src/beta.js` and `worker/test/beta-activity.test.mjs`.
But `npx wrangler deploy` ships the whole `worker/` folder at that commit, so it also ships any worker change already
on `origin/main` that Cloudflare does not have yet. The repo records these as not deployed or not recorded:

| Commit | What | Deployed? |
|---|---|---|
| `2f8edeb` (2026-11-16) | film and game trailers are never a song's match (#836) | commit message says "not deployed"; no later note says it was |
| `a898e04` (2026-11-17) | `GET /s` branded share previews | commit message says "worker not deployed yet" |
| `3742a14` (2026-11-16) | paywall switch and plan map | not recorded in the repo; Cloudflare is the source of truth |
| `004450b` (this task) | `/beta/activity` three counters | not deployed |

Before deploying: `cd worker && npx wrangler deployments list` for the last deploy time, then
`git log --since=<that time> --oneline -- worker`. Everything listed ships. The CEO should approve that list, not only
T-0007. To ship the T-0007 worker change alone, deploy from the commit Cloudflare currently runs plus the two T-0007
files (`git worktree add ../w <that commit>` then `git checkout claude/vigorous-morse-0bbe88 -- worker/src/beta.js`
and deploy from `../w/worker`); the owner needs to name that commit, I cannot tell it from the repo.

### Release steps (none have been run)

1. QA and the CEO approve, including the worker list above.
2. Sheet first: paste the whole `tools/beta-sheet.gs` into Apps Script. Deploy, Manage deployments, edit the existing
   Web app deployment, Version: New version (do not create a new deployment: `SHEET_URL` must not change). Then in
   the Sheet, menu EBBLESS Beta, Set up / repair sheet (adds the three Analytics columns, rebuilds the Dashboard,
   reinstalls the two triggers). Check: Dashboard rows 1 to 30 unchanged (39 / 36 / 28 funnel numbers), new block at
   rows 32 to 37, three new columns at the far right of Analytics.
3. Worker: `cd worker && npm test && npx wrangler deploy`, then `curl -s -X POST <worker>/beta/activity -d '{}'`
   should answer 403 `not a tester`, not an error page.
4. App: merge `claude/vigorous-morse-0bbe88` into `main`, run `scripts/check.sh`, push `main` (GitHub Pages serves it;
   testers get v571 on next load; the Android app refreshes its local copy in the background, so allow one launch).
5. Verify on live with a fresh browser profile and a real tester link (the Android steps above).
6. Roll back: app by reverting the merge; worker with `npx wrangler rollback`; Sheet by re-pasting the old
   `beta-sheet.gs` and running Set up / repair sheet (extra columns can stay).

## How to read it on the Dashboard

- "Opened, tapped play, never started" down and "Testers whose play started" up show causes 1 and 2 working.
- "Opened since release, never tapped play" shows who is still not trying. With "Songs played" and the funnel line
  "played at least one song" (18 of 28 on 2026-11-17) it separates a bounce from a failure.

## Known limits

- Not tested on a real Android or phone. Counters are off on localhost by design, so the live counter path ran in
  the node tests with the real code, not in a browser.
- Not verified: SoundCloud autoplay after the async resolve on a real phone, the Android native splash path,
  live Sheet headers after the paste, the deployed worker state.
- The choice buttons fade in about 4 s after load, longer on a slow connection. Not shortened.
- On a phone browser the "Add to Home Screen" splash shows for a few seconds after Play; the song is playing.
- `play_started` can fire for a muted ad-wait start; it still means the player started.
