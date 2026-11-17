# Why 10 testers opened EBBLESS and never played a song (HQ T-0006)

Read-only diagnosis, 2026-11-17. No code, Sheet or HQ file other than INBOX was changed.

## Short answer

The 10 testers did not fail after trying something. In the Analytics tab every one of them shows
zero playlists added, zero searches (`vibe_search`), zero shares and zero feature use, on top of zero
songs and zero minutes. They opened the app, touched it, and left without taking any first action.
So the likely cause is on the first screens (what to do next, the Google sign-in ask, a playback
that does not start), not a broken import. Direct feedback from these 10 is almost nonexistent (1 of
10 wrote anything), so every cause below is inference from the code plus the other 18 testers.

## The 10 testers (Analytics tab, read 2026-11-17)

| Tester | First active | Sessions | Days active | Note |
|---|---|---|---|---|
| #001 | 10-03 | 1 | 1 | |
| #019, #021 | 10-04 | 1 each | 1 | |
| #027 | 10-08 | 2 | 1 | |
| #009 | 10-09 | 1 | 1 | wrote feedback, see below |
| #030 | 10-09 | 1 | 1 | |
| #032 | 10-09 | 2 | 2 | returned 11-05 |
| #029 | 10-13 | 2 | 1 | |
| #014 | 10-03 | 3 | 3 | returned 10-08 and 10-10 |
| #031 | 10-09 | 3 | 3 | returned 10-10 and 10-14 |

7 of 10 had a single day of activity. #014 and #031 came back and still played nothing.

## Builds compared

- Testers' build: `main` as of 2026-10-03 to 10-13. I read `index.html` at `1126d93` (10-03, SW v72),
  `9d7b1e3` (10-09) and `f2b5f3b` (10-14). The first-run code below is the same in all three unless noted.
- Current `main` (`aedc82d`, 2026-11-17) is 1260 commits after `f2b5f3b`. In this checkout `main` and
  `origin/main` are the same commit, so the "25 unpushed commits" note in the task is out of date here.
