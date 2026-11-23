# One-tap first song and play counters (HQ T-0007)

Branch `claude/vigorous-morse-0bbe88`. Nothing is pushed, deployed or re-run on the live Sheet. Diagnosis:
[first-play-findings-2026-11.md](first-play-findings-2026-11.md). This is round 2 (after QA round 1).

## What changed

### Cause 1: one Play on the first screen

> **Also see T-0011 (release 581, `docs/first-timer-start-2026-11.md`).** First-timers now land on Home with a Start here tile that
> plays the starter song on a tap (never automatically), the first checklist step is "Play this song", and a first-timer's
> song started from any path counts one `plays_tapped` (the funnel table there lists every path).

> **Superseded by T-0010 (release 578, `docs/splash-fixes-2026-11.md`).** The CEO reversed this logic after trying
> release 577: no music history now shows only **Enter**; a saved queue or last song shows **Resume** (same button,
> `#splashPlayNow`, no Enter). Resume continues the saved queue and never loads the starter or replaces the queue, so
> the "Play replaces a saved queue" behavior from rounds 2 and 3 is removed. The class is now `can-resume` (set by
> `syncSplashEntry()` from `splashResumable()`). The text below is the 577 design, kept as history; the splash-state
> table further down is updated.

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
| First visit, no saved song (web) | Enter, Import, Tutorial (Resume hidden) | Enter |
| Daily tutorial invite, no saved song | same | Enter |
| Daily tutorial invite or `returnToSplash()`, saved queue or last song | Resume, Import, Tutorial (Enter hidden) | Resume (enters like Enter, then continues the saved queue; counts `plays_tapped`) |
| History but nothing resumable (saved song deleted, empty, bad data) | Enter, Import, Tutorial | Enter |
| Android native app cold start (`ebb-nsplash`, `NativeSplash.java`) | the native splash: Tutorial and Enter only; the web splash is cloaked | native Enter (it clicks the hidden `#splashSkipTutorial` in the page, which still works). Unchanged by T-0010 |
| Android app web splash with no native splash (process-recovered launch, or after `nsplashDone`; `startApp()` Android branch) | Enter or Resume by the same rule, plus Import, Tutorial | Enter or Resume (`syncSplashEntry()` runs before `is-choice`) |
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

## What approving a release ships (checked against `origin/main` = `c0a1779`, 2026-11-18)

`git fetch && git log --oneline origin/main..HEAD` lists these 9 commits (before the doc tidy that this table is part of).
All are T-0007 or merges of `main` into the branch; a merge and `git push` ships nothing else:

