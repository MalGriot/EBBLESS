# EBBLESS native Android: test plan

Companion to [ANDROID-NATIVE-AUDIT.md](ANDROID-NATIVE-AUDIT.md). Written
2026-10-15. Section numbers like "audit 5.5" point into that doc.

The audit's main finding drives this plan: the risk is not the UI, it is
whether YouTube and SoundCloud keep playing from a hidden WebView inside a
foreground service, with the screen off, on real phones. So testing starts
with a throwaway proof of concept (POC) and a hard go / no-go gate. No UI work
is tested (or built) until that gate passes.

---

## 1. Gates at a glance

| Gate | When | What must be true to continue |
|---|---|---|
| G0 Ready to test | Before the POC runs | Devices, tooling, test content, staging, debug OAuth client in place (section 2) |
| G1 Architecture go / no-go | End of Phase 0.5 | POC tests T1 to T12 pass on the required devices (section 4) |
| G2 Foundations | End of Phase 1 | Real links resolve, save, play in background through the queue, survive process death |
| G3 Continuity | End of Phase 2 | Web and Android libraries sync both ways with zero drift on shared vectors |
| G4 Parity | End of Phases 3 to 5 | Parity checklist complete or items explicitly deferred by the owner |
| G5 Release | Phase 6 | Signed APK on the sideload release installs and updates cleanly, TWA testers migrated without losing signed-in libraries |

**Distribution: sideload only (owner decision, 2026-10-15).** Option O1 from
audit section 8, with no Play track planned. The native app ships as an APK
from a GitHub release, like the current TWA sideload. So "pass" means today's
web behavior: YouTube keeps playing in the background with the screen off.
Play policy items (audit P3, P7, P8) do not gate testing. YouTube and
SoundCloud terms (P1, P2, P6) still apply and stay the owner's accepted risk.
The ad guard runs log-only in the POC until decision 2 (section 8).

**The TWA keeps shipping by sideload too.** The current TWA APK stays on the
existing `android` GitHub release, linked from the beta page, as the Android
app testers use today. It is not uploaded to Play. It stays the testers' app
until the native app passes G4 and replaces it (section 7).

To keep both apps on one phone during testing, the POC and early native
builds use their own package id, **`io.github.malgriot.ebbless.native`**
(debug: `.native.debug`), never the TWA's `io.github.malgriot.ebbless`.
Installing a different APK under the TWA's package id would fail (different
signing key) or replace the tester's working app.

---

## 2. Test environment (G0)

### 2.1 Device matrix

Background audio dies differently per manufacturer, so the matrix is by
battery-manager behavior, not by brand loyalty. [A]

| Slot | Why | Required for G1 |
|---|---|---|
| D1 Stock Android (Pixel, or Motorola/Nothing as a near-stock stand-in), current Android | Baseline: if it fails here, the architecture fails | Yes |
| D2 Samsung (One UI), Android 13+ | Aggressive "sleeping apps" | Yes |
| D3 Xiaomi / Redmi / POCO (HyperOS or MIUI) | Most aggressive background killer, and very common in India where testing happens [A] | Yes |
| D4 Low-RAM, budget chipset: **owner's TECNO POP 9** | Low-memory kills, slow WebView, plus Transsion's HiOS battery manager (another aggressive killer family) [A] | Yes (it is in hand) |
| D5 Realme / OPPO / Vivo / OnePlus (ColorOS family) | Another aggressive killer family | Nice to have |

**D4, TECNO POP 9.** The name covers two different phones, so check which
one this is before the first run (Settings > About phone, model number):

| | POP 9 5G | POP 9 (4G) |
|---|---|---|
| Chipset | MediaTek Dimensity 6300 (6 nm), Mali-G57 MC2 | MediaTek Helio G50 (some markets: Helio T615) |
| RAM | 4 GB (+4 GB "memory fusion" virtual RAM); some listings 8 GB | 3 GB or 4 GB |
| OS | Android 14, HiOS 14 | Android 14 **Go edition** on some listings |
| Battery | 5000 mAh | 5000 mAh |
| Display | 6.6" 720p, 120 Hz | 6.67" IPS |

Either way it is the right low-end device for the matrix. If it is the Go
edition, note it in every result: Go builds limit background work more
tightly, which makes T1, T2 and T10 harder to pass. Virtual RAM does not help
WebView renderers, so treat the real RAM (3 or 4 GB) as the number that
matters. The beta testers Sheet was not reachable from this session (Drive
search found nothing), so these specs come from public listings (91mobiles,
GSMArena, FoneArena), not from the tester row. Confirm the exact model there.

