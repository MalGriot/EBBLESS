# Splash fixes (T-0010), release 578

> Release 581 (T-0011, `docs/first-timer-start-2026-11.md`) leaves the splash, Resume and Enter exactly as below. It only changes where a new
> person lands after the splash: Home with a Start here tile instead of the empty Library.

App only. No worker deploy, no Sheet step, no `house-vibes.json` change. Nothing is pushed until the CEO says yes.

## What changed
1. **Splash background video no longer flickers on a slow first load.** Cause: the video's `is-playing` class was
   removed on every buffering stall, so the picture cut from the moving video to the still poster and back, hard.
   It now latches once frames have played (a stalled video holds its last frame) and fades in once (400 ms, opacity).
   Evidence: `docs/first-play-evidence/6-video-before-slow4g.txt` (flips to opacity 0 at 20.7 s, 21.7 s, 24.1 s, ...) and
   `6-video-after-slow4g.txt` (stays at opacity 1 through the same stalls). Headless Chrome, 390 px wide, Slow 4G, gzip server.
2. **Enter for new people, Resume for people with history.**
   - Music history means `hasEverPlayed()` is true, or a saved queue or last song exists (`ebbless:resume` pointing at a
     playlist that still has tracks).
   - Resume shows only when something can be resumed. History with nothing resumable shows Enter. Never both, never neither.
   - Resume enters like Enter, counts `plays_tapped`, then continues the saved queue. It does not load the starter or
     replace the queue (the old "Play replaces a saved queue" path is deleted).
   - The play nudge after Enter (#264) is unchanged. Android native splash is unchanged.
3. Release 578: `sw.js` cache bump and a WHATS_NEW entry.

| Splash state | Shows |
|---|---|
| First visit, nothing saved | Enter, Import your music, Tutorial |
| Daily tutorial invite, nothing saved | Enter, Import, Tutorial |
| Invite or `returnToSplash()` with a saved queue or song | Resume, Import, Tutorial |
| History but nothing resumable | Enter, Import, Tutorial |
| Android web splash | by the same rule |
| Android native splash | Tutorial, Enter (unchanged) |

Screenshots: `docs/first-play-evidence/4-splash-no-history-enter.jpg`, `5-splash-history-resume.jpg`.

## Release steps (app only)
1. QA reviews the branch `claude/splash-fixes-942c00`.
2. On the CEO's yes: merge to `main` and push (GitHub Pages deploys the app). No worker deploy.
3. Phone check, fresh browser profile: first load on mobile data. The background should fade in once and not
   cut to a still. Splash shows Enter, no Resume.
4. Same phone, open a song in the app, close the tab, reopen: if the splash shows (tutorial invite), it says Resume;
   tap it, the same song is back, the queue is unchanged.
5. Rollback: revert the commit and bump `sw.js` to the next number.

## Follow-ups outside this task
- The T-0008 newsletter hero and first bullet still describe the one-tap Play and need rewording.
- On Slow 4G the 4.4 MB splash video still takes about 19 s to start; the splash stays on its poster until then.
  A smaller mobile encode would shorten it; not done here.
- Resume only appears on splash paths that show after the first visit (daily tutorial invite, return-to-splash,
  and never-played people with a saved queue). A returning person who has played goes straight into the app, as before.