| Commit | What it changes |
|---|---|
| `004450b` | one-tap Play on the splash, the three counters (app, worker route, Sheet columns, Dashboard rows), findings and build docs, tests |
| `9da1c70` | merge of `main` at the time; first release-number clash fixed (took 571) |
| `b77ab1f` | round 2: Play replaces a saved queue, starter marked before Enter, "has played" follows the real `PLAYING` event, Sheet row wording, behavior tests, evidence screenshots |
| `93296f7` | doc only: corrects what a push ships after `origin/main` moved |
| `f08a905` | round 3: starter force tied to the starter's id (signup or `?import=` import ahead of Play), its test, isolated worker deploy steps |
| `cba77bc` | merge of `main` (`d421418`); release number moved to 572 |
| `4e85ee2` | merge of `main` (`c0a1779`); release number moved to **576** (`sw.js` `ebbless-shell-v576`, `WHATS_NEW` 576, above main's 575) |
| `d4ef15b` | round 4: Enter hidden while Play shows, Play hidden once a song has really played (`syncSplashEntry`), its test, new splash screenshot, splash-state table |
| `f15128f` | round 5: Android web splash syncs Play/Enter before showing, splash CSS rule tested by parsing it, worker diff and running-version corrections |

The doc tidy commit that follows these touches this file only. Verify right before pushing that `git log --oneline
origin/main..HEAD` is these commits plus doc-only tidies. If `main` moved again, merge it, take the next free release
number in `sw.js` and `WHATS_NEW`, and re-run the checks below.

### Worker: what Cloudflare runs now (read-only checks)

**Current statement (re-checked 2026-11-18): the running worker is version `a49e3cec-ba42-4e31-962c-bb7f0edcec9a`,
deployed 2026-11-18T02:33:21Z (08:03 IST), and it is the `db414e3` tree.** Before deploying, `npx wrangler deployments
list` must still show `a49e3cec` as the latest; if it shows anything newer, stop and re-map it.

How that is known: Cloudflare stores no git commit for a deployment (source "Unknown"), so the commit is inferred.
`db414e3` ("Profile sync no longer loops", release 572) was committed 2026-11-18T02:33:00Z and `a49e3cec` was deployed
**21 seconds later**, with its client half already live. The worker commits in order are `2f8edeb`, `3742a14`
(paywall), `a898e04` (`GET /s`), `db414e3`, then T-0007's `004450b`; no other commit touches `worker/`. Confidence is
high but not certain: it cannot rule out a deploy from a worktree with uncommitted edits, and I cannot read the deployed
source. The owner can confirm in the Cloudflare dashboard.

History only (earlier deployments, not current): on 2026-11-16T18:05:15Z (`acb8b5d5-...`) and 2026-11-16T20:35:46Z
(`ec1570bb-...`) earlier versions went out, and on 2026-11-17T06:30:11Z version `b38b74b6-e5d9-454f-a6e9-abde7effffc8`
went out, which was the `a898e04` tree (a live `GET /s` returned 302 while an unknown path returned 404, and `/s` did
not exist before `a898e04`). `2f8edeb`, `3742a14` (paywall switch) and `a898e04` are therefore live since then; their
commit messages saying "not deployed" were written before those deploys.

What would ship, precisely:

- `git diff --stat db414e3 HEAD -- worker` is exactly `worker/src/beta.js` (4 lines) and
  `worker/test/beta-activity.test.mjs` (new): T-0007 only. A normal `npx wrangler deploy` from this branch therefore
  ships T-0007 only, provided the running worker is the `db414e3` tree as stated above.
- `git diff --stat a898e04 HEAD -- worker` lists four files: those two plus `worker/src/index.js` and
  `worker/test/profile-merge-parity.test.mjs` (both `db414e3`). If the inference above were wrong and `db414e3` were not
  deployed, a normal deploy would also ship that profile-sync worker fix. The isolated deploy below is built on `db414e3`;
  to leave `db414e3` out as well, build it on `a898e04` instead (the commands say how). **Whether `db414e3`'s worker
  change should ship is a separate decision for the CEO**, not part of T-0007.

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
   git worktree add --detach ../w-t0007 db414e3     # base = the commit the running worker matches
   #                                                  # (use a898e04 instead to leave db414e3's worker change out)
   cd ../w-t0007
   git checkout claude/vigorous-morse-0bbe88 -- worker/src/beta.js worker/test/beta-activity.test.mjs
   git diff --cached --stat db414e3 -- worker     # must list exactly those two files
   cd worker && npm ci && npm test                # all pass
   npx wrangler deployments list                  # confirm latest is still a49e3cec (02:33Z 11-18)
   npx wrangler deploy
   ```

   If `deployments list` shows a newer deployment than `a49e3cec`, stop: someone deployed in between; re-map it before
   continuing. Dry run already done on this exact tree, `db414e3` plus the two T-0007 files (`wrangler deploy --dry-run
   --outdir`, bundles locally, no upload): it builds clean and the worker tests pass (267). Check after deploy: `curl -s -X POST <worker>/beta/activity -d '{}'` answers 403 `not a
   tester`, `curl -sI <worker>/s` still answers 302.
   Worker rollback, right here: `npx wrangler rollback a49e3cec-ba42-4e31-962c-bb7f0edcec9a` returns to the version
   running before (the old app then simply ignores the three counters).
3. **App.** Merge `claude/vigorous-morse-0bbe88` into `main`, run `scripts/check.sh`, push `main` (GitHub Pages serves
   it). `git fetch && git log --oneline origin/main..HEAD` must list only T-0007 commits (the commits in the table above
   plus doc-only tidies; today `origin/main` is `c0a1779`). If `main` moved, merge it, take the next free release
   number in `sw.js` and `WHATS_NEW` (576 now), and re-run the checks. Testers get v576 on next load; the Android app
   refreshes its local copy in the background, so allow one launch.
   App rollback: revert the merge commit and push (testers get the revert on next load).
4. **Verify the Sheet path.** Open the beta link in a fresh browser profile, tap Play, wait up to 10 minutes (or close
   the tab), and confirm the tester row in Analytics has `plays_tapped` 1 and `plays_started` 1.
5. **Android phone check (the CEO's phone, after release),** with its rollback next to it. Steps: the "Steps for the
   CEO's Android phone" list above. If Play does nothing, taps twice, or no song starts within about 10 s, roll back
   now: app by reverting the merge (step 3 rollback); the worker needs no rollback for a UI problem. If only the
   counters misbehave (Analytics cells wrong or blank), roll back the worker with `npx wrangler rollback
   a49e3cec-ba42-4e31-962c-bb7f0edcec9a` and re-paste the old `beta-sheet.gs` (extra Analytics columns can stay).

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
