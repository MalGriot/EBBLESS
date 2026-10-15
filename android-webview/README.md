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

## CRITICAL NEXT STEP: 30-minute unplugged screen-off soak

Passed so far: 5 minutes screen off, **on USB** (charging hides Doze), one
phone (TECNO POP 9). Before telling testers to rely on this build:

1. Pair wireless debugging (`adb pair`, `adb connect`), unplug the cable.
2. Play a YouTube track and a SoundCloud track, screen off, 30 minutes, battery
   below ~80% and not charging.
3. Pull evidence: `adb shell dumpsys audio` (stream `started`), foreground
   service still up, no gap in playback you can hear.
4. Also check the app switcher card after a long idle and a process restart,
   and a fresh tester sign-in (non-owner Google account) end to end.

If playback stops, fall back to the TWA APK above and re-publish it.