Still to fill before G0: D1 to D3 from the owner's and testers' phones.
Testers' devices can cover D3 and D5.

Record for every run: model, Android version, OEM skin version, **Android
System WebView version** (`adb shell dumpsys webviewupdate`), app build.
WebView updates through Play independently of the OS, so a result is only
reproducible with that version noted.

### 2.2 Tooling

- **Install `adb`** (not on this Mac yet). Two ways:
  - Fast, command line only: `brew install --cask android-platform-tools`,
    then check with `adb version`.
  - Full: install Android Studio (it bundles platform tools under
    `~/Library/Android/sdk/platform-tools`); needed anyway to build the POC.
    Add that folder to `PATH` if `adb` is not found.
- **Prepare each phone for adb:** Settings > About phone, tap the build number
  7 times to unlock Developer options. Turn on **USB debugging**, plug in once,
  accept the "Allow USB debugging" prompt for this Mac, confirm with
  `adb devices`. On TECNO/HiOS the build number is under About phone > Build
  number; also allow "Install via USB" if HiOS asks.
- Wireless debugging (Android 11+), so soak tests run **unplugged**. A USB
  cable charges the phone, which disables Doze and hides exactly the failures
  we are looking for. Developer options > Wireless debugging > Pair device
  with pairing code, then `adb pair <ip:port>` and `adb connect <ip:port>`.
- `scrcpy` (optional) to watch and drive the phone from the Mac.
- Second phone for real incoming calls (T6).
- A Bluetooth headset with next/previous buttons; a car head unit if available.
- Wired headphones or a USB-C dongle for the unplug test.

### 2.3 Test content

| Content | Use |
|---|---|
| The standard test playlist (Spotify `5qMMDwZ1Wo8q0lpDOmsXnZ`) | General playback, resolve, queue |
| The popular-hits Apple Music ad playlist (`pl.7a1d8bd609c44c318d71bf1a0a1e89b5`) | Anything ad-related. The owner's own catalog gets no real ads, and faked ads do not behave like real ones |
| One SoundCloud track and one SoundCloud set | `sc:` deck, SC to YouTube transitions |
| One podcast RSS feed with a long episode (60+ min) | `au:` ExoPlayer deck, long soak |
| A YouTube video known to be embed-restricted (error 150/152) | Error path |

### 2.4 Backend and accounts

- Debug build points at `BACKEND_STAGING`; never at production (KV quota was
  hit once, audit 3.2).
- An **Android OAuth client** for the POC's package id and debug signing
  SHA-1, registered in the same Google Cloud project as the web client (audit
  3.3). Needed for T11. **This is an owner step, see section 2.6.**
- A dedicated test Google account, not the owner's main account.

### 2.5 Logging the POC must have (so results are measured, not felt)

The POC writes structured, timestamped lines to **an on-device file** (so
unplugged runs still produce evidence) and to logcat:

| Tag | Events |
|---|---|
| `EBB/deck` | load, buffering, playing, paused, ended, error code, for each deck id and source |
| `EBB/xfade` | crossfade start/end, both deck volumes each step |
| `EBB/queue` | advance, which deck took over, gap in ms |
| `EBB/focus` | audio focus gained/lost/transient/duck, noisy intent |
| `EBB/ad` | ad guard verdicts (log only), same fields as web `ebblessAdLog` |
| `EBB/life` | service start/stop/foreground, task removed, trim memory, WebView renderer gone |
| `EBB/tick` | one line every 30 s while playing: deck position, wall clock, screen state |

`EBB/tick` is the heartbeat. A gap longer than 30 s in the ticks means
something froze, even if audio sounded fine.

### 2.6 OWNER ACTION: register the Android OAuth client

> **Implementing session: stop here and prompt the owner.** When the POC
> project exists and has a debug build (before writing the sign-in code for
> T11), print the package id and the debug SHA-1 below, give the owner these
> steps, and wait until they confirm it is done. Do not try to do it in a
> browser for them: it is a Google Cloud console change on their account.
> Everything else in the POC can continue while waiting; only T11 is blocked.

