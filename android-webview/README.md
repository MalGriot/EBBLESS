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
  The old TWA APK is saved at `~/android-tools/rollback/ebbless-twa-1.0.0.apk`
  on the owner's Mac.
- **Local build:** JDK 17 + Android SDK (platform 36, build-tools 35/36), then
  `./gradlew assembleDebug` and `adb install -r app/build/outputs/apk/debug/app-debug.apk`.

## Screen-off soak (measured 2026-10-16, TECNO POP 9, app 2.7.1)

33 minutes with the screen off and the phone unplugged (10:07 -> 10:40, 65 samples every 30s,
logged on the phone itself by `/sdcard/soak.sh`; the log has no gap longer than 33s, so the
phone never suspended):

- audio streams started in every sample, same process (pid) throughout, foreground service up throughout
- battery 100% -> 95%; Doze never went past IDLE_PENDING because audio was playing (expected)
- the system's audio mixer counted 2 underruns across the whole window
- one 33s screen wake at 10:24 (the owner checking); playback continued through it

Not covered yet: a longer run (1h+), SoundCloud as well as YouTube, a second phone, and a run
with the phone idle in a pocket/bag (Wi-Fi sleep, thermal). The first seconds of a song can
skip and then catch up (owner report, both test songs); the mixer shows no underruns, so
that is the player buffering/CPU at track start, not the app's audio path.

To repeat: `adb tcpip 5555 && adb connect <phone-ip>:5555` (approve the prompt on the phone),
`adb push soak.sh /sdcard/ && adb shell "nohup setsid sh /sdcard/soak.sh >/dev/null 2>&1 &"`,
play a long queue, lock, unplug, come back, `adb shell cat /sdcard/soak.log`.

Rollback if playback ever stops in the field: the old TWA APK is saved at
`~/android-tools/rollback/ebbless-twa-1.0.0.apk` on the owner's Mac.
