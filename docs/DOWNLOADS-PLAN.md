# Offline queue and Keep on device: build plan (deeeep and horizonnn)

Status: plan only, nothing built. Written 2026-11-11 from a read of the current code.

## Context

The owner decided that the two top plans get on-device copies of songs:

- **deeeep** (`deep`, $7): a rolling offline queue. The next N songs of the queue sit
  on the device so playback keeps going through short offline stretches.
- **horizonnn** (`horizon`, $15): everything in deeeep, plus a video layer, each song's
  song/artist/album info kept with it, and a storage threshold the listener sets.
- Android (sideload) and desktop (Mac, Windows) only. No iOS, no server-side path.

Four risk rules were accepted and are binding for every phase (section 1 shows where each
is enforced). The owner has heard the terms-of-service risk and chose to proceed with these
mitigations; this plan does not reopen that, but section 10 states the residual risk plainly.

## 0. What already exists (reused, not rebuilt)

| Piece | Where | Reuse |
|---|---|---|
| Checksum-verified yt-dlp self-update (github.com/yt-dlp release URLs only, SHA2-256SUMS, atomic swap, daily check, forced refresh after a failure, 6 h floor) | `desktop/ytdlp-update.js`, `desktop/fetch-ytdlp.js` (ships a copy in the installer) | As is. The download module calls `upd.ensure()`; no second updater. |
| yt-dlp runner: finds the binary, lowest CPU priority, byte cap, timeout, two at a time, urgent first | `desktop/wave.js` | Copy the pattern into a new module; do not extend `wave.js` (rule 3 and the deletion test). |
| Sandboxed window, `contextIsolation`, `fromMain(e)` sender check on every IPC | `desktop/main.js`, `desktop/preload.js` | New IPC handlers use the same `fromMain` gate. |
| NewPipe Extractor v0.26.5 pinned, Downloader implementation, background thread | `android-webview/app/build.gradle`, `WavePeaks.java` | Same dependency; new class for downloads. **Never compiled or run on a phone yet** (IMPROVEMENTS.md #727). |
| JS bridge `EbbNative`, `shouldInterceptRequest` hook | `MainActivity.java:516`, `:701` | New bridge methods and one intercepted path. |
| Android self-updater (GitHub release tag `android`) | `Updater.java` | How a NewPipe bump reaches phones. |
| `<audio>` deck with a YT.Player-shaped surface | `createAudioDeckPlayer` in `index.html:29561`, dispatched at `index.html:28927` | Downloaded songs play here. No new deck type. |
| Tier: `TIER_RANK`, `hasTier(min)`, `PLAN_NAMES`, `state.tier` from `POST /entitlement` | `index.html:8131-8191`, `worker/src/patreon.js` (`ent:<sub>`) | UI gating; the native side gets its own signed check (section 5). |
| Remote flag route | `worker/src/index.js:5191` (`/flags`, returns `{adblock}`), read by `desktop/adblock.js` | Add a `downloads` field. Route name and existing field unchanged. |
| Lowest-priority, after-sound-starts scheduling | `waveWant` in `index.html:39343` | Same timing rule for downloads: never compete with a song starting. |

## 1. The four rules, and where each is enforced

**Rule 1: on the device, on its connection, into its storage. Servers never touch media.**
- Desktop: the yt-dlp child process in the Electron main process fetches from YouTube
  directly; bytes go into `userData/offline/`. Android: NewPipe plus `HttpURLConnection` in
  the app process; bytes go into `getFilesDir()/offline/` (app-private, not shared storage).
- The worker gains exactly one route, `POST /dl/grant` (section 5). It reads `ent:<sub>`
  and signs a small grant. It never receives a video id, a URL, or a byte of media. Code
  review check: no worker file references the offline module, `/podaudio`-style proxying is
  not reused, and the route's test asserts the response is only `{grant}`.
- `/waves` already shares derived peaks (64 numbers, not audio). Unchanged and not used for
  downloads.

**Rule 2: no sharing, no export, no cross-user cache; playable only in EBBLESS; encrypted at rest.**
- Each file is written encrypted as it streams in. Plaintext never touches disk (desktop
  pipes yt-dlp `-o -` stdout into the encryptor; Android encrypts in the download loop).
- Format: 64 KiB chunks, each AES-256-GCM with its own nonce (file id + chunk index), so the
  player can seek without decrypting the whole file and any tampered chunk fails.
- Key handling:
  - Desktop: one random 32-byte master key, wrapped with Electron `safeStorage`
    (macOS Keychain, Windows DPAPI) and stored as `userData/offline/key.bin`. Unwrapped only
    in the main process memory; never sent over IPC, never logged.
  - Android: an AES-256 key generated in the Android Keystore (`KeyGenParameterSpec`,
    non-exportable, hardware-backed where the phone has it). Files encrypted with
    per-file keys wrapped by that Keystore key, or directly by it.
  - Per device, per install. A copy of the folder on another machine cannot be read.
- Playback serves decrypted bytes only to the app's own page: desktop through a privileged
  custom scheme `ebbless-dl://` registered by the main process with a per-launch random path
  token handed to the page by IPC; Android through `shouldInterceptRequest` on a reserved
  same-origin path (`/__dl/<id>`), which only this WebView sees. Both answer HTTP Range
  requests so seeking works.
- No UI anywhere to export, share, reveal in Finder, or open in another app. Files have no
  media extension (`.ebd`). Not synced in the cloud profile (the "kept on this device" list
  stays local, like play history).
- **Mac Keychain prompts (fixed in phase 1):** the app is ad-hoc signed today
  (`desktop/adhoc-sign.js`, `codesign -s -`). Keychain ties an item's access to the
  app's signature, and an ad-hoc signature changes with every build, so each update would
  ask "EBBLESS wants to use your confidential information" again. Fix, free: sign every
  build with one long-lived self-signed code-signing certificate instead of `-`. The
  signature then names a fixed certificate, so the Keychain grant survives updates.
  Gatekeeper treats the app the same as now (unidentified developer, same first-open
  steps). The certificate's private key stays off git, in the owner's login Keychain, and
  `adhoc-sign.js` reads the identity name from an env var; losing it means one more prompt
  for everyone, so back it up. One prompt happens once, on the update that switches from
  ad-hoc to the certificate. A paid Apple Developer ID ($99/year) does the same and also
  removes the Gatekeeper warning; not needed for this. Verify on a real update, phase 1.
- **Windows Explorer:** the listener can see the folder
  (`%APPDATA%\EBBLESS\offline\`) and its `.ebd` files, since it is their own profile;
  no app can hide files from their owner. What they find is unreadable: no media extension,
  no thumbnail, nothing plays on double-click, and a copy on another PC or sent to someone
  is noise. The folder gets the hidden attribute so casual browsing and Windows Search
  skip it. The weak spot is narrower: a program written for the purpose, run as that user,
  could ask DPAPI for the key and decrypt using knowledge of the format. To raise that bar,
  the stored key is DPAPI-wrapped and then also mixed with a value built into the app, so
  DPAPI alone is not enough (obfuscation, not a guarantee). Same idea on Mac.
- **Cannot be fully met:** encryption on a device the user controls is a strong deterrent,
  not DRM. A rooted phone, a debugger on the Electron main process, a purpose-built tool,
  or recording the sound card can still get the audio. Say "stored encrypted and playable
  only in EBBLESS", never "cannot be copied".

**Rule 3: the download path is separate from the YouTube embed playback.**
- Separate modules: desktop `desktop/offline.js` (+ `offline-crypto.js`, `offline-store.js`),
  Android `OfflineStore.java`, `OfflineFetch.java`, `OfflineCrypto.java`, and in `index.html`
  one self-contained `/* ---------- OFFLINE ---------- */` block. The YouTube IFrame code
  never calls into it.
- One touch point only: the deck dispatcher at `index.html:28927` asks
  `offlineSrc(videoId)` inside a try/catch. Any throw, kill switch, missing file or decrypt
  error returns null and the song loads through YouTube exactly as today. A downloaded file
  that errors mid-play falls back to the YouTube embed for the same song, not a skip.
- Separate kill switches: `/flags` field `downloads` (worker env `DOWNLOADS_FLAG`), a
  local `ebbless:offline:off`, and a Settings switch. None of them is read by the embed path,
  and the existing `adblock` flag is not touched.
- Separate failure handling: download errors go to the offline module's own state and
  back-off; they never toast during playback and never change `skipWaiting`, ad handling or
  deck state.
- Separate job queue from the waveform fetch (they share only the yt-dlp binary and its
  updater). When a song is fully kept, the waveform is computed from the local file and the
  network waveform fetch for it is skipped.
- **Cannot be fully met:** both paths use the same IP. If YouTube flags that IP for bot
  traffic because of downloads, the embed on that machine can also get "confirm you're not
  a bot". Mitigation: low, jittered rate caps and a hard stop on the first bot check
  (section 6). Also, offline cold start today depends on the YouTube API script loading
  (`loadIndex` waits on `YT.Player`, `index.html:35010`, and the audio deck uses
  `YT.PlayerState`); phase 1 adds a small constants shim so a kept song can start without it.

**Rule 4: sold and worded as the listening experience.**
- Words used: "offline queue", "keep on this device", "kept songs", "video layer",
  "song info", "storage limit". Words never used in UI, WHATS_NEW, Patreon, store text,
  terms, marketing: download, downloader, rip, save from YouTube, MP3, convert, extract.
  (The welcome-video toast and plan copy follow the same list.)
- Owner direction (2026-11-11): word it cryptically and in legal register. Applied in two
  tiers, because they do different jobs:
  - **Marketing, Patreon, UI, WHATS_NEW: oblique.** Outcome only, no mechanism, no
    source named. E.g. "Your next songs, held close.", "The music doesn't drop when the
    signal does.", "Kept with you: picture, credits, sound." Never says what is stored,
    where from, or how.
  - **Terms and privacy: formal legal register, but precise.** Defined terms ("Device
    Cache", "Cached Content", "Local Playback"), passive voice, no YouTube how-to. Precise
    on what the user agrees to: that they direct the caching, on their own device, for
    personal playback only, and accept the third-party terms. Reason not to make the terms
    vague: an ambiguous clause is read against the company that wrote it (contra
    proferentem), consumer law in India, the EU and the US can strike unclear or hidden
    terms as unfair, and a clause that looks written to conceal reads as knowledge of the
    problem. A precise clause is what actually puts the act and the responsibility on the
    user. Drafts in section 8; a lawyer finishes them.
- Copy that must change (section 8): `brand/BRAND.md` section 9 says "It streams; it
  doesn't download or convert files." That becomes untrue on these plans and must be
  reworded before release. `terms.html` and `privacy.html` need new paragraphs.
- Internal code names may say `offline`; avoid `download` in user-visible strings and in
  anything a listener can see (file names, Settings labels, toasts).

## 2. Architecture

```
index.html OFFLINE block                    native (desktop main / Android)
  window planner: which ids to keep   --->  offline.keep(ids, grant)      (IPC / EbbNative)
  offlineSrc(id) for the deck         <---  ebbless-dl://<tok>/<id>  or  /__dl/<id>
  state for the UI (kept, queued,     <---  offline.status() events
  paused, storage used)
                                            fetch: yt-dlp (desktop) / NewPipe (Android)
                                            encrypt -> offline/<id>.ebd + <id>.meta.ebd
                                            store index: offline/index.json (encrypted)
worker: POST /dl/grant (reads ent:<sub>, signs), GET /flags (+downloads)
```

The page decides *what* to keep (it knows the queue); native decides *whether* (grant,
flag, caps) and *how*. A forged call from devtools still needs a valid signed grant.

## 2b. Light until signup (owner, 2026-11-11)

Free and flowwww installs carry nothing for the offline queue beyond what they already
have. The offline pieces arrive only after a deeeep or horizonnn signup, the first time
the app holds a valid grant (section 5) and the listener turns the offline queue on.

| Piece | Free / flowwww install | After deeeep / horizonnn signup |
|---|---|---|
| Desktop yt-dlp | Already shipped and kept current, for the waveform bars only (owner kept it) | Same copy, also used for the offline queue |
| Android NewPipe | Already in the APK, for the waveform bars only (owner kept it) | Same library, also used for the offline queue |
| Android yt-dlp fallback (youtubedl-android, 25 to 40 MB) | Not present | Fetched as the offline pack |
| Deno, if yt-dlp needs it (about 40 MB) | Not present | Fetched (section 7) |
| Offline code (desktop `offline*.js`, Android `Offline*.java`, the page's OFFLINE block) | Ships dormant: a few tens of KB, never run, no folder, no key, no Settings row, no network call | Wakes up |
| `offline/` folder, encryption key | Not created | Created on first keep |

- The offline code itself ships dormant rather than being fetched, because it weighs
  almost nothing and fetching code adds a code-loading path (a bigger security surface)
  for no size saving. If the owner wants the code fetched too, the Android pack can carry
  it as a dex loaded with `DexClassLoader` (read-only file, Android 14 rule) and desktop
  as a pinned-hash JS bundle; noted, not planned.
- Offline pack fetch: built with each release and attached to the same GitHub release.
  Its SHA-256 is compiled into the app, so a phone or computer accepts only the exact pack
  built for that version, over HTTPS from the project's own release (SECURITY-REVIEW.md
  self-update rule). Background, Wi-Fi only on Android, into `getFilesDir()` /
  `userData`. Until it lands, Settings shows "Getting ready" and streaming is unaffected.
  Deleted together with the kept files when a plan lapses (14 days, section 3), so a
  lapsed account goes back to light.
- Idempotent: an interrupted fetch resumes or restarts; a pack already present with the
  right hash is never fetched again.

## 3. Storage layout and eviction

```
<data>/offline/
  key.bin                 desktop only: safeStorage-wrapped master key
  index.json.ebd          encrypted index: id -> {kind, bytes, addedAt, lastPlayed, plays, pinned, fmt}
  a/<id>.ebd              audio, chunked AES-GCM
  v/<id>.ebd              video layer (horizon)
  m/<id>.ebd              song info + art bytes (horizon)
  tmp/                    in-progress files; deleted on start-up (idempotent resume)
```
- `<data>` is `app.getPath('userData')` on desktop, `getFilesDir()` on Android (not
  `getCacheDir()`, which the OS can clear mid-stretch).
- Writes go to `tmp/` and are renamed into place when complete; the index is updated after
  the rename. A crash leaves at most a stray tmp file. Keeping the same id twice is a no-op.
- **deeeep window (decided 2026-11-11):** the next songs in queue order (shuffle
  respected) until either 10 songs or 60 MB is reached, whichever comes first, plus the
  current song and the previous 2 (instant back). About 4 MB per 4-minute song, so 60 MB is
  10 songs with room for a few long ones.
  - Song-length threshold: a song longer than 12 minutes is never kept (DJ mixes,
    hour-long albums-as-one-video, live streams). It still streams online; the window
    skips past it and keeps counting the songs after it. Checked before any byte is
    fetched: duration from the queue entry, then yt-dlp `--match-filter "duration<=720"`
    on desktop and `StreamExtractor.getLength()` on Android.
  - Per-song hard stop at 15 MB in case the duration was wrong.
  - Anything outside the window is deleted once it is not playing. No pinning.
- **horizonnn eviction:** the rolling window as above, plus songs the listener chose to
  keep (pinned). When over the storage limit, delete unpinned outside-window songs first,
  then pinned ones by lowest score: oldest `lastPlayed` first, ties broken by fewest plays.
  Never delete the current song or the window. Video layers go before their audio.
- **Storage limit (decided 2026-11-11): a GB slider, default 2 GB.** GB, not song count,
  because video makes song sizes differ by 20x. Slider in Settings from 0.5 to 50 GB in
  0.5 GB steps; its top end is clamped to half the free space the OS reports, so it can
  never be set past what the device has. Under it, a live "about N songs" hint from the
  average kept size (audio only and with the video layer shown separately once video
  exists). Lowering the slider evicts at once by the rules above. A plain range input
  styled with the existing tokens; no animation beyond the thumb.
- Plan lapse: when the grant expires (section 5) files stay but will not play; after
  14 more days without a valid grant they are deleted. Signing out deletes them.

## 4. Playback with the least code change

- Queue entries keep their YouTube `videoId`, so lyrics, art, likes, sharing, matching,
  reports and the recap stay exactly as they are.
- `index.html:28927`: before the YouTube branch, `const src = offlineSrc(videoId)`; if
  set, `createAudioDeckPlayer(deck, videoId, src)`. `createAudioDeckPlayer` gets an
  optional third argument used as `el.src`; its `onerror` for that case calls the YouTube
  path for the same song instead of `playNext`.
- Decided 2026-11-11: a kept copy always plays in place of the stream when it is
  complete. One code path, no mid-song switch when the network drops.
- Offline and the next song is not kept: play the kept song that best fits the vibe,
  not just the next one in line. Candidates are all kept songs not played in the last
  hour (the window, plus horizonnn's pinned songs), ranked with the existing Discover
  scorer `scoreCandidate(seedVec, candidate, ...)` (`index.html:25357`) seeded from the
  current song, so the mood carries on. If nothing kept scores as a fit, fall back to the
  next kept song in queue order. One quiet line: "Offline. Staying with what's kept close."
  When the network is back, the queue resumes where it was. Needs `isOfflineNow()`
  (`navigator.onLine` plus the last failed fetch), added in phase 1.
  (Owner confirmed this reading of "if they fit the vibe": kept copies always win
  over the stream, and the vibe rule picks which kept song fills an offline gap.)
- Ad handling, crossfade and the waveform: the audio deck already has no ad gate; crossfade
  works between deck types today (podcasts, Audius), to be confirmed in phase 1.

## 5. Tier gating: local, and checked against `ent:<sub>`

- UI: offline features show only when `hasTier('deep')` / `hasTier('horizon')`.
- Native check (the real gate): new route `POST /dl/grant`, signed-in only (same identity
  check as `/entitlement`, `sub` from the verified token, never the body). It reads
  `ent:<sub>`, and for `deep` or `horizon` returns `{grant}`: a payload
  `{sub, tier, iat, exp}` (exp = 7 days) signed with ECDSA P-256 (WebCrypto in the worker;
  `crypto.verify` in Node; `SHA256withECDSA` on Android down to API 24; Ed25519 is not
  available on Android before API 33). Private key in a worker secret; public key compiled
  into the desktop and Android apps.
- Grant refresh (decided 2026-11-11): the page asks for a fresh grant at launch, every
  24 h while open, on plan change, and every time the network comes back (`online`
  event in the page; Android also listens with `ConnectivityManager.NetworkCallback` so
  it works while the WebView is in the background). A refresh is skipped if the last one
  was under 1 h ago, so a flapping connection costs at most one call an hour. The 7 days
  therefore count from the last time the device was online, and a lapsed plan is noticed
  the first time the device reconnects. The page passes the grant to native with every
  `keep` call. Native verifies the signature, `exp`, and tier before any fetch, and the tier
  again before Horizon-only work (video, metadata, pins, a limit above deeeep's ceiling).
- Offline grace: a valid unexpired grant lets kept songs play with no network for up to
  7 days. Expired: they stop playing (not deleted yet, see section 3).
- Cost: one KV read and one signature per device per day. Per-IP throttle (existing
  `overIpLimit`) at 30 per hour. Idempotent: same input, a fresh grant, no writes.
- New route, so the public route contract is untouched; add it to `worker/test/routes.test.mjs`
  and to the 404 route list.

## 6. Failures, rate limits and what the listener sees

- **Pace:** one download at a time per device, lowest priority (`os.setPriority 19` /
  `THREAD_PRIORITY_BACKGROUND`), only after the current song is playing (same rule as
  `waveWant`), 5 to 20 s random gap between songs, at most 40 songs per hour (deeeep) and
  60 per hour (horizonnn, video counts as a song). Wi-Fi only by default on Android
  (`ConnectivityManager` unmetered), switchable.
- **Classify every failure** (desktop reads yt-dlp stderr, which `wave.js` ignores today;
  Android maps NewPipe exceptions):
  - HTTP 403 / extractor error: force extractor refresh (`upd.ensure(..., {force:true})`,
    already floored at 6 h), retry that song once, then back off.
  - Bot check ("confirm you're not a bot", `ReCaptchaException`) or HTTP 429: stop all
    downloads for 6 h, then 12 h, then 24 h. Never retry inside the window.
  - Song unavailable, age-gated, members-only, live: mark that id unkeepable for 7 days.
  - Disk full / write error: stop, keep what is complete.
  - Network down: wait for connectivity; no counting against back-off.
- **Back-off:** exponential 1, 2, 4 ... 60 min per song, three strikes and that song is
  skipped for the session; global pause rules above. All state is local.
- **States in the UI (quiet, never a toast during playback):** a small mark on queue rows
  (kept / keeping / not kept), and in Settings "Offline queue: 8 of 10 songs ready",
  "Paused for a few hours, YouTube is busy. Kept songs still play.", "Waiting for Wi-Fi",
  "Storage limit reached". No error codes shown.

## 7. Extractor per platform and how it stays current

- **Desktop:** yt-dlp, already bundled and self-updated with checksum checks. Downloads
  use `-f 251/bestaudio[acodec=opus]/bestaudio` (opus about 130 kbps) to stdout.
  **Unverified and important:** recent yt-dlp releases need an external JavaScript runtime
  (Deno) for some YouTube formats. The waveform fetch worked on this Mac with 2026.10.26,
  but that may be the low-bitrate format or a Deno/Node already installed. Phase 1 must
  test format 251 on a clean Mac and a clean Windows machine.
- **Deno, only if needed (decided 2026-11-11): fetched on plan activation, not in the
  installer.** The installer stays the same size. The first time the app sees a valid
  deeeep or horizonnn grant (section 5) and the listener turns the offline queue on, it
  fetches Deno in the background with the same flow as `ytdlp-update.js`: only
  github.com/denoland/deno release URLs, SHA-256 checked against the release's own
  checksums, atomic swap, daily update check. About 40 MB, once. Until it lands, the
  offline queue shows "Getting ready" and streaming is unaffected. It is deleted together
  with the kept files when a plan lapses (14 days, section 3). Free and flowwww installs
  never fetch it.
- **Android: NewPipe first, yt-dlp as fallback (decided 2026-11-11).** NewPipe Extractor
  is the primary: already a dependency, pure Java, fast, small. When it fails with an
  extractor error (not a bot check, not a network error) for two songs in a row, that
  song and the following ones go to yt-dlp through youtubedl-android (embedded Python),
  which updates its own yt-dlp at runtime with no new APK. That pairing is the most
  reliable option: NewPipe covers the normal case quickly, yt-dlp usually has a fix for a
  YouTube change days before a NewPipe release can reach phones as an APK. Every hour
  the app tries NewPipe again and switches back when it works.
  - Never in the APK (owner, 2026-11-11). It is fetched only after deeeep or horizonnn
    signup, as the "offline pack" (section 2b). About 25 to 40 MB (estimate, unverified),
    built for arm64-v8a and armeabi-v7a only (covers the TECNO POP 9 and nearly all
    phones).
  - Real blocker, checked first in phase 2: apps targeting Android 10+ (this one targets
    35) may not `exec()` files in their own writable folders, only load them as
    libraries. If youtubedl-android runs Python as a program, a fetched copy cannot run.
    Then the fallback needs a library-loading route (custom work), and until that exists
    deeeep and horizonnn on Android run on NewPipe alone. It does not go back into the
    APK. Unverified.
  - The fallback also may need a JavaScript runtime for some formats; check in phase 2.
  - Bot checks and 429s pause both extractors together (same IP), never fail over.
- **NewPipe details.** Already a dependency, pure Java, small
  (a few MB with its deps), gives audio, video-only streams and metadata. Downside: it is a
  library, so YouTube breakage needs a new APK. That ships through the existing
  self-updater; NewPipe usually fixes breakage within days, and EBBLESS releases must
  follow (watch the NewPipe Extractor releases page; bump the pinned version, build,
  release). The wave code using it has never been compiled, so phase 2 starts by getting
  `WavePeaks.java` building on a real JDK.

## 8. Copy and legal pages (rule 4)

Owner and a lawyer review before release; these are the edits to draft, not final text.

- `brand/BRAND.md` section 9: replace "It streams; it doesn't download or convert files"
  with a rule that fits: EBBLESS streams; on deeeep and horizonnn it can keep an encrypted
  offline queue on the listener's own device, playable only in EBBLESS. Still never call it
  a downloader or converter. Add the word list from rule 4.
- `terms.html`: a new section in legal register. Starting draft for the lawyer:

  > **Device Cache.** Certain plans permit the Software, at the User's direction and
  > on the User's own device and network connection, to retain portions of content the
  > User has elected to play ("Cached Content") in an encrypted local store (the "Device
  > Cache") solely to enable continuity of Local Playback. Cached Content is never
  > transmitted to, stored on, or made available by EBBLESS or its servers. The User
  > acknowledges that the User, and not EBBLESS, initiates and controls the retention of
  > Cached Content; that Cached Content is licensed for the User's personal,
  > non-commercial Local Playback within the Software only; and that the User shall not
  > copy, decrypt, extract, transfer, share or otherwise make Cached Content available
  > outside the Software. The User remains bound by the terms of each third-party
  > service from which content originates, including YouTube's Terms of Service, and
  > is solely responsible for compliance with them. Cached Content is removed upon
  > expiry of the applicable plan, sign-out, or uninstallation. The User shall
  > indemnify EBBLESS against claims arising from the User's breach of this section.

  The existing line 53 stays. Keep the "Legal review needed" flag style used on line 54.
- `privacy.html` section 2 (on your device): kept songs, video layers, song info, the
  encryption key in the OS key store, and that none of it is sent to EBBLESS. Section 4:
  `/dl/grant` reads your plan and stores nothing new. Update `docs/PRIVACY-AUDIT.md` in the
  same commit (SECURITY-REVIEW.md rule).
- Patreon tier text, welcome videos, WHATS_NEW: oblique outcome lines only. deeeep:
  "Your next songs, held close. The music doesn't drop when the signal does." horizonnn:
  "Everything deeeep holds, plus picture, credits and the room to keep more. You set how
  much." Never "download anything from YouTube", never name a source.
- `welcome/` and `beta/index.html` currently say nothing about this; no change unless the
  owner wants the plans listed there.

## 9. Horizon: video layer and song info

- **Video layer, no muxing:** keep a video-only stream as its own file and play it muted in
  a `<video>` beside the audio deck, synced to the audio clock (correct `currentTime` when
  drift passes 150 ms; `playbackRate` nudges in between). Avoids bundling ffmpeg on desktop
  (about 70 to 80 MB) and `MediaMuxer` container rules on Android.
- Formats: desktop `bestvideo[height<=720][vcodec^=vp9]/bestvideo[height<=720]`; Android
  NewPipe video-only stream at the chosen height, VP9/WebM or H.264/MP4 as the WebView
  reports it can play. Default 480p, choices 360 / 480 / 720 / 1080.
- Size per 4-minute song (estimates from typical YouTube bitrates, not measured here):
  audio opus about 4 MB; video 360p about 8 to 10 MB, 480p about 15 MB, 720p about 30 to
  45 MB, 1080p about 60 to 80 MB. So 2 GB is about 500 songs audio only, about 100 at 480p.
- **Song info:** title, artist, album, duration from the queue entry the app already has
  (Spotify/Apple imports carry them), plus the extractor's own (uploader, upload date,
  duration, thumbnail), plus art bytes from the existing `artworkUrls()` source, plus
  `/artistinfo` and `/lyrics` text if the listener has them on. Stored encrypted as
  `m/<id>.ebd` so the player, lyrics and art show offline.
- GPU budget (CLAUDE.md #487): the video layer is a full-screen-ish video, so in the same
  commit it pauses when hidden, when covered (`#flow-layer`, light show, any full-screen
  view), when the tab is hidden, and is `display:none` when off. No `backdrop-filter` over
  it, no filter or blur in keyframes, `will-change` only while it is the active layer.
  Check the `[gpu-watchdog]` console on localhost.

## 10. Residual risk, stated plainly

- Fetching YouTube media outside the embed and keeping it, in a paid plan, is outside
  YouTube's Terms of Service whatever the wording. The four rules lower exposure (no
  hosting, no distribution, no copies leaving the device) and keep the main app alive if
  this part is shut down; they do not make it permitted. Possible outcomes range from
  YouTube blocking the extractor (likely, recurring) to a takedown or legal letter to
  EBBLESS (possible) to account or API key action against the YouTube Data API key the
  worker uses for search (possible, and that would hurt the core app).
