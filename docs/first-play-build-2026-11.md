# One-tap first song and play counters (HQ T-0007)

Branch `claude/vigorous-morse-0bbe88`. Nothing is pushed, deployed or re-run on the live Sheet. Diagnosis:
[first-play-findings-2026-11.md](first-play-findings-2026-11.md). This is round 2 (after QA round 1).

## What changed

### Cause 1: one Play on the first screen

- Splash choice (`index.html`, `#splashPlayNow`): **Play** is the primary button, above Import your music,
  Tutorial. **Enter is hidden while Play shows (round 4):** Play already enters the app and starts a song, so showing
  both was redundant. One condition decides both: `syncSplashEntry()` sets `has-played` on `#splash` from
  `hasEverPlayed()`; CSS hides Play when it is set and hides Enter when it is not. Enter stays in the page (hidden,
  not removed) because the tutorial Skip path, `returnToSplash()` and the Android native splash click it from code.
  Once a song has really played, Play is gone and Enter shows as before. Tutorial works as before.
- One tap on Play enters the app exactly like Enter, then starts the first starter in the same tap
  (`playFirstSong()`). The first song is the owner's own SoundCloud album (Breathe Love Deep): no ads, no
  Spotify, no Google. This is the builder's call (T-0007 assumption): fewest moving parts.
