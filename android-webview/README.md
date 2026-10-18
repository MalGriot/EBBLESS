# EBBLESS Android (WebView shell)

A thin Android app around https://malgriot.github.io/EBBLESS/ so the phone's
app switcher and launch screen say EBBLESS, not the browser (the TWA in
`android/` cannot do that). Same package id (`io.github.malgriot.ebbless`)
and signing key as the TWA, so it installs as an update over it. Debug builds
use `.debug` and install beside the real app.

- **Sign-in:** Google blocks sign-in inside a WebView, so `MainActivity` opens
  `desktop/signin.html` in the default browser and gets the credential back on
  `ebbless://signin#state=..&credential=..`. The page hook is
  `window.ebblessOnSignin` in `index.html`. The sign-in link is aimed at the
  default browser by package, because the old TWA claims links on this host.
- **Background audio:** `PlaybackService` (foreground, mediaPlayback) plus a
  partial wake lock; the WebView ignores being hidden.
- **Page cache:** launch always revalidates the page (Pages caches it 10 min).
- **UA:** ends in `EBBLESS-Android/<v>`; `index.html` treats that as an
  installed app (no install gate).
- **Release:** `.github/workflows/android.yml` signs and publishes
  `ebbless.apk` to the `android` release on every push touching this folder.
  The old TWA APK is saved at `android-webview/rollback/ebbless-twa-1.0.0.apk`.
- **Releases need no local tools:** push to `main` and GitHub Actions builds, signs and publishes `ebbless.apk`.
  Page changes (index.html) need no build at all. A *local* debug build (to test on a phone with adb) needs JDK 17 and the
  Android SDK (platform 36, build-tools 35/36); they were removed from the owner's Mac on 2026-10-16 to free ~1.7 GB and
  can be reinstalled when needed, then `./gradlew assembleDebug` and `adb install -r app/build/outputs/apk/debug/app-debug.apk`
  (adb itself comes from Homebrew: `brew install android-platform-tools`).

## Screen-off soak (measured 2026-10-16, TECNO POP 9, app 2.7.1)

33 minutes with the screen off and the phone unplugged (10:07 -> 10:40, 65 samples every 30s; the logger ran on to 11:06, raw data in `test-data/soak-2026-10-16.log`,
logged on the phone itself by `/sdcard/soak.sh`; the log has no gap longer than 33s, so the
phone never suspended):

- audio streams started in every sample, same process (pid) throughout, foreground service up throughout
- battery 100% -> 95%; Doze never went past IDLE_PENDING because audio was playing (expected)
- the system's audio mixer counted 2 underruns across the whole window
- one 33s screen wake at 10:24:40 that nobody caused (owner was away). EBBLESS has no way to turn the screen on (no such permission or flag in the manifest or code). The system log from before 10:24:40 had rotated out, so the trigger is unknown; right after it `com.teqtic.lockmeout` posted a usage-stats notification and an OEM `WakeUpJobService` ran at 10:30. Playback continued through it

Not covered yet: a longer run (1h+), SoundCloud as well as YouTube, a second phone, and a run
with the phone idle in a pocket/bag (Wi-Fi sleep, thermal). The first seconds of a song can
skip and then catch up (owner report, both test songs); the mixer shows no underruns, so
that is the player buffering/CPU at track start, not the app's audio path.

To repeat: `adb tcpip 5555 && adb connect <phone-ip>:5555` (approve the prompt on the phone),
`adb push soak.sh /sdcard/ && adb shell "nohup setsid sh /sdcard/soak.sh >/dev/null 2>&1 &"`,
play a long queue, lock, unplug, come back, `adb shell cat /sdcard/soak.log`.

Rollback if playback ever stops in the field: the old TWA APK is saved at
`android-webview/rollback/ebbless-twa-1.0.0.apk`.

## Long soak (2026-10-16 12:55 -> 14:05, TECNO POP 9, app 2.8.2): FAILED at 46 min

Screen off, unplugged from 13:00:57. Music played with audio streams active and the foreground service up for the first
44 minutes (battery 100% -> 93%, about 8%/h). At 13:46:40 the phone came under heavy memory pressure (`am_low_memory`, `lmkd`
killing Instagram, Facebook helper and several phone-maker processes one by one) and at 13:47:02 Android killed EBBLESS with
SIGKILL (`ApplicationExitInfo`: reason SIGNALED, status 9, procState FGS, PSS 295 MB). No audio from 13:47 until a new process
appeared at 13:51:38 (screen woke at 13:44:56 and 13:51:38 as well; whether a person caused them is unknown). Raw data:
`test-data/soak-2026-10-16-long.log`.

Why: the phone has 2.8 GB RAM (MemAvailable about 500 MB while playing). The app uses about 222 MB itself (158 MB of that is
graphics memory) plus about 280 MB in the WebView renderer process, roughly 500 MB in total. A foreground service is not
exempt from the low-memory killer. See the GitHub issue for next steps (screen-off lightweight mode to free graphics memory).

### Follow-up in 2.9.0
Screen-off lightweight mode (page hides all screens except the players when the app broadcasts ACTION_SCREEN_OFF; app process
297 -> 228 MB, graphics 224 -> 162 MB, audio unaffected; the WebView renderer, ~320-400 MB, did not shrink) and a recovery
notice after a kill (unverified against a real low-memory kill). 13:44:56 in the long soak was a phone call. Next: audio-only
YouTube deck while the screen is off, and a tiny watchdog service process; then repeat the 70-minute soak.


## Long soak 2 (2026-10-18, TECNO POP 9, app 2.11.1): PASSED on survival, no continuous log

Checked at 17:52: one app process (pid 17885) up 1h29m since 16:24, foreground service up 1h25m, no kill in that window,
audio streams active at the check. The owner left the phone alone (no calls, no other apps). Not covered: the 30s logger died at
16:24 (a cleanup command of mine killed it), so there is no data on audio gaps or memory headroom for this run. Exit-info also
lists three SIGNALED kills of the app at 16:27 to 16:28 that do not match the single running pid; unexplained. A first attempt
earlier that day was invalid: the tester week-up screen (`ebblessWrapped.bypass()` fixes it) stopped playback after one song.
Rerun with a working logger only if a kill shows up in normal use.

## 2.11.0 (not yet tested on the phone)
- **Lock screen / notification player (#581, #634):** `PlaybackService` owns a `MediaSession` and a media-style notification
  (previous, play/pause, next, heart). The page mirrors `navigator.mediaSession` into `EbbNative.media(json)` (shim in `index.html`)
  and button presses come back through `window.__ebbMediaAction`. Cover art is fetched and scaled in the service.
- **First seconds of a song (#578):** the splash releases its video decoder at Enter; the library background video starts 6 s after the
  splash and Google sign-in 12 s after, so the first song's player does not start in a burst of other work.
- **Memory (#584):** `onTrimMemory` makes the page reclaim garbage right away. Still needs a 70-minute soak to know if it is enough.