- Encryption is a deterrent, not DRM (rule 2 note).
- Same-IP coupling between downloads and embed playback (rule 3 note).
- Wording does not change what the feature is. Oblique marketing is fine; the terms stay
  precise (rule 4 note).

**Would a VPN help? (owner question, 2026-11-11)**
- For YouTube blocking: no, usually worse. VPN and datacenter IPs are shared by many
  people and get "confirm you're not a bot" far more often than home connections. Each
  listener's own home or mobile IP is the best-placed address there is.
- For liability: no. Routing doesn't change who built and sold the feature. An
  EBBLESS-run VPN or proxy would make it worse: EBBLESS infrastructure would carry the
  media, which breaks rule 1. A listener's own VPN is their business; the app neither
  bundles nor recommends one.
- What does put the act on the user (not legal advice; the lawyer decides):
  1. **Their device, their connection, their storage.** Already the design (rule 1).
  2. **They switch it on (decided).** The offline queue is off until the listener turns it on in
     Settings, with one plain line they accept once. Today deeeep's rolling queue would
     otherwise start on its own, which reads as EBBLESS doing it. horizonnn's "keep" is
     already a choice per song.
  3. **Terms that say so:** user initiates, personal use, third-party terms are theirs,
     no extraction, indemnity (section 8 draft).
  4. **No knowledge kept:** the server never learns what is kept (no logs, no counts of
     ids, beta counts send plays only). Nothing on the server ties EBBLESS to a file.
  5. **Fast off switch:** the remote `downloads` flag stops new keeps everywhere within
     about a minute, so a takedown request can be honoured at once.
  6. **A company between the owner and the product:** if EBBLESS is run personally, a
     limited company (an Indian private limited company or an LLC) separates personal
     assets from the product's liabilities. The biggest single step, and outside code.
