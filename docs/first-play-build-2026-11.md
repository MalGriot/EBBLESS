# One-tap first song and play counters (HQ T-0007)

Built on branch `claude/vigorous-morse-0bbe88`, from `main` at `a898e04`. Nothing is pushed, deployed or
re-run on the live Sheet. Diagnosis: [first-play-findings-2026-11.md](first-play-findings-2026-11.md).

## What changed

### Cause 1: one Play on the first screen

- Splash choice (`index.html`, `#splashPlayNow`): **Play** is now the primary button, above Import your music,
  Tutorial and Enter. Tutorial and Enter work as before.
- One tap on Play enters the app exactly like Enter, then starts the first starter in the same tap
  (`playFirstSong()`). The first song is the owner's own SoundCloud album (Breathe Love Deep): no ads, no
  Spotify, no Google. The pick is my call: it is the starter with the fewest moving parts, and its first track
  played from a cleared browser on localhost in about 6 s (checked below).
- Returning testers who never played a song (`!hasEverPlayed()`, like #014 and #031) get the same choice on every
  open until they do. Before, `onboarding complete` sent them straight to an empty-looking library.
- A slow load can no longer hide it: the 12 s splash safety net skipped Android only; it now skips any splash that
  is showing the choice (the buttons mean nobody is stuck).
- Google One Tap now waits for the first song for anyone not already signed in (`oneTapWaiting`, runs 6 s after
  the first play).

What `018fce4` (2026-10-17) already did, kept as is: the sign-in card (`showSignInNudge`) and the install bar
(`installBannerBlocked`) wait for the first song. It did not cover Google One Tap, which still popped up on load,
so that is the one sign-in prompt this change adds.

### Cause 3: counters

| Counter | Where | When |
|---|---|---|
| `playTapped` (`plays_tapped`) | splash Play, the play button, a playlist's Play, the play/pause toggle when it starts | a deliberate play action; repeat taps while one is waiting count once |
| `playStarted` (`plays_started`) | `onDeckStateChange`, the active deck's `PLAYING` event (YouTube, SoundCloud and audio decks all go through it) | only when a tap is waiting. Not `statsTick` |
| `playFailed` (`plays_failed`) | `statsPlayTapped`'s timer, `statsPlayError` | no `PLAYING` event within 20 s (`STATS_PLAY_TIMEOUT_MS`), or the audio deck's `onerror`. A tap left behind by a closed tab is counted failed on the next open or flush |

- App batch carries `playTapped`, `playStarted`, `playFailed` (`index.html`, `statsEmpty`, `statsFlush`).
- Worker `POST /beta/activity` (`worker/src/beta.js`): three new keys, whole numbers clamped 0 to 500, same 4000
  byte body cap, same token check and per-IP throttle (20 per 10 min). An all-zero batch is still a no-op.
- `tools/beta-sheet.gs`: `plays_tapped`, `plays_started`, `plays_failed` appended after the `uses_*` columns
  (`ensureHeaders_` only appends). Dashboard: a new block **after** "7-day return rate" (rows 31 to 37):
  `FIRST PLAY (Analytics tab, anonymous)`, "Testers who tapped play", "Testers whose play started",
  **"Opened, tapped play, never started"**, "Opened, never tapped play", "Play timeouts or errors". No
  existing column, header or Dashboard row moved (the `B29/B28` reference still points at the same rows).
- Testers whose rows predate the columns have blanks, so they count in none of the new rows. "Opened, never tapped
  play" counts everyone who has not tapped since the new build, old rows included; read it as "since the release".
- Also counted, by the same code: the splash Play's starter is not counted as a playlist the tester added
  (`playlists_added` stays honest).

## Tests

- `scripts/test-first-play.js` (21 checks, added to `scripts/check.sh`): runs the real counter code from
  `index.html` with a fake clock (tap then start; tap then timeout; late start; deck error; repeat taps; closed
  tab; non-tester), checks the one-tap wiring (Play first and primary, same-tap enter and play, no sign-in on that
  path, SoundCloud starter, Tutorial and Enter kept, returning-never-played branch, One Tap wait, safety net),
  and checks the Sheet keeps every old header and Dashboard row in place.
- `worker/test/beta-activity.test.mjs` (7 tests): counters reach the Sheet; clamped; unknown fields dropped; all
  zero is a no-op; bad token refused; oversize refused.
- `scripts/check.sh` passes, including `worker` tests (263 pass).
- Browser check on localhost, cleared storage, service worker and caches, built-in browser: desktop size, a real
  click on Play (about 9 s after load, once the buttons were up) reached a playing song (first track of Breathe
  Love Deep, `is-playing` set, play history written) in about 6 s with no sign-in and no Google prompt. The same on
  a 375 by 812 Android Chrome emulation (Pixel UA): the choice stayed up past 12 s and one tap on Play started the
  song. One earlier desktop attempt landed in the library with no song because the 12 s safety net had hidden the
  choice before I clicked; that is the bug the safety net change fixes. Emulation is not a real phone (see limits).

## Security checklist (workspace CLAUDE.md), worker route `/beta/activity`

| Item | Result |
|---|---|
| Validate input on the server, allowlist first | Pass. Only known keys are read (`sessions`, `listenSec`, `songs`, `playlists`, `imports`, the three new counters, `features` from the `FEATURES` allowlist). Everything else is dropped (tested). |
| Length and type caps | Pass. Each counter is `Math.round(Number(v))` clamped 0 to 500; non-numbers become 0; body at most 4000 bytes (tested). |
| Identity from the verified token, not the body | Pass. The Sheet looks the tester up from the token; the response is 403 when it is not an active tester. No new identity field. |
| Anonymous route that writes: throttle and size caps | Pass. Unchanged: 20 requests per 10 minutes per IP; the new counters add no new write, they ride the existing single Sheet call. |
| Secrets | Pass. None added; the Sheet secret stays in the worker env. |
| Errors generic | Pass. Same fixed messages (`not a tester`, `slow down`). |
| External text into HTML, eval, SSRF | Not touched: counts only, no HTML, no fetch of a user URL. |
| Public routes not renamed or reshaped | Pass. Same route, same request shape, three optional keys added. An older app that does not send them works; a newer app talking to an older worker has its extra keys dropped. |
| Idempotent delivery | Same as before: counts are additive and fire and forget (no retry), so nothing is delivered twice. |
| Cost | No new per-request write or model call. One batch is still one Sheet call. |
| Dependencies | None added. |
| Privacy | Counts only, per tester id, no track names, no device info. |

`scripts/check-security.js` passes with no new baseline entries.

## Release steps (for the CEO's yes; none have been run)

1. QA signs off on the branch. The CEO approves.
2. Merge `claude/vigorous-morse-0bbe88` to `main`. `sw.js` is `ebbless-shell-v569` with a matching `WHATS_NEW`
   entry (version 569). If `main` moved and another lane took 569, bump to the next free number and fix the
   `WHATS_NEW` version to match.
3. Sheet first (the worker will pass the new fields on, and the Sheet must accept them):
   1. Open the beta Sheet, Extensions, Apps Script. Paste the whole updated `tools/beta-sheet.gs`.
   2. Deploy, Manage deployments, edit the existing Web app deployment, Version: New version, Deploy. (Do not
      create a new deployment: the URL in the worker's `SHEET_URL` must not change.)
   3. In the Sheet: menu EBBLESS Beta, Set up / repair sheet. This appends the three Analytics columns and
      rebuilds the Dashboard with the new FIRST PLAY rows. It also reinstalls the two triggers, which is normal.
   4. Check: the Dashboard still shows 39 / 36 / 28 and the old activity rows at rows 21 to 30; the new block is
      at rows 32 to 37; the Analytics tab has the three new columns at the far right.
4. Worker: `cd worker && npm test && npx wrangler deploy`. Check with `curl -s -X POST <worker>/beta/activity -d '{}'`
   (should answer 403 `not a tester`, not an error page).
5. Ship the app (`git push` of `main`; the site serves from there). Testers pick up v569 on their next load; the
   Android app serves a local copy that refreshes in the background, so allow one launch before the Play button
   shows.
6. Verify on live: open the beta link in a fresh profile, tap Play, confirm a song starts, then confirm a row in
   Analytics with `plays_tapped` 1 and `plays_started` 1 after the batch flushes (up to 10 minutes, or close the
   tab to flush).
7. Roll back if needed: the app by reverting the merge; the worker by `npx wrangler rollback`; the Sheet by
   re-pasting the previous `beta-sheet.gs` and running Set up / repair sheet (extra columns can stay).

## How to read it on the Dashboard

- "Opened, tapped play, never started" going down, and "Testers whose play started" going up, show cause 1 and
  cause 2 working.
- "Opened, never tapped play" shows who is still not trying. Together with the old "Songs played" and the funnel
  line "played at least one song" (18 of 28 on 2026-11-17) it separates a bounce from a failure.

## Known limits

- I could not test on a real Android or Chrome desktop with a real tester token. The counters are off on
  localhost by design (`statsHostOk`), so the live counter path was exercised by the node tests with the real
  code, not in a browser.
- The first screen's choice buttons still fade in about 4 s after load (existing 1.3 s brand beat plus a 2.7 s
  CSS delay), longer on a slow connection. I did not shorten it.
- On a phone browser the splash shows the "Add to Home Screen" invite for a few seconds after Play before the app
  is visible; the song is already playing underneath. This is the existing Enter behavior.
- `play_started` can fire for a muted ad-wait start; it still means the player started.