What the session gets for the owner first:

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA1
```

Package id: `io.github.malgriot.ebbless.native.debug` (whatever the POC's
debug `applicationId` actually is; copy it from the build file, do not
assume).

Owner steps (about 5 minutes):

1. Open [Google Cloud console > APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
   and pick the **same project** that holds the web OAuth client EBBLESS
   uses for sign-in today (the worker's `GOOGLE_CLIENT_ID`).
2. **Create credentials > OAuth client ID > Application type: Android.**
3. Name it `EBBLESS native debug`. Paste the package id and the SHA-1 the
   session printed. Create.
4. Nothing to copy back: the app keeps asking for an ID token with the **web**
   client id as `serverClientId`, and Google matches the Android client by
   package and SHA-1. Just tell the session "done".
5. If the consent screen is in **Testing** mode, add the test Google account
   (section 2.4) under OAuth consent screen > Test users.

Repeat later, once per new key or package: the release signing key for the
native sideload APK gets its own Android client (`EBBLESS native release`)
before the first release build is tested with sign-in.

---

## 3. How to run and record a test

1. Fresh install of the POC build. Note device, Android, WebView, build.
2. Clear the on-device log, start the test, follow the steps in section 4.
3. Pull the log (`adb pull`) and save it as
   `poc-results/<test>-<device>-<date>.log` (kept out of the web repo).
4. Fill one row in the results table:

| Test | Device | Android / WebView | Build | Result | Evidence | Notes |
|---|---|---|---|---|---|---|
| T1 | D2 Galaxy A54 | 14 / 129.0.x | poc-3 | PASS | `T1-D2-1015.log` | |

A test passes on a device only with a log that shows it. "Sounded fine" is a
note, not a result.

---

## 4. Phase 0.5 POC tests (G1)

POC scope as in audit section 12: `PlaybackService` + `EbblessPlayer`
(`SimpleBasePlayer`), one hidden WebView with two YouTube decks and one
SoundCloud deck, one ExoPlayer deck, hard-coded 6-item queue (3 YouTube, 1
`sc:`, 1 `au:`, 1 YouTube), 5 s crossfade, sign-in button.

T1 to T8 are the audit's tests, made measurable. T9 to T12 are gaps the audit
lists as unknowns or risks that its POC table did not cover.

### T1. Screen-off soak, 30 minutes (audit R1)

- Steps: unplugged, start the queue looping, press power, wait 30 min, wake.
- Measure: `EBB/tick` continuous, every `EBB/queue` advance present, no
  `EBB/life` renderer-gone or service-stopped.
- Pass: audio never stops; every transition happens; tick gaps under 35 s.
- Required on: D1, D2, D3. Run each device twice (once on battery saver off,
  once on).
- Fail action: try audit 5.5 mitigations (renderer priority, never pause
  timers, move timers to Kotlin), rerun. If it still fails on D1 or D2: **stop**,
  architecture no-go.

### T2. Swipe from recents while playing

- Steps: playing, open recents, swipe EBBLESS away, wait 10 min, use
  notification next/previous/pause/play.
- Pass: playback continues, notification stays, all four controls work.
- Required on: D1, D2, D3.

### T3. Standby deck preload and gapless swap

- Steps: let the YouTube to YouTube transitions run with crossfade off, then on.
- Measure: `EBB/queue` gap ms; `EBB/xfade` volumes.
- Pass: gap under 300 ms with crossfade off; with crossfade on, both songs
  audible across the overlap, no silent hole, no volume jump.
- Required on: D1, D4 (slow WebView).

### T4. Audio focus: other apps

- Steps: while playing, (a) start YouTube Music or Spotify, (b) trigger a
  Google Maps voice prompt, (c) set a 1-minute alarm, (d) play a voice note
  in WhatsApp.
- Pass: (a) EBBLESS pauses and stays paused; (b) ducks then returns to full
  volume; (c) and (d) pause and resume, or duck, matching Android norms.
- Note: this answers the audit's open question of whether WebView media
  handles focus on its own. Log `EBB/focus` with our controller disabled first,
  then enabled.

### T5. Show and hide the YouTube video card

- Steps: show the active YouTube deck at 200x200 dp or larger, hide it, repeat
  10 times, including during a crossfade.
- Pass: no iframe reload (no new `load` in `EBB/deck`), no audio glitch.

### T6. Phone call interruption

- Steps: incoming call from the second phone, answer, talk 30 s, hang up.
  Repeat with a declined call and with an outgoing call.
- Pass: pauses on ring, does not play during the call, resumes (or stays
  paused, matching the chosen rule) after.

### T7. SoundCloud after YouTube, no tap

- Steps: let the queue reach the `sc:` item with the screen off.
- Pass: SC plays without any touch. This is the web limitation the audit
  expects native to remove.

### T8. Ad guard, log only, 50 loads

- Content: the ad test playlist.
- Steps: play 50 tracks; ad guard logs but never mutes. Run the same 50 on the
  web app with `ebblessAdLog` for comparison.
- Pass: ad periods detected on Android match the web within a small margin
  (target: same verdict on 45 of 50). Wrong verdicts are listed per track.
- Note: muting is **not** enabled in the POC regardless of result. Whether it
  ships is owner decision 2 (audit 11.2).

### T9. Doze and app standby

- Steps (unplugged, screen off, playing):
  `adb shell dumpsys deviceidle force-idle`, wait 10 min; then
  `adb shell dumpsys deviceidle unforce`. Repeat after pausing for 15 min,
  then pressing play on the headset.
- Pass: playback unaffected while playing; resume from a headset press works
  after a long pause.

### T10. Process death, memory pressure, network

- (a) `adb shell am send-trim-memory io.github.malgriot.ebbless RUNNING_CRITICAL`
  while playing: playback continues or the WebView renderer recovers by itself.
- (b) Kill the process while paused (`adb shell am kill` after backgrounding):
  reopening restores queue and position.
- (c) Airplane mode for 20 s mid-track, then off: playback resumes or skips
  cleanly, no stuck "playing" with no sound.
- (d) Switch Wi-Fi to mobile data mid-track: no stop.
- (e) Open 10 heavy apps on D4 while playing: note if and when the service dies.

### T11. Sign-in against staging

- Steps: debug key, Credential Manager sign-in, `POST /auth/session`,
  `POST /profile/fetch`.
- Pass: worker accepts the token unchanged (`aud` is the web client id), an
  `ebs1.` token comes back, the profile loads. Token never appears in logs.

### T12. Bluetooth and headset

- Steps: BT headset next/previous/play/pause; car head unit shows title and art
  if available; unplug wired headphones while playing; turn the BT headset off
  while playing.
- Pass: all buttons work with the screen off; unplug and BT disconnect pause
  (never blast through the phone speaker).

### Also capture during the POC (not pass/fail, but needed for G1)

- **Battery:** `adb shell dumpsys batterystats --reset`, 60 min screen-off
  playback, then `adb shell dumpsys batterystats`. Compare with the same hour
  on the current TWA. Target: no worse than the TWA.
- **Memory:** `adb shell dumpsys meminfo io.github.malgriot.ebbless` at 0, 15
  and 30 min. A steady climb means a leak in the deck page.
- **Embed errors:** count YouTube `onError` 150/152 on the test playlist
  against the web app. More errors on Android than on web is a red flag for
  audit R3.

### G1 decision rule

- **Go:** T1 and T2 pass on D1, D2 and D3; T3 to T12 pass on at least D1;
  battery no worse than the TWA.
- **Go with conditions:** T1 or T2 fails only on D3, D4 or D5 and passes after the
  user exempts EBBLESS from battery optimization. Then onboarding needs a
  per-OEM "keep playing in background" step, and the owner decides if that is
  acceptable against the least-clicks rule.
- **No-go:** T1 or T2 fails on D1 or D2 after the audit 5.5 mitigations.
  Revisit the architecture before any Phase 1 work.

Deliverable: the results table, the logs, a one-page summary with the
decision, and the owner's distribution choice.

---

## 5. Automated tests from Phase 1 on

Built alongside the code, run in GitHub Actions on every push (pattern exists
in `.github/workflows/android.yml`).

| Layer | What | Notes |
|---|---|---|
| Unit (JVM) | Link parsers against shared `links.json`; art URL rewriting; queue engine (span, shuffle, repeat one/all, custom order); Discover scoring; ad heuristic state machine fed fake deck events; ON AIR live-position math | Fast, no device |
| Shared vectors | `profile-merge-vectors.json` run by worker tests **and** Kotlin tests | Stops the three `mergeProfiles` copies drifting (audit R5). Adding the file to the web repo is a separate approved change |
| Contract | Worker client against staging for every route the app calls; fail on response shape change | Nightly, not per push, to spare KV and rate limits |
| Storage | Room migrations, DataStore keys use web `localStorage` key names | |
| Instrumented (emulator) | Media3: a `MediaController` connects, sees the queue, sends play/pause/next; ExoDeck podcast plays | Emulators are fine for session logic, not for audio truth |
| UI | Compose screenshot tests for library, player, queue, settings | Catches visual regressions per phase |

Real-device runs (section 4 style) repeat for every release candidate: T1,
T2, T4, T10, T12 as a short **smoke soak** (10 min instead of 30).

---

## 6. Phase acceptance tests

Taken from the audit's per-phase "Accept" lines, written as runnable checks.

**Phase 1 (G2)**
- Paste and share-sheet import for each source: Spotify playlist/album/track,
  YouTube video/playlist, SoundCloud track/set, Apple Music album/playlist,
  Spotify/Apple/RSS podcast. Each resolves, saves, plays.
- 30 min screen-off playback through a mixed queue with lock-screen controls.
- Force-stop mid-song, reopen: queue and position restored.

**Phase 2 (G3)**
- Add, rename, delete, reorder on web: appears on Android within one sync.
  Same in reverse.
- Delete on one side while the other is offline: the delete wins after both
  sync (no resurrection).
- Change a synced setting on both sides offline: last write wins, no ping-pong
  over 3 sync cycles.
- Handoff: start on web, continue on Android at the same song and position,
  and back.
- Beta gate: new tester claims access via Google, or pastes the invite link.
- Analytics: counts only reach `/beta/activity`; no names, IP or device info.

**Phase 3 to 5 (G4)**
- A parity checklist generated from audit section 2 (every row marked R, AD
  or RB). Each row: done, deferred by the owner (with date), or dropped per the
  audit.
- Least-clicks review: for each core flow (import, play, like, add songs,
  vibe search), count taps on web vs Android. Android may not need more taps.
- Wording check: "songs" everywhere, copy matches `brand/BRAND.md`.
- Visual modes: side-by-side on one phone vs the web; 60 fps on the mid device;
  no animation running offscreen (the GPU budget rules, profiled with the
  Android Studio profiler).

**Phase 6 (G5)**
- Sideload install from a clean phone: tap the link on the beta page in
  Chrome, download, allow "Install unknown apps" for Chrome, install. Count
  the taps and screens; note any Play Protect warning ("unrecognized app",
  "scan app") and whether it blocks or only warns. Run on D1, D2, D3, D4.
- Update over an older native build (same signing key, higher versionCode):
  installs in place, library and sign-in kept.
- TWA to native move (section 7, step 4): with both installed, a tester
  signed in on the TWA signs in on native and gets the same library through
  sync. A tester never signed in sees the migration notice before they
  uninstall the TWA.
- In-app "new version available" prompt (sideload has no store updates): the
  app notices a newer release and opens the download in one tap.
- Release build on staging off, production on; no debug menu.

---

## 7. Tester rollout

1. **POC:** owner and 1 to 2 trusted Android testers, sideloaded, logs sent
   back. No public link.
2. **Phase 1 to 2:** native sideload APK on its own GitHub release (not the
   TWA's `android` release), 5 to 10 testers chosen to cover D2 to D5. They
   keep the TWA installed alongside it (separate package id).
3. **Phase 3 on:** wider beta through the native sideload release, linked
   from the beta page next to the TWA link.
4. **Replacing the TWA (after G4):** the beta page switches its Android link
   to the native APK and tells testers to sign in on the TWA first so their
   library syncs, then uninstall it. The TWA release stays up until the
   owner retires it.
   Feedback through the existing tester form (`/tester-report`), plus a
   "send logs" button in the debug menu that attaches the `EBB/*` log.

Every tester build carries a visible build number so reports can be matched
to a version.

---

## 8. Owner decisions that change this plan

| Decision (audit 11.2) | Effect on testing |
|---|---|
| 1. Distribution | Decided: sideload only. No Play-compliance tests |
| 2. Ad muting in native | If yes, T8 becomes a muting test on the ad playlist, re-run on every ad-guard change |
| 3. Same package as the TWA | Planned: no, native uses `io.github.malgriot.ebbless.native` so both install side by side (section 1). Change only if the owner wants native to upgrade the TWA in place |
| 5. Minimum Android version | Sets the oldest device in the matrix |
| 7. Parity before replacing the TWA | Sets whether G4 must pass before testers move off the TWA |

---

## 9. Immediate next steps

0. **Install `adb`** before anything else (section 2.2):
   `brew install --cask android-platform-tools`, check with `adb version`.
   Turn on USB debugging on the TECNO POP 9, confirm it shows in
   `adb devices`, and record its exact model and WebView version
   (`adb shell getprop ro.product.model`, `adb shell dumpsys webviewupdate`).
1. Install Android Studio (needed to build the POC).
2. Fill D1 to D3 from the owner's and testers' phones; confirm the POP 9 row
   in the beta testers Sheet.
3. Build the POC (package `io.github.malgriot.ebbless.native.debug`) with the
   section 2.5 logging from day one.
4. **Prompt the owner to register the Android OAuth client (section 2.6)** as
   soon as the debug build exists. Keep building while waiting; only T11
   needs it.
5. Run T1 on D1 first, then on the POP 9. It is the cheapest test that can
   kill the whole plan.