- None of these make it permitted under YouTube's terms. They shrink EBBLESS's role to
  supplying software that the user directs.

## 11. Owner decisions

Decided 2026-11-11: window is 10 songs or 60 MB with a 12-minute song limit (section 3);
kept copies always play, and offline gaps are filled by kept songs that fit the vibe
(section 4); Mac signing moves to a stable self-signed certificate (rule 2); marketing
oblique, terms in legal register (rule 4, section 8); the section 4 reading of "fit the
vibe" is confirmed; the offline queue is off until the listener turns it on in Settings
(section 10); the rest of the plan as written is confirmed.

Also decided 2026-11-11:
- horizonnn storage limit: a GB slider, default 2 GB (section 3).
- Android extractor: NewPipe first, yt-dlp (youtubedl-android) as automatic fallback
  (section 7), fetched only after signup.
- Light until signup: free and flowwww installs carry no offline extras; the yt-dlp
  fallback, Deno and the offline folder arrive with a deeeep or horizonnn signup. yt-dlp
  on desktop and NewPipe on Android stay in every install for the waveform bars (section 2b).
- Android: Wi-Fi only by default, switchable in Settings (section 6).
- Grace: 7 days offline play, 14 days before deletion, and the grant refreshes at
  launch, daily, and on every reconnect (section 5).