- First-run changes after the testers' build that matter: `018fce4` (10-17) the sign-in card and install
  bar now wait for the first song ("Quiet first run"); `0b15d33` to `4aaa6b8` (10-13) welcome page and
  15-minute sample added; `statsTick` now also skips Rickroll and unliked plays (#614). The starter library,
  the paste guide and the stats rules are otherwise unchanged on `main` (`index.html:24706`, `:26668`).

## First-run path in the October build (line numbers are `1126d93:index.html` unless noted)

1. **Beta lock** (`:2218-2290`). On a non-localhost host the app is covered by `#beta-lock` until
   `localStorage ebbless:betaToken` exists and `/beta/me` accepts it. A tester arrives by invite link
   (`?t=` token) or pastes the link in the lock form. By the 10-09 build the lock also carries a Google
   sign-in button (`renderBetaGateSignIn`, `9d7b1e3:index.html:5451`); it is not in the 10-03 build. If the lock rejects the token or
   the network check fails, the tester sees the lock, not the app (`:2272-2276`).
2. **Splash** (`:2310-2335`, `:19115-19150`). First visit shows the EBBLESS mark for 1.3 s, then the
   cymatics splash with two buttons: **Tutorial** and **Enter**. Enter sets `ebbless_onboarding_complete`
   and calls `startApp()`. Tutorial runs `runIntro()`.
3. **Tutorial** (`:17970-18050`, scripted demo at `:18590`). While it runs, `body.onb-active` hides the real
   UI. It plays its own theme music and flips `is-playing` on a fake player. None of this is counted as a
   song (`statsTick` returns on `onb-active`, `:9572`). Skip finishes it.
4. **startApp()** (`:17539`). Seeds a starter library if the user has nothing of their own: a SoundCloud
   album (Breathe Love Deep) and one Spotify playlist (`STARTER_LIBRARY_URLS :8943`, `seedStarterLibrary
   :8966`, called `:17637`). So the library is not empty, but the two starters resolve through the worker
   in the background and fail silently ("a failed fetch just leaves the library short", `:8985`).
5. **Paste guide "Start here"** (`:8987-9030`). A bubble over the paste bar says to paste a link. It
   shows only after the splash is gone and only until the user adds a playlist.
6. **Sign-in nudge / One Tap** (`9d7b1e3:index.html:5883-5925`, `showSignInNudge`). Google One Tap prompts on
   load. If it cannot show (Safari, blocked third-party sign-in) a "Sign in once and your library syncs"
   card with Google's button is put in front, once per device. Dismissing One Tap starts a 24 h cooldown.
7. **First song.** The tester taps a starter tile or pastes a link and presses play. The resolve call goes
   to the worker, tracks load in a hidden YouTube/SoundCloud deck, and `setPlayingUI(true)` sets
   `is-playing` (`:12365-12369`). Only now can a song count.

## Every step that can stop a new user

| Step | Evidence for | Evidence against |
|---|---|---|
| A. Beta lock or token problem | Only matters before a session is recorded. | These 10 have sessions, so the token worked (`statsEnabled()` needs a valid token, `:9540`). Ruled out for the 10. |
| B. Google sign-in or data concern | #009 (one of the 10), 10-09: "Not happy with the sign in for google, data collection is a big X for me" and "Because of the signing in I didn't go further". Four of the 10 first opened 10-09, the day of the sign-in by redirect and Auto sign-in commits (`8c55fa0`, `b6ca531`). `018fce4` (10-17) later moved the card behind the first song, which suggests it was seen as a blocker. | Only one tester says this in words. Sign-in is not required to play once the token exists. |
| C. No clear next action (paste a link, library of two unknown starters) | #010: "Wasn't expecting paste a link" and "Curious where it is pulling the music from". #028 on 10-12 needed an icon and tooltips to understand switches. The 10 never imported or searched, and `vibe_search` is the second most used feature (28 sessions) among everyone else. | The paste guide and the tutorial exist. No tester among the 10 says they were confused. |
| D. Tutorial or splash consumed the visit | Tutorial plays its own music and counts as nothing, so a tester who sat through it has "0 songs". Splash is two buttons with no sound of the product. | Skip exists. Unknown how many chose Tutorial. |
| E. First play does not start | Bug Reports from other testers: #010 "Songs not playing... Audio is just a beeping sound" (iPhone Safari, 10-03); #017 "The song wasn't playing until i switched it to the vid"; #028 "it kept buffering and the tracks are not playing"; #002 "Some songs were not playing and before that I could hear ads"; #010 "Spotify loaded but no audio, and Apple Music wouldn't load". Slow starts: #020 "Songs take too long to start playing". A stalled start never sets `is-playing`, so it records 0 songs. | None of the 10 filed a playback bug. A failed play usually follows an import or search attempt, and these 10 have none. Device and browser of the 10 is not recorded. |
| F. Starter library fails to load | Seeding is best-effort and silent (`:8985`). Spotify import is the path testers reported as failing. | The SoundCloud starter does not use Spotify. No report of an empty library. |
| G. Platform not supported on first open | #007 (not in the 10) on 10-12: "it never gave me a icon for my iphone... I'm not attuned to opening a server on my phone". Many testers were on iPhone Safari or Chrome, where background audio and the install flow were weak. iOS is now out of scope (memory note 2026-10-16). | Device is unknown for the 10. |
| H. Ads on first play | 13 "[Ads playing?]" taps among testers in the window; "The youtube ads are loud and really jarring" (#020). | Only from testers who did play. |
| I. Analytics undercount (see next section) | Short plays and the tutorial are not counted. #012 shows 1 song and 0 minutes. | The 10 also show 0 imports, 0 searches and 0 features, which are not play-dependent. |

## Feedback and Bug Reports, 2026-10-01 to 10-20

Read-only. 43 of 54 Feedback rows and 8 of 9 Bug Reports rows fall in the window. Only one row belongs to
a tester in the 10 (#009, quoted in B). Everything else is from testers who did play. Relevant lines
about first play:

- #009, survey 10-09: "Because of the signing in I didn't go further".
- #010, bug 10-03: "Audio is just a beeping sound"; "Apple Music playlist won't load".
- #017, bug 10-11: "The song wasn't playing until i switched it to the vid".
- #028, bug 10-12: "it kept buffering and the tracks are not playing".
- #002, bug 10-22 (just outside the window, same issue): "Some songs were not playing".
- #020, 10-09: "Songs take too long to start playing".
- #010, survey 10-04: "Wasn't expecting paste a link".

Other 10-01 to 10-20 feedback is mostly polish and ads (visualizer controls, back button, lyric sync).
Row EBB-FB-0042 is the owner testing and should be excluded from any count.

## Is "0 songs" really "did not play"?

How it is recorded (`:9519-9650`, `tools/beta-sheet.gs:820-850`):

- The app counts only for a stored tester token, off localhost, and when stats are not opted out.
- A **session** starts on any activity after 30 minutes idle: page load, a pointerdown or keydown at
  least 5 s apart, visibility returning (`statsTouch`). A session is not a play.
- A **song** counts only inside `statsTick`, every 15 s, when `artworkWrap` has `is-playing`, the tutorial is
  not active, and the song key changed. So audio must be running at a 15 s tick.
- The batch (sessions, songs, minutes, features, imports) flushes every 10 min and when the tab hides;
  the Sheet adds it to the tester row. Fire and forget: a lost batch undercounts.

Verdict: mostly "did not play", with a small undercount. Cannot be recorded as a song: a play shorter
than the 15 s tick, tutorial or sample music, a play stalled before `is-playing`, a tab suspended before
the tick fires (phones). #012 proves the short-play case (1 song, 0.0 minutes). But the same batch that
carried each session also carries imports and feature uses, and for all 10 these are zero, so a hidden
play with other activity is unlikely. The analytics cannot tell "tried and failed" from "never tried".

## Top 3 likely causes, ranked

### 1. Nothing pulls a new tester to a first song (first screen asks for a paste, a sign-in or a tutorial)

Why: all 10 did nothing countable after opening; the app opens on a library of two unfamiliar starters,
a "paste a link" bubble, a Tutorial or Enter choice, and a Google sign-in ask. #010 and #009 describe
exactly this. Confidence: medium (inference, one direct quote).

- Fix: one obvious "Play" on the first screen that starts a first song in one tap (a starter or a
  curated first song), no sign-in before that song, and keep the tutorial optional and after the song.
  Much of the sign-in part is already on `main` (`018fce4`). Confirm in the app that tap-to-song works
  cold, then add the one-tap play.
- Size: S to M.
- Dashboard: "Testers who opened the app" (28) against the share with `songs_played` above 0 (now 18 of 28).
  Success is the new cohort of testers going from about 64% to 85% or more. The funnel line
  "played at least one song" shows it.

### 2. The first play does not start or starts too slowly, and nothing says so

Why: five other testers reported a first play that beeped, buffered, stayed silent, or needed the video
view. A stalled start leaves `is-playing` off, so it is counted as 0. The 10 may have tapped play once, got
nothing, and left without any further action. Confidence: medium-low for the 10 (no direct report), high
that it is a real problem.

- Fix: on first play, show a clear status ("Loading... still trying"), auto-fall back to another source or
  the video deck after a few seconds, and send a small anonymous `play_failed` count so it can be measured.
  Prefer the most reliable source for the starter songs.
- Size: M.
- Dashboard: new "first play failed" count (needs the analytics change below); success is the 0-song
  testers who opened the app dropping from 10 to 4 or fewer, and "Avg sessions per tester" holding or rising.

### 3. We cannot see the difference between "never tried" and "tried and failed"

Why: sessions count any touch, songs need a running audio tick, the tutorial and the sample count as
nothing. The funnel step "opened, 0 songs" mixes bounces, failed plays and measurement gaps. Without this
fix causes 1 and 2 cannot be separated next month.

- Fix: add three anonymous counters to the existing batch and Sheet: `play_tapped`, `play_started`
  (on the player's real playing event, not the 15 s tick), `play_failed`; add them to the Analytics tab
  and the Dashboard. Do not change old columns.
- Size: S (app counters, `tools/beta-sheet.gs` headers, worker clamp; includes security review for the
  worker route per CLAUDE.md).
- Dashboard: a new row "Opened, tapped play, never started" next to "Songs played". It shows whether
  the 10 were bounces (0 taps) or failures (taps without a start).

## What this does not cover

- Device, browser and OS of the 10 are not in the Sheet. The Testers tab header has no device column and the
  Analytics tab has none; only feedback rows carry a user agent.
- Only #009 wrote anything. I did not try to identify anyone and used only tester numbers.
- I did not run the app on a device, so cause 2 rests on other testers' reports.
