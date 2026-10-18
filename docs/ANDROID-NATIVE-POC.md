# EBBLESS native Android: proof of concept scope

Status: scope only, nothing built or installed. Derived from
[ANDROID-NATIVE-AUDIT.md](ANDROID-NATIVE-AUDIT.md) section 12 (Phase 0.5),
narrowed to the four things the owner says are paramount:

1. UI memory
2. Start time
3. Ad-guard reliability
4. Lock-screen and Bluetooth control

Distribution is sideload only (see `android-webview/README.md`), so the Play
policy questions in the audit do not gate this.

## The one question

Does a native shell around the same hidden YouTube WebView beat today's
WebView shell (`android-webview/`, v2.11.1) on those four things by enough to
justify porting the 15 feature groups in audit section 6?

The PoC cannot shrink the YouTube WebView renderer (it is the same engine), so
the win has to come from the UI process, the launch path, the timers, and the
media session. If the numbers below are not met, stop: stay on the WebView shell.

## What it builds (and nothing else)

A throwaway app in its own lane (`scripts/session.sh start native-poc ...`),
package `io.github.malgriot.ebbless.poc` so it installs beside the real app.
No design work: one screen with a play/pause/next/prev row and a log view.

- `PlaybackService` (Media3 `MediaSessionService`, foreground `mediaPlayback`)
  owning one `SimpleBasePlayer`. Notification, lock screen, and Bluetooth all
  go through this one session.
- One hidden WebView owned by the service (not an Activity), loading a bundled
  `deck-host.html` with two YouTube IFrame decks. Same `YT.Player` calls the web
  app uses (`playVideo/pauseVideo/seekTo/getCurrentTime`), driven over a bridge.
- Fixed 6-song YouTube queue, played in order, with the standby deck preloaded
  muted and swapped at the end of each song.
- Ad guard ported to Kotlin timers, **log only, no muting**: the web functions
  `deckAdReason`, `guardActiveDeckAd`, `maybeDodgeAd` are the reference.
  The bridge only reports player state; all timing decisions run in Kotlin.
- Saved queue and position (plain file or DataStore) so a cold start can resume
  without the network, to make start time measurable.

Left out on purpose: SoundCloud, podcasts/ExoPlayer, sign-in, sync, Compose
screens, Cast, visual modes. They are tested later only if this passes.

## Baselines (current app, TECNO POP 9, measured the same way)

| Measure | Current value | Source |
|---|---|---|
| Cold launch to first frame | 0.9 to 1.4 s (`am start -W` TotalTime, 3 runs, 2026-10-18) | measured |
| App process, idle | 231 MB PSS | measured |
| App process, playing, screen on | about 190 to 250 MB | soak logs |
| WebView renderer, playing | about 375 to 590 MB | soak logs |
| Time from launch to first audio | not measured yet | **measure first** |
| Ad-guard detection timing | not measured yet | **measure first** |

Before building, measure the two missing baselines on the current app with the
same script that will be used on the PoC (below), so the comparison is fair.

## Tests and pass numbers

All on the TECNO POP 9 (2.8 GB RAM, the worst phone in the plan), unplugged,
screen off unless stated, with `soak.sh` verified to be writing **before** the
phone is unplugged (the 2026-10-18 run lost its log).

| # | Test | Pass |
|---|---|---|
| 1 | Memory: total PSS (app + WebView renderer) while playing, screen off, sampled every 30 s for 70 min | Total at least 150 MB lower than the current app in the same test, and no process kill. UI process at most 120 MB. |
| 2 | Start time: cold start with a saved queue to first audible audio, 10 runs, median | At least 40% faster than the current app's median, measured by the same script |
| 3 | Ad-guard: run the Kotlin guard (log only) beside the web guard's logic over the same 50 YouTube loads, screen on, plus 20 loads with the screen off | Detects the same ad periods as the web guard on at least 95% of loads, and with the screen off its detection delay is no worse than with the screen on (the web guard throttles when hidden, which is the case to beat) |
| 4 | Lock-screen and Bluetooth: play, pause, next, previous from the lock screen, notification, and a Bluetooth headset, screen off | Every command acts within 500 ms, 20 of 20 each, no stuck or stale notification |
| 5 | Survival: 70 min screen off, queue looping, no calls | Same process throughout, audio streams active in at least 98% of samples, no kill |
| 6 | Deck swap: standby YouTube deck swap between songs | Gap under 300 ms on at least 9 of 10 swaps (audit test 3) |
| 7 | Interruption: phone call, then another media app | Pauses or ducks, resumes correctly (audit test 4) |

Test 2 and test 3 are the ones that decide it, since memory is bounded by the
same WebView renderer. If 1 and 5 pass but 2 and 3 do not, the native shell is
not worth the port.

## What "no-go" looks like

- Total memory within 150 MB of the current app, or
- start time less than 40% faster, or
- the Kotlin ad guard not clearly more reliable with the screen off, or
- any kill or audio loss in the 70-minute run.

Any one of those means: keep the WebView shell, close the native question, and
spend the effort on the shell's known items (#578 song-start skip, audio-only
deck while the screen is off).

## Cost and order

The audit estimates this phase at 1 to 2 weeks. It needs: JDK 17 and the
Android SDK (platform 36, build-tools 35/36), about 1.7 GB, reinstalled
(removed 2026-10-16); a lane via `scripts/session.sh`; a debug build installed
beside the real app.

1. Measure the two missing baselines on the current app.
2. Service + hidden WebView + queue + swap (tests 5, 6).
3. Notification, lock screen, Bluetooth (test 4).
4. Kotlin ad guard, log only (test 3).
5. Memory and start-time runs against the baselines (tests 1, 2).
6. Write the result and a go / no-go into this file.

## Assumptions to confirm early

- `SimpleBasePlayer` can represent a queue whose engine is a WebView (audit [A]).
- The hidden WebView survives screen-off when held by the service
  (`setRendererPriorityPolicy(IMPORTANT)`, no `pauseTimers()`), audit section 5.5.
- The pass thresholds above (150 MB, 40%, 95%, 500 ms) are proposals, not
  measurements. Adjust them before building if the owner wants a different bar.