- Deno, if yt-dlp needs it: fetched on plan activation, not in the installer (section 7).
- Kept songs stay out of the beta usage counts: plays are counted as now, which songs
  are kept is never sent.
- Lawyer: has said the approach is doable. The final terms and privacy text still go to
  him for sign-off before the first public release that turns this on.

No open decisions remain. Questions that only a build can answer (Deno needed or not,
real file sizes, Keychain behaviour after an update, APK size with the fallback) are
listed as verification steps in the phases.

## 12. Phases (smallest first)

Each phase runs in its own lane (`scripts/session.sh start <slug> "<scope>"`), merged to
`main` as soon as it is done. Other active lanes right now include `ui-batch`, `flux-flow`
and `platform-release` (the last one touches `desktop/` and the yt-dlp release), so
phase 1 waits for or coordinates with `platform-release`.

### Phase 0: grant and kill switch (worker only)
- Files: `worker/src/dl-grant.js` (new), `worker/src/index.js` (route + `/flags` gets
  `downloads` from `DOWNLOADS_FLAG`, default on), `worker/test/dl-grant.test.mjs`,
  `worker/test/routes.test.mjs`, `wrangler.toml` (no secret in it; key via
  `wrangler secret put DL_GRANT_KEY`).
- Done: signed-in deep/horizon users get a 7-day grant; free/flow get 403 with a generic
  body; `/flags` returns `{adblock, downloads}` and adblock behaviour is byte-for-byte the same.