- **Play always plays, even with a saved queue (rounds 2 and 3).** Before, a returning tester's resumed queue made the
  import "keep the queue" and nothing played. `importKeepsQueue(type, targetIndex, id)` now lets the **starter's own
  import** replace the queue: the one-shot flag `firstSongForce` only counts for `id === firstSongStarting`. Round 3
  fix: a signup playlist (#446, `applyBetaSignupPlaylist()`) or a `?import=` link already queued on `importChain`
  runs first, keeps the queue as before (#386) and no longer uses up the force, so the starter still replaces the
  queue when its turn comes. Chosen over deferring those imports because it changes nothing for them. A later pasted
  link keeps the queue (#386). Play on the return-to-splash screen replaces the queue by design (CEO accepted).
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

1. `1-cold-start-splash-play.jpg`: first screen (re-shot in round 4): Play, Import your music and Tutorial; Enter is hidden.
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

## Splash states: exactly one way in (round 4)

| State | Shows | Way in |
|---|---|---|
| First visit, never played (web) | Play, Import, Tutorial | Play (Enter hidden) |
| Daily tutorial invite, never played | same | Play |
| Returning, has really played, tutorial invite or `returnToSplash()` | Enter, Import, Tutorial (no Play) | Enter |
| `returnToSplash()`, never played | Play, Import, Tutorial | Play (its capture handler runs Enter from code, which closes the splash and replaces the queue, as the CEO accepted) |
| Android native app cold start (`ebb-nsplash`, `NativeSplash.java`) | the native splash: Tutorial and Enter only; the web splash is cloaked | native Enter (it clicks the hidden `#splashSkipTutorial` in the page, which still works) |
| Non-choice splash (plain 3.4 s splash, install invite) | no choice buttons | none needed |

**Gap found, not changed:** the Android app's native splash (`android-webview/.../NativeSplash.java`) has its own
Tutorial and Enter buttons and no Play, so on the Android app the first screen is not Play. After Enter the tester
lands in the app, where the existing first-run play nudge (#264) glows on the starter. A native Play needs an APK
change, which is outside this task. Android Chrome (the web splash) does get Play.

## Security checklist (workspace CLAUDE.md), worker route `/beta/activity`

Result: **pass, nothing outstanding.** Allowlist-only keys, each counter `Math.round(Number(v))` clamped 0 to 500,
body 4000-byte cap, identity from the verified token (403 otherwise), existing 20 per 10 min per IP throttle,
no new write or subrequest (the counters ride the existing single Sheet call), generic errors, no secrets, no
dependency change, no public route renamed or reshaped, counts only (no track names or device info). Covered by
`worker/test/beta-activity.test.mjs`. `scripts/check-security.js` passes with no new baseline entry.

## What approving a release ships (exact, checked against `origin/main` on 2026-11-17)

While round 2 was in progress `origin/main` moved: the radio and station-page lane (including Release 570) was pushed
(`git fetch` shows `origin/main` = `c0a1779`; main's releases 571 to 575 came from other lanes). This branch already contains it. So a merge and `git push` of this
branch ships **only T-0007 commits** and nothing else: the three below plus the doc-only commit that last touched this file (`git log origin/main..HEAD` is the authority):

| Commit | What |
|---|---|
| `004450b` | one-tap Play, the three counters, worker route, Sheet columns and Dashboard rows, findings and build docs |
| `9da1c70` and the later merges of `main` (latest `c0a1779`) | merges; release number taken: **576** (`sw.js` `ebbless-shell-v576`, `WHATS_NEW` 576, above main's 571) |
| `b77ab1f` | round 2 fixes, behavior tests, evidence screenshots, this document |

Verify right before pushing: `git fetch && git log --oneline origin/main..HEAD` must list only T-0007 commits (those three and doc-only follow-ups). If `main`
moved again, merge it, take the next free release number in `sw.js` and `WHATS_NEW`, and re-run the checks below.

### Worker: what Cloudflare runs now (read-only checks, 2026-11-17)

`npx wrangler deployments list` (no writes) shows the latest deployment **2026-11-17T06:30:11Z (12:00 IST), version
`b38b74b6-e5d9-454f-a6e9-abde7effffc8`**, source "Unknown". Earlier ones: 2026-11-16T18:05:15Z (`acb8b5d5-...`) and
2026-11-16T20:35:46Z (`ec1570bb-...`). Cloudflare does not store a git commit for them, so the commit is inferred:

- The worker commits in order: `2f8edeb` (11-16 15:58Z), `3742a14` (paywall, 11-16 18:04Z), `a898e04` (`GET /s`, 11-17
  04:38Z), then T-0007's `004450b` (11-17 06:39Z). No other commit touches `worker/` in that period.
- The newest deployment (06:30Z) falls after `a898e04` and before `004450b`. A live check agrees: `GET /s` on the
  production worker answers 302 to the app, while an unknown path (`/s2`) answers 404, and `/s` does not exist before
  `a898e04`. So `a898e04` is live, and with it the older `3742a14` and `2f8edeb` (a deploy from `a898e04`'s tree
  includes its parents). The commit messages saying "not deployed" were written before these deploys.
- Confidence: **high that the running worker is the `a898e04` tree**, but not certain: it cannot rule out a deploy
  from a worktree with uncommitted edits, and I cannot read the deployed source. The 404 route list of the live worker
  and the `GET /s` check match `a898e04`; I did not byte-compare the bundle.

What would ship: `git diff --stat a898e04 HEAD -- worker` is exactly `worker/src/beta.js` (4 lines) and
`worker/test/beta-activity.test.mjs` (new). So `2f8edeb`, `a898e04` and `3742a14` (paywall switch) do **not** ship in the
steps below; they are already live.

### Release steps (none have been run)

Approve first: QA and the CEO. Then, in this order:

1. **Sheet.** Paste the whole `tools/beta-sheet.gs` into Apps Script. Deploy, Manage deployments, edit the existing
   Web app deployment, Version: New version (do not create a new deployment: `SHEET_URL` must not change). Then in
   the Sheet: menu EBBLESS Beta, Set up / repair sheet (adds the three Analytics columns, rebuilds the Dashboard,
   reinstalls the two triggers). Check: Dashboard rows 1 to 30 unchanged (39 / 36 / 28 funnel numbers), new block at
   rows 32 to 37, three new Analytics columns at the far right.
2. **Worker, isolated to T-0007.** From the repo root:

   ```bash
   git fetch
   git worktree add --detach ../w-t0007 a898e04
   cd ../w-t0007
   git checkout claude/vigorous-morse-0bbe88 -- worker/src/beta.js worker/test/beta-activity.test.mjs
   git diff --cached --stat a898e04 -- worker     # must list exactly those two files
   cd worker && npm ci && npm test                # 263 pass
   npx wrangler deployments list                  # confirm latest is still b38b74b6 (06:30Z 11-17)
   npx wrangler deploy
   ```

   If `deployments list` shows a newer deployment than `b38b74b6`, stop: someone deployed in between; re-map it before
   continuing. Dry run already done on this exact tree (`wrangler deploy --dry-run --outdir`, bundles locally, no
   upload): it builds clean. Check after deploy: `curl -s -X POST <worker>/beta/activity -d '{}'` answers 403 `not a
   tester`, `curl -sI <worker>/s` still answers 302.
   Worker rollback, right here: `npx wrangler rollback b38b74b6-e5d9-454f-a6e9-abde7effffc8` returns to the version
   running before (the old app then simply ignores the three counters).
3. **App.** Merge `claude/vigorous-morse-0bbe88` into `main`, run `scripts/check.sh`, push `main` (GitHub Pages serves
   it). `git fetch && git log --oneline origin/main..HEAD` must list only T-0007 commits (the three feature commits
   and doc-only follow-ups; today `origin/main` is `c0a1779`). If `main` moved, merge it, take the next free release
   number in `sw.js` and `WHATS_NEW` (576 now), and re-run the checks. Testers get v576 on next load; the Android app
   refreshes its local copy in the background, so allow one launch.
   App rollback: revert the merge commit and push (testers get the revert on next load).
4. **Verify the Sheet path.** Open the beta link in a fresh browser profile, tap Play, wait up to 10 minutes (or close
   the tab), and confirm the tester row in Analytics has `plays_tapped` 1 and `plays_started` 1.
5. **Android phone check (the CEO's phone, after release),** with its rollback next to it. Steps: the "Steps for the
   CEO's Android phone" list above. If Play does nothing, taps twice, or no song starts within about 10 s, roll back
   now: app by reverting the merge (step 3 rollback); the worker needs no rollback for a UI problem. If only the
   counters misbehave (Analytics cells wrong or blank), roll back the worker with `npx wrangler rollback
   b38b74b6-e5d9-454f-a6e9-abde7effffc8` and re-paste the old `beta-sheet.gs` (extra Analytics columns can stay).

## How to read it on the Dashboard

- "Opened, tapped play, never started" down and "Testers whose play started" up show causes 1 and 2 working.
- "Opened since release, never tapped play" shows who is still not trying. With "Songs played" and the funnel line
  "played at least one song" (18 of 28 on 2026-11-17) it separates a bounce from a failure.

## Known limits

- Not tested on a real Android or phone. Counters are off on localhost by design, so the live counter path ran in
  the node tests with the real code, not in a browser.
- Not verified: SoundCloud autoplay after the async resolve on a real phone, the Android native splash path,
  live Sheet headers after the paste, and the exact commit behind the running worker (inferred, see above).
- The choice buttons fade in about 4 s after load, longer on a slow connection. Not shortened.
- On a phone browser the "Add to Home Screen" splash shows for a few seconds after Play; the song is playing.
- `play_started` can fire for a muted ad-wait start; it still means the player started.