- Verify: worker tests (sign, verify with the public key, expiry, tier, throttle, sub from
  token not body, `/flags` still has `adblock`). `cd worker && npm audit`. Deploy only on
  the owner's go.

### Phase 1: deeeep rolling offline queue on desktop (proving ground)
- Files: `desktop/offline.js`, `desktop/offline-crypto.js`, `desktop/offline-store.js`
  (new), `desktop/offline.test.js` and friends, `desktop/main.js` (privileged
  `ebbless-dl` scheme before `app.ready`, IPC `ebbless:offline-keep|status|forget|token`
  behind `fromMain`), `desktop/preload.js` (`offline*` methods), `desktop/adhoc-sign.js` (sign with the stable self-signed certificate named in an env var, fall back to ad-hoc when unset), `desktop/package.json`
  version bump. `index.html`: new OFFLINE block (window planner, grant fetch,
  `offlineSrc`, Settings row "Offline queue", queue-row mark, `isOfflineNow`, the
  `YT.PlayerState` shim), the one-line dispatcher hook at 28927, optional third argument in
  `createAudioDeckPlayer`. `sw.js` cache bump with a WHATS_NEW entry.
- Done: a deeeep account on the Mac app, after turning the offline queue on, keeps the next 10 songs (60 MB, 12-minute limit); pulling the network
  mid-song keeps the music going through the kept songs; kill switch off (remote or local)
  means no new keeps and playback through YouTube exactly as before; a corrupt file falls
  back to YouTube for that song.
- Verify: Node tests (crypto round trip and tamper, range reads across chunk edges,
  eviction window, idempotent keep, tmp cleanup, grant verify, stderr classification to
  back-off). A page test in the style of `scripts/test-manual-carry.js` for the window
  planner. In the built app: Wi-Fi off for 15 minutes mid-queue; seek inside a kept song;
  flag off; free account sees nothing; Keychain prompts after an app update (ad-hoc
  signing). Format 251 and Deno question on a clean Mac and Windows. Then Windows (the zip
  layout is still unverified per IMPROVEMENTS.md).

### Phase 2: deeeep on Android
- Files: `OfflineStore.java`, `OfflineFetch.java`, `OfflineCrypto.java` (new),
  `MainActivity.java` (bridge methods, `/__dl/` in `shouldInterceptRequest` with 206
  range answers), `OfflineFallback.java` (fetch, verify and load the offline pack;
  switch-over to yt-dlp and hourly retry of NewPipe), `app/build.gradle` (the
  youtubedl-android Java side only if it can work without its bundled native libraries;
  version pinned exact), the release script that builds the pack, JVM unit tests under
  `app/src/test/` for crypto, eviction and pack verification (new folder), page
  detection of the Android bridge in the OFFLINE block.
- First steps: get `WavePeaks.java` and NewPipe compiling on a real JDK, since nothing
  using NewPipe has been built yet; then check the exec rule (section 7). If the pack
  cannot run, ship phase 2 on NewPipe alone and keep the fallback as its own follow-up.
- Done: same as phase 1 on the TECNO POP 9 test phone, including airplane mode mid-queue,
  screen off with `PlaybackService` playing kept songs, and Wi-Fi-only respected. A free
  install is the same size as before this work; a deeeep phone gets the pack within a
  few minutes on Wi-Fi; a tampered pack is refused.
- Verify: unit tests (one changed byte in the pack is refused), `soak.sh` style run with
  airplane toggles, logcat for decrypt and range errors, APK size before/after (must not
  grow beyond the dormant code), fallback switch-over.

### Phase 3: horizonnn on desktop, then Android
- Files: the offline modules (video and meta kinds, pins, GB limit), `index.html`
  (Keep on this device action on songs and playlists, storage limit control with the
  "about N songs" hint, video layer element and sync, song info offline in the player),
  `terms.html`, `privacy.html`, `docs/PRIVACY-AUDIT.md`, `brand/BRAND.md` section 9.
- Done: horizonnn can keep any song or playlist, with video layer and song info; the limit
  evicts as described; deeeep accounts cannot reach these paths even by calling the bridge
  directly (native tier check).
- Verify: eviction tests with mixed sizes and pins, video sync drift under 150 ms over a
  full song, GPU watchdog clean with the video layer open, under the light show and
  hidden, legal copy reviewed by the owner.

## 13. Checks that apply to every phase

- `scripts/check.sh` before each commit: WHATS_NEW with every `sw.js` bump, every inline
  script parses, no new keyframes beyond transform/opacity, `check-security.js` (no
  secrets: the grant private key is a worker secret only, public key is fine in code; no
  `eval`; no `http://`; exact-pinned deps in `desktop/` and `worker/`), worker tests when
  `worker/` is staged.
- Security review (`docs/SECURITY-REVIEW.md`) on phases 0, 1, 2: new route, tokens, user
  data, a custom scheme. Specific checks: the `ebbless-dl` scheme and `/__dl/` path accept
  only an 11-character id plus the per-launch token; ids validated with the same
  `/^[A-Za-z0-9_-]{11}$/` as `wave.js` before reaching yt-dlp; yt-dlp is called with an
  argument array, never a shell; no media URL from the page is ever fetched (only an id);
  errors to the page are generic. Add an audit log entry.
- Dependencies: none new on desktop (Node `crypto`, Electron `safeStorage`). Android adds
  none if NewPipe stays. Any addition (Deno, youtubedl-android) pinned exact with a reason.
- Tests for flows that must not break: sign-in, a YouTube song end to end with offline
  features off, the same with them on, update/reload.
- Cost: worker cost is one KV read plus a signature per device per day and nothing for
  media. No R2, no bandwidth. Device cost: disk (the limit), data (Wi-Fi only by default),
  battery (one fetch at a time, lowest priority).
