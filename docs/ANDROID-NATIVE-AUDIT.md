# EBBLESS native Android rebuild: Phase 0 audit

Proposed technical specification. Written 2026-10-15 against `main` at
`01efe00`. Nothing in the web app was changed. No Android code was written.

Evidence labels used throughout:

- **[V]** Verified in this repo's code or docs (file and function cited).
- **[E]** External fact checked on the web during this audit (source listed at the end).
- **[A]** Assumption or engineering judgment, not verified.
- **[?]** Unknown. Needs a proof of concept or an owner decision.

---

## 0. Executive summary

1. **EBBLESS has almost no audio of its own to play natively.** Every music
   track is either a YouTube video played through the YouTube IFrame Player
   (`createDeckPlayer`, `index.html:19058`) or a SoundCloud track played
   through the SoundCloud Widget (`createSCDeckPlayer`, `index.html:19435`).
   Only podcast episodes are plain audio files (`createAudioDeckPlayer`,
   `index.html:19632`). Spotify and Apple Music are metadata only. [V]
2. **Media3/ExoPlayer can legitimately play only the podcast path.** There is
   no sanctioned way to hand a YouTube video to ExoPlayer, and the SoundCloud
   stream API needs our own registered credentials, which EBBLESS does not
   have (the worker scrapes a `client_id` from SoundCloud's JS bundles,
   `getSoundCloudClientId`, `worker/src/index.js:2591`). [V][E]
3. So a "fully native" EBBLESS is realistically: **native Compose UI, native
   data layer and queue, native Media3 session and notification, with the
   YouTube and SoundCloud engines still running as embedded web players inside
   a hidden WebView**, driven over a JavaScript bridge. Media3 wraps all three
   engines behind one custom `Player`. [A, the recommended shape]
4. **The core product behavior (screen off, background listening, ad muting)
   is the single biggest risk, and it is a policy risk more than a technical
   one.** The owner accepted YouTube policy risk for the web beta
   (`docs/PLATFORM-AUDIT.md`, "Owner decision (2026-09-30)"). A native Play
   Store app that keeps a YouTube player running in the background is a far
   more explicit case: Play has rejected and removed apps under its Device and
   Network Abuse policy for "enabling background play of YouTube videos". [V][E]
5. The Cloudflare Worker is reusable as-is. It is the real backend (40 routes)
   and it already accepts any client: CORS is `*`, and sign-in is a Google ID
   token checked against one client ID, then swapped for an `ebs1.` session
   token (`worker/src/session.js`). [V]
6. The **riskiest assumptions must be proven before any UI migration**. The
   smallest proof of concept is in section 12: one hidden WebView, two YouTube
   decks plus one SoundCloud deck plus ExoPlayer, behind a Media3
   `SimpleBasePlayer`, in a `MediaSessionService`, played for 30 minutes with
   the screen off on 3 real devices.

**Decision needed before Phase 1 (see section 11):** where the native app is
distributed (Play vs sideload), and whether YouTube background playback and ad
muting ship in it.

---

## 1. What exists today

### 1.1 Repository shape [V]

| Path | What it is | Size |
|---|---|---|
| `index.html` | The whole app: HTML, CSS, JS, no build step | 1.69 MB, 29,458 lines |
| `sw.js` | Service worker: network-first shell cache only, never caches API/audio | 70 lines |
| `manifest.json` | PWA manifest | |
| `worker/` | Cloudflare Worker `spotify-youtube-search`: all scraping, matching, sync, beta | `src/index.js` 4,757 lines + 7 modules, 10 test files |
| `android/` | Existing **Trusted Web Activity** (Bubblewrap), package `io.github.malgriot.ebbless`, `minSdkVersion 21`, portrait, share target | 3 Java files |
| `desktop/` | Electron Mac app (`main.js`, `preload.js`, `signin.html`) | |
| `beta/`, `welcome/`, `sample/` | Beta signup/tester/admin pages, landing page, 15-minute sample | |
| `tools/beta-sheet.gs` | Google Apps Script backing the beta Sheet | |
| `brand/`, `sfx/` | Brand assets, intro theme, needle/cassette sound effects | |
| `docs/` | `PLATFORM-AUDIT.md`, `ANDROID-PLAY-STORE.md`, `REGIONAL-SOURCES.md`, `deep-roadmap.md`, `AUDIO-LICENSES.md`, sample plans | |

The existing Android app is a TWA: Chrome renders the site full screen. It
has no native playback, no native media session, and shares Chrome's storage
(`docs/ANDROID-PLAY-STORE.md`, README "Getting in takes no pasting"). [V]

### 1.2 How the single file is organized [V]

Major banner sections in `index.html` (line numbers are starting points):

| Line | Section | Line | Section |
|---|---|---|---|
| 4687 | BACKEND | 16013 | QUEUE ENGINE |
| 4942 | Link parsers (`parseImportLink` 5087) | 16221 | DISCOVER |
| 5533 | ALBUM ART SOURCE RESOLUTION | 17552 | Swell daily drop |
| 5599 | PERSISTENCE | 17996 | SwiiiRrrLL blend |
| 5733 | PROFILE SYNC | 18677 | YOUTUBE PLAYBACK (dual deck) |
| 6369 | LOGIN SESSION | 19941 | VISUALIZER (cymatics) |
| 6570 | NOW PLAYING HANDOFF | 20815 / 21081 | RECORD / CASSETTE |
| 7094 | RESOLVE PIPELINE | 21240 | LYRICS (+ podcast captions) |
| 7530 | STATE | 22496 / 22669 | Crossfade / pause fade |
| 7792 | VIEW ROUTING | 23435 | DESKTOP MINI PLAYER (PiP) |
| 8485 | LIBRARY RENDER | 24269 | CAST |
| 9300 | PLAYING HISTORY | 25044 / 25094 | `guardActiveDeckAd` / `maybeDodgeAd` |
| 9721 | ARTIST PAGE | 25575 | RESUME |
| 11331 | ON AIR | 25642 | FULLSCREEN / FLOW MODE |
| 12441 | ADD SONGS | 26459 | WRONG-TRACK FLAG |
| 12654 | IMPORT FLOW | 26854 | INIT |
| 13630 | Vibe search (+ mic 14024) | 27082 | FIRST-LAUNCH INTRO |
| 15289 / 15409 / 15583 | Beta analytics / Play log / Tester week-up | 28637 | SAMPLE MODE |

### 1.3 Core data model [V]

- **Track**: `{ title, artist, videoId, art, duration, ... }`. `videoId`
  carries the playback source by prefix (`index.html:5560-5580`):
  - bare id: YouTube video
  - `sc:<numericId>`: SoundCloud native (`isSoundCloudVideoId`)
  - `au:<audio URL>`: podcast enclosure (`isAudioVideoId`)
  - Extra fields seen: `spotifyId`, `manual`, `podcast`, `channel`, `lang`.
- **Playlist**: `{ id, name, tracks, ts, resolveVersion, ... }`, cached in
  `localStorage` under `ebbless:playlist:<id>` (`LS_PL`).
  `RESOLVE_LOGIC_VERSION = 7` (`index.html:7108`) triggers background re-resolve.
- **Built-in playlist ids**: `liked`, `swell` (shown as CuRRentSSsss),
  `blend` (SwiiiRrrLL), `nowplaying` (ON AIR), `handoff`,
  `custom-vibe-session` (`index.html:5685-5689`, `6590`, `13644`).
- **Queue**: `state.queue` = array of `{ plId, idx }` refs, `state.queuePos`,
  `shuffle`, `repeat: off|all|one` (`index.html:7533`). The queue can span
  playlists. Per-playlist sort/custom order: `ebbless:plview:<id>`.
- **Persistence**: about 100 `localStorage` keys (`ebbless:*`), written
  through `lsSet`/`lsGet` so sync can stamp them (`LS_SYNC_META`).

### 1.4 Profile schema v2 (shared with the worker) [V]

`worker/src/index.js:4366` onward and the matching block in `index.html:5796`
("kept identical in index.html and worker/src/index.js"):

```
{ v: 2,
  lib: { order, at, m: { id: { at, del? } } },
  pin: { order, at, m },
  pl:  { id: { at, d: playlistData, tr?: { trackKey: { at, del? } } } | { at, del: 1 } },
  set: { lsKey: { at, val } | { at, del: 1 } },   // synced settings, keyed by localStorage key name
  now: { deviceId: session } }                    // handoff
```

Consequence for native: **`set` is keyed by web `localStorage` key names.** The
native app must read and write the same key names and value shapes for any
setting it wants to sync, or a web device and an Android device will fight.
`mergeProfiles` must be ported to Kotlin as a third identical copy, guarded by
shared test vectors. [V for the shape, A for the remedy]

---

## 2. Feature and screen inventory

Classification for native: **R** reuse as-is (worker/API/assets), **AD**
needs an adapter, **RB** rebuild natively, **DROP** not applicable on native,
**DEFER** keep out of the first native release.

### 2.1 Screens and surfaces

| Surface | Evidence | Native |
|---|---|---|
| Splash + first-launch intro (one flowing sequence, intro theme audio) | `#splash`, FIRST-LAUNCH INTRO `27082` | RB |
| Beta gate (full-screen lock, `/beta/me`, Google claim) | README "Beta tester system", `ebbless:betaToken` | RB, see 7.3 |
| Library (sections: playlists, albums, podcasts; pinned; sort, filter, grid/list, custom section names/order) | `#view-library` `3474`, `LIB_SECTIONS` `8556` | RB |
| Library playlist panel (tracklist sheet, drag reorder #549, sort) | `9389`, `18423` | RB |
| Artist page (releases, bio from MusicBrainz/Wikipedia) | `9721`, worker `/artist`, `/artistinfo` | RB on R endpoints |
| Import / paste box, recent searches, rotating placeholder, paste guide | IMPORT FLOW `12654`, `14196-14487` | RB (plus Android share intent) |
| Vibe search (sentence to playlist) + mic | `13630`, `14024` (Web Speech API), worker `/vibe-interpret` | RB; mic via Android `SpeechRecognizer` |
| Add songs search (#547) | `12441`, worker `/sctracksearch`, `/search` | RB |
| Player: art / visualizer / lyrics / YouTube video card | `#view-player` `3582`, VISUAL MODE `20503`, `#yt-modal` | RB; YouTube card = visible WebView |
| Art styles: default, spinning record (tap game, needle sfx), cassette | `20544`, `20815`, `21081`, `22878` | RB (Compose Canvas) |
| Cymatics visualizer (49 field families, color clock, speed, rotate) | `19941`, `19965`, `20160`, `20321` | RB (Compose Canvas or AGSL) |
| Flow / fullscreen mode, lyrics fullscreen, auto-hide chrome | `25642`, `26134`, `26276` | RB |
| Queue panel, drag reorder, playing history | `18600`, `18491`, `9300` | RB |
| Mini bar, bottom nav | CSS `1356`, `1381`, `26849` | RB |
| Settings (playback, blend, volume leveling, accent, motion, art shape, gestures, sections, backup/restore, account, feedback, credits, what's new) | `#view-settings` `3984`, Advanced `20561` | RB |
| Context menus: playlist, track (refresh link picker, change art, share, copy link) | `10156`, `10386`, `10733`, `10843`, `10959` | RB |
| Wrong-track flag | `26459`, worker `/report` | RB on R endpoint |
| Tester feedback form, vibe check | `14700`, `15216`, worker `/tester-report` | RB |
| Tester week-up + Wrapped recap | `15583`, `ebbless:playLog` | RB |
| Now playing handoff prompt | `6570` | RB on profile sync |
| Desktop mini player (Document PiP) | `23435` | DROP (Android notification + lock screen replace it) |
| Install prompts, install banner, PWA update | `4792`, `24801`, `24849`, `24746` | DROP |
| Desktop keyboard shortcuts | `23119` | DROP or DEFER (hardware keyboards) |
| Sample mode (15-minute trial) | `28637`, `sample/` | DROP (web acquisition funnel) [A] |
| Owner debug consoles (`ebblessSample`, `ebblessStats`, `ebblessWrapped`, `?wrapped=`, `?backend=`) | README | RB as a debug-build menu |

### 2.2 Behavior and engines

| Feature | Evidence | Native |
|---|---|---|
| Link parsing: Spotify, YouTube, SoundCloud, Apple Music, podcasts (Spotify/Apple/RSS) | `parseImportLink` `5087` and parsers `4942-5085` | RB in Kotlin, port with a shared fixture list |
| Resolve pipeline: source metadata, then per-track YouTube match, cache, re-resolve on version bump | `resolvePlaylist` `7120`, `searchYouTubeCached` `5339` | RB logic, R endpoints |
| Art resolution and CDN size rewriting | `resolveTrackArt`, `upgradeArtUrl`, `thumbArtUrl` (`5580-7600`) | RB (pure functions, port directly) |
| Dual-deck gapless, preload, crossfade, previous-deck warm | `decks`, `makeDeck` `18740`, `loadIntoDeck` `19691` | AD (engine in WebView, orchestration native) |
| Ad muting heuristic, ad dodge, mid-roll guard (#523) | `UNMUTE_DELAY_MS`, `deckAdReason` `18836`, `guardActiveDeckAd`, `maybeDodgeAd` | AD, **policy decision required** (section 8) |
| Volume leveling (YouTube `loudnessDb` via `/ytvideo`) | `5623` | AD (applied as deck volume) |
| Pause/resume fades, manual-skip crossfade | `22496`, `22669` | AD |
| Discover engine (Last.fm, ListenBrainz, YouTube mix, This Is, tag + taste graph + tempo/key scoring, pooled affinity) | `16221-17550`, worker `/similar`, `/tags`, `/ytmix`, `/thisis`, `/metrics`, `/pool/*` | RB client scoring, R endpoints |
| Swell (CuRRentSSsss) daily drop, SwiiiRrrLL blend, endless continuation | `17552`, `17996`, `17411` | RB |
| Liked songs, like streak, thumbs-down, encourage liking | `26306`, `17262` | RB |
| Lyrics (LRCLIB synced, tap-to-seek) | `21240`, worker `/lyrics` | RB on R endpoint |
| Podcasts: feeds, episode progress, YouTube episode match, transcripts | worker `/podcast`, `/podepisode`, `/podcastmatch`, `/podtext` | RB on R endpoints, playback via ExoPlayer |
| On-device podcast captions (Whisper via transformers.js in a Web Worker, audio fetched through `/podaudio` range proxy) | `21300-21340` | DEFER (needs ONNX Runtime or whisper.cpp; large model download) |
| ON AIR (owner live broadcast, tune in at live position) | `11331`, worker `/nowplaying` | RB on R endpoint |
| Profile sync (Google), session token, handoff | `5733`, `6369`, `6570`, worker `/profile/*`, `/auth/*` | AD (Credential Manager) + RB merge |
| Cast (YouTube receiver `233637DE`, Default Media Receiver for podcasts) | `24269`, `CAST_YT_APP_ID` `24306` | AD (Cast SDK for Android); YouTube receiver use is undocumented |
| AirPlay | `24657` | DROP |
| Media Session (lock screen, car, Bluetooth) | `updateMediaSessionMeta` `22183`, handlers `23368` | RB as Media3 `MediaSession` (this is where native wins) |
| Silent keep-alive `<audio>` loop for background survival | `keepAliveAudio` `7700` | DROP (replaced by a foreground service) |
| One EBBLESS tab at a time | `23412` | DROP |
| Resume across restarts | `25575`, `ebbless:resume` | RB |
| Beta analytics (counts only, every 10 min) and play log | `15289`, `15409`, `/beta/activity` | RB on R endpoint |
| GPU watchdog and budget rules | `CLAUDE.md` | RB as equivalent rules (pause offscreen animation, no blur over motion) |

---

## 3. Backend, API, authentication and data flow

### 3.1 Backend inventory [V]

One Cloudflare Worker (`worker/src/index.js`, router at `4708-4752`):

| Group | Routes | Upstream (scraped unless noted) |
|---|---|---|
| Spotify metadata | `/playlist`, `/album`, `/track`, `/spotifyart`, `/thisis` | `open.spotify.com/embed` `__NEXT_DATA__`; oEmbed; Web API only if `SPOTIFY_CLIENT_ID/SECRET` set (README says not set) |
| Apple Music metadata | `/amlist`, `/amtrack` | `music.apple.com` `serialized-server-data` |
| YouTube | `/search` (match + scoring), `/ytplaylist` (RSS, ~15 newest), `/ytvideo` (length, loudness), `/ytmix` | `youtube.com/results` HTML, watch page, playlist RSS |
| SoundCloud | `/soundcloud`, `/sctracksearch`, `/playlistsearch` | `api-v2.soundcloud.com` with a scraped `client_id` |
| Podcasts | `/podcast`, `/podepisode`, `/podcastmatch`, `/podtext`, `/podaudio`, `/podcaption/*` | iTunes lookup, RSS feeds, gpodder, Workers AI Whisper (Durable Objects) |
| Discovery data | `/similar`, `/tags`, `/metrics`, `/artist`, `/artistsearch`, `/artistinfo`, `/art`, `/lyrics`, `/vibe-interpret` | Last.fm (`LASTFM_API_KEY`), ListenBrainz, MusicBrainz, Cover Art Archive, Deezer, iTunes, GetSongBPM (`GETSONGBPM_API_KEY`), ReccoBeats, Wikipedia/Wikidata, LRCLIB, Workers AI |
| Shared state (KV) | `/pool/signal`, `/pool/affinity` (`TASTE_POOL`), `/report`, `/tester-report` (`MATCH_REPORTS`) | |
| Accounts (KV `PROFILES`) | `/auth/session`, `/auth/signout`, `/profile/sync`, `/profile/fetch` | Google ID token verification |
| Live | `/nowplaying` (GET public, POST owner only via `OWNER_EMAIL`) | |
| Beta | `/beta/*` | Google Sheet via Apps Script (`SHEET_URL`, `SHEET_SECRET`) |
| Admin | `/admin/*` | Bearer `ADMIN_TOKEN`, origin-locked to `malgriot.github.io` |

Secrets are referenced by name only here; none are needed in the Android app.
The Android app needs **no server secrets**: every route it would call is
public or user-token authenticated. [V]

There is no other backend. No database besides Cloudflare KV, Durable Objects
and the beta Google Sheet. `deep-roadmap.md` notes a "new database" is planned
before launch but not designed. [V]

### 3.2 Native suitability of the backend [V][A]

- **CORS** is `*` for public routes (`CORS_HEADERS`, `index.js:26`). Native
  HTTP ignores CORS entirely, so no change is needed. Admin and owner POSTs
  check `Origin`; the Android app should not call those. [V]
- **Staging**: `BACKEND_STAGING` exists (`index.html:4696`); the Android debug
  build should default to staging, release to production. [V][A]
- **KV free-tier put limits** were hit once (README "Testing against staging").
  Native profile sync must use the same debounce rules as the web, or one
  Android tester could burn the daily quota. [V][A]
- **Rate limits**: per-IP throttles exist on `/tester-report` (5 per 10 min)
  and beta routes. Mobile carrier NAT can put many users behind one IP. [V][A]
- **Matching is client-driven**: the client calls `/search` once per track.
  The native app keeps this pattern; it must cap concurrency similarly. [V]

### 3.3 Authentication [V]

1. Web: Google Identity Services (One Tap, `accounts.google.com/gsi/client`)
   yields an ID token. `GOOGLE_CLIENT_ID` is a **web** OAuth client.
2. Worker verifies it (`verifyGoogleJwt`, `index.js:4337`) and **rejects any
   token whose `aud` is not that one client ID** (`index.js:4344`).
3. `POST /auth/session` swaps it for an `ebs1.` session token (90-day TTL,
   sliding, `session.js`), stored in `ebbless:session` and sent in place of
   the Google token afterwards. `verifyGoogleIdToken` accepts either.

Native plan: Android **Credential Manager** with "Sign in with Google",
requesting an ID token with `serverClientId` set to the existing web client
ID. Per Google's documented pattern, the resulting token's `aud` is the web
client ID, so the worker accepts it unchanged. This requires an **Android
OAuth client** (package name + signing SHA-1) registered in the same Google
Cloud project, one per signing key (upload key, Play app signing key, debug).
[A, standard pattern; must be confirmed by POC test 6]

Store the `ebs1.` session token in encrypted storage, never in synced
settings, never logged. [A]

### 3.4 Data flow (today, and kept for native)

```
paste/share link ──► parse (client) ──► worker metadata route ──► {title, artist, durationMs, art, ids}
                                                │
                    per track ──► worker /search ──► YouTube videoId (or sc:/au: kept native)
                                                │
                         playlist cached locally (LS_PL) ──► library ──► queue ──► deck engines
                                                │
              signed in ──► /profile/sync (merge v2) ◄──► other devices (handoff via `now`)
```

---

## 4. Playback source inventory and feasibility

| Source | How it enters | How it plays today | Native options | Feasibility |
|---|---|---|---|---|
| **Spotify** playlist / album / track / artist | Worker scrapes embed page | Matched to YouTube | Same (metadata only) | Same as YouTube row. Spotify ToS risk unchanged (`PLATFORM-AUDIT.md` item 6). |
| **Apple Music** album / playlist / song / artist | Worker scrapes page JSON | Matched to YouTube | Same | Same as YouTube row. |
| **YouTube** video / playlist / album / channel, plus every matched track | Link, or `/search` match | Hidden 1x1 `YT.Player` IFrame, two to three decks, muted until ad heuristic clears | (a) IFrame API in a WebView (Google's recommended path for Android since the native YouTube Android Player API was deprecated). (b) Stream extraction into ExoPlayer: violates YouTube ToS, guaranteed Play removal, **rejected**. | **Technically feasible via WebView [?].** Background play and ad muting are the policy problem (section 8). |
| **SoundCloud** track / set / artist | Worker `/soundcloud` (scraped `client_id`) | SC Widget iframe, adapter exposes YT-like API; extra pooled decks for hidden-tab advance (#458) | (a) SC Widget in a WebView (closest to today). (b) Official API streams into ExoPlayer: requires registering an app (now self-serve, but needs an **Artist Pro** subscription) and accepting API terms; SoundCloud's terms say embeds/API must not be used to build a new streaming service. | (a) feasible [?]; a native win is that WebView can disable the autoplay gesture rule (`setMediaPlaybackRequiresUserGesture(false)`), which removes the web's "first SC track sits paused" limitation (README). (b) needs owner decision and terms review. |
| **Podcasts** (Spotify show/episode, Apple Podcasts, RSS) | Worker `/podcast` resolves the public RSS feed | `<audio>` on the enclosure URL (`au:` prefix) | **ExoPlayer** directly on the enclosure URL | **Fully feasible and policy-clean.** Best first target for Media3. |
| **Intro theme, sfx** (needle drop/lift, cassette rewind) | Bundled files | `AudioContext` | `SoundPool` or a short ExoPlayer instance; licensed per `AUDIO-LICENSES.md` | Feasible. |
| Local files, Bandcamp, Deezer playback, Tidal, etc. | Not present | n/a | n/a | **Not in scope.** Not invented. |

Cast: YouTube tracks are cast to YouTube's receiver app `233637DE` by video
id; the README already says that is "not a documented contract". The native
Cast SDK can launch the same app id, but the same caveat applies. Podcasts to
the Default Media Receiver are fine. SoundCloud tracks cannot be cast today
and would not be natively either. [V][A]

---

## 5. Proposed native media architecture

### 5.1 Shape

```
MediaSessionService ("PlaybackService", foregroundServiceType=mediaPlayback)
 └─ MediaSession (Media3)
     └─ EbblessPlayer : SimpleBasePlayer          ◄── one Player for the system
         ├─ QueueController (native; owns state.queue/queuePos/shuffle/repeat)
         ├─ DeckManager (active / standby / previous, mirrors `decks`)
         │    ├─ ExoDeck            (au: podcast enclosures, ExoPlayer)
         │    ├─ WebYouTubeDeck     (YT IFrame in hidden WebView, JS bridge)
         │    └─ WebSoundCloudDeck  (SC Widget in hidden WebView, JS bridge)
         ├─ AdGuard (port of deckAdReason / guardActiveDeckAd / maybeDodgeAd, if approved)
         ├─ Fades (crossfade, pause fade, volume leveling via deck volume)
         └─ AudioFocusController (see 5.4)
```

- `SimpleBasePlayer` is the Media3 base for a custom `Player` whose state is
  produced by our own code. It lets the notification, lock screen, Bluetooth
  and Android Auto see one coherent player while three engines run underneath.
  [A, Media3 API; confirm with POC]
- **One hidden WebView** hosts all web decks (two to three YouTube iframes, the
  SC widgets), owned by the service, not by an Activity, so it survives the UI
  being destroyed. The web code that already abstracts decks
  (`createDeckPlayer`, `createSCDeckPlayer`, the `playVideo/pauseVideo/seekTo/
  getCurrentTime` surface) is the right seam: a small, purpose-built
  `deck-host.html` bundled in the APK exposes it through
  `addJavascriptInterface`/`WebMessagePort`. It is new code modelled on the
  existing functions, not a copy of `index.html`. [A]
- The **YouTube video card** (visible player, `#yt-modal`) becomes a visible
  WebView surface that shows the active deck. Reparenting reloads the iframe in
  the web app; on Android, moving a live WebView between windows has the same
  risk. Easiest: render the video card from the same WebView by resizing it
  into view. [?] POC test 5.

### 5.2 Queue management

- Native `QueueController` is the single source of truth, ported from QUEUE
  ENGINE (`16013`): refs of `{ plId, idx }`, `plTrackOrder` sorting
  (`PL_SORTS`, custom order by `profTrackKey`), shuffle, repeat one/all,
  Discover lookahead (`DISCOVER_LOOKAHEAD = 3`, `DISCOVER_BATCH = 6`).
- Media3's timeline is projected from the queue (the media item list shown to
  controllers). The web model that the queue spans playlists maps cleanly.
- Persist queue + position for resume (`ebbless:resume` equivalent) in Room.

### 5.3 Service lifecycle

- Start the service in the foreground only while playing, from a user action
  in the app or a media button (Android 12+ background-start rules). [A]
- Android 14+: declare `FOREGROUND_SERVICE` and
  `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, service type `mediaPlayback`. [A]
- Media-session notifications are exempt from the Android 13
  `POST_NOTIFICATIONS` runtime permission. [A]
- On pause for a long time, stop foreground, keep the session (Media3
  default). On task removal, keep playing if playing, stop if paused. [A]

### 5.4 Audio focus

- ExoDeck: `setAudioAttributes(USAGE_MEDIA, CONTENT_TYPE_MUSIC, handleAudioFocus = true)`.
- WebView decks: **unknown whether Android WebView requests or respects audio
  focus on its own [?]**. Plan: `AudioFocusController` requests focus with
  `AudioFocusRequest` on play, and on loss pauses (transient: duck by deck
  volume, since the IFrame API supports `setVolume`) through the JS bridge.
  Handle `ACTION_AUDIO_BECOMING_NOISY` (headphones unplugged): pause. POC test 4.

### 5.5 Background WebView survival [?]

Biggest technical unknown. A WebView not attached to a visible window may have
its renderer deprioritized, its timers throttled, or its media paused. The
deck logic depends on timers (unmute timer, seek poll, ad guard). Mitigations
to test: keep the WebView attached to a 1x1 window owned by the service is
**not** acceptable (needs overlay permission); instead hold it in the
service, call `setRendererPriorityPolicy(RENDERER_PRIORITY_IMPORTANT, false)`,
never call `onPause()`/`pauseTimers()`, and move time-critical logic (ad
guard, end-of-track advance, fades) into Kotlin with the bridge only
reporting state. POC tests 1 to 3.

---

## 6. Feature-by-feature migration plan

Order is by dependency, not by visibility.

| # | Feature group | Approach | Depends on |
|---|---|---|---|
| 1 | Worker client (Retrofit-free: Ktor or OkHttp + kotlinx.serialization) | Typed calls for the 40 routes used by the client (see 3.1). Staging/prod switch. | none |
| 2 | Link parsing | Kotlin port of `parse*Link` and `libraryEntryForParsedLink`, with a fixture file of real links shared with web tests | 1 |
| 3 | Resolve pipeline + caches | Port `resolvePlaylist`, `withManualTracks`, re-resolve on version, match cache | 1, 2 |
| 4 | Persistence | Room (playlists, tracks, library order, pins, likes, play log, history) + DataStore (settings keyed by the **web key names**) | none |
| 5 | Playback core | Section 5 | 3, 4 |
| 6 | Library, playlist panel, queue, mini bar, player (art mode only) | Compose | 4, 5 |
| 7 | Profile sync + session + handoff | Credential Manager, Kotlin `mergeProfiles` with shared test vectors | 4 |
| 8 | Import surfaces | Paste box, Android share intent (`ACTION_SEND text/plain`, replaces the TWA `shareTarget`), recent searches, Add songs, vibe search (+ `SpeechRecognizer`) | 2, 3 |
| 9 | Discover, Swell (CuRRentSSsss), SwiiiRrrLL, likes/taste graph, endless | Port scoring and graph code; reuse worker routes | 3, 5 |
| 10 | Visual modes | Record (+ tap game, needle sfx), cassette, cymatics (49 families), lyrics, flow mode, accent color clock | 6 |
| 11 | Podcasts | ExoDeck, episode progress, transcripts (`/podtext`); captions DEFER | 5 |
| 12 | ON AIR | `/nowplaying` polling, live position math using `serverTime` | 5 |
| 13 | Cast | Cast SDK for Android with a Media3 `CastPlayer` for podcasts; YouTube receiver path behind a flag | 5 |
| 14 | Beta: gate, analytics, feedback, vibe check, week-up/Wrapped | Reuse `/beta/*`; gate via Google claim (7.3) | 7 |
| 15 | Settings, credits, what's new, backup/restore | Compose | 4 |

Preserve product behavior (rule 8): the native app should match the web's
mission rules (least clicks, "songs" wording, no paste-field-only flows,
`brand/BRAND.md` copy, color and type). Changes required by the platform are
listed in section 7 and 8 and need approval.

---

## 7. Permissions, privacy and security

### 7.1 Permissions (proposed minimum) [A]

| Permission | Why |
|---|---|
| `INTERNET` | Everything |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Background playback service |
| `WAKE_LOCK` | ExoPlayer `setWakeMode` during playback |
| `RECORD_AUDIO` (runtime, only when the mic is tapped) | Vibe search by voice. Optional: `SpeechRecognizer` via intent avoids it. |
| `POST_NOTIFICATIONS` | Only if non-media notifications are added; not needed for the media notification |

Not needed: storage, location, contacts, overlay, accessibility, query-all-packages.

### 7.2 Privacy

- Data that leaves the device today [V]: link lookups and track titles to the
  worker; Google `sub`/email to `PROFILES` KV when signed in; anonymous usage
  counts to `/beta/activity` (no names, IP or device info by design, README);
  pooled taste signals to `/pool/signal`; tester reports. Native must keep
  these exact boundaries.
- Third-party embeds (YouTube, SoundCloud) set their own cookies inside the
  WebView. Use a dedicated WebView profile/data directory and clear nothing
  silently; disclose in the Play Data safety form. [A]
- **A privacy policy page does not exist yet** and Play requires one
  (`docs/ANDROID-PLAY-STORE.md` step 6). Blocker for any Play track. [V]
- Analytics opt-out (`ebblessStats.off()` on web) needs a native equivalent. [A]

### 7.3 Security

- Session token (`ebs1.`) and beta token: Android Keystore-backed encrypted
  storage; excluded from backups (`dataExtractionRules`). [A]
- WebView hardening: load only the bundled `deck-host.html` from
  `https://appassets.androidplatform.net` via `WebViewAssetLoader`; block
  navigation away from YouTube/SoundCloud embed origins; expose a minimal JS
  interface with validated messages only; no file access. [A]
- No secrets in the APK. The worker keeps all keys. [V]
- Beta gate is client-side today ("keeps the public out, not a determined
  dev", README). Same will be true natively. [V]
- Beta token delivery: the TWA shares Chrome's storage, so invite links work
  there today. **A native app does not see Chrome's storage.** Options: the
  existing Google claim path (`/beta/claim`), or Android App Links for
  `https://malgriot.github.io/EBBLESS/?t=...` (the domain already serves
  `assetlinks.json` for the TWA, but claiming `/EBBLESS/` links would pull
  every web link into the app). Recommend Google claim plus a "paste invite
  link" fallback. [V][A]

---

## 8. Platform policy and licensing constraints (explicit)

| # | Constraint | Applies to native? | Severity |
|---|---|---|---|
| P1 | YouTube Developer Policies: no background player, 200x200 minimum visible viewport, no isolating audio (`PLATFORM-AUDIT.md` items 1, 3) | Yes, identically, and more visibly | **Critical** |
| P2 | YouTube: must not block or interfere with ads (item 2). Ad muting/dodge (#523) | Yes if ported | **Critical** |
| P3 | Google Play Device and Network Abuse policy: no accessing a service in violation of its ToS; Play has rejected and removed apps for "enabling background play of YouTube videos", including playback continuing after the power button | Yes, for any Play track (internal testing gets little review; closed and production get reviewed) | **Critical for Play** |
| P4 | YouTube ToS: no scraping (`/search`, `/ytvideo`). Worker-side, unchanged by native | Unchanged | High (accepted for beta) |
| P5 | Spotify Developer Policy III.5 / III.9 and terms IV.2.4 (product shape, scraping). Cover-art treatment rules (blur, rotate) | Unchanged; native visual modes reuse art the same way | High (accepted for beta) |
| P6 | SoundCloud: widget/API must not be used to build a new streaming service; API credentials need Artist Pro; scraped `client_id` is not an authorized credential | Yes | High |
| P7 | Google Play Payments: digital subscriptions sold inside a Play app must use Play Billing (with regional alternative-billing exceptions). `deep-roadmap.md` plans **Patreon** billing for Deep/Flow/Horizon | Yes, once tiers exist | High, before paid tiers [A on exact current rules] |
| P8 | Play: privacy policy, Data safety, target API level, new-account closed test (12 testers, 14 days) (`ANDROID-PLAY-STORE.md`) | Yes | Medium |
| P9 | Package name `io.github.malgriot.ebbless` is permanent once uploaded; the TWA already uses it with an upload key in `~/.ebbless-android/` | Yes | Decision |
| P10 | Bundled audio must be logged in `AUDIO-LICENSES.md` | Yes | Low |
| P11 | Regional blocking (Russia, China, Iran) of YouTube, SoundCloud, Cloudflare (`REGIONAL-SOURCES.md`) | Unchanged | Medium |

**Recommendation [A]:** do not decide P1 to P3 implicitly through code.
Options for the owner:

- **O1. Sideload-first native.** Ship the native app as the APK on the
  existing `android` GitHub release (already linked from the beta page), keep
  the TWA as the Play listing for now. Preserves today's behavior for testers.
  Play exposure unchanged.
- **O2. Play-compliant native.** YouTube plays only while the app is visible
  and the player is shown at 200x200 or larger; no ad muting; background audio
  only for podcasts (and SoundCloud if licensed). Big product change.
- **O3. Hybrid native.** Native app on Play with podcasts and a licensed
  source in the background; YouTube foreground-only with the visible card.
- **O4. Both.** One codebase with a build flavor: `sideload` (today's
  behavior) and `play` (compliant). Most work; flavor must be airtight or
  the Play build risks removal of the whole developer account. [A]

---

## 9. Proposed repository structure (new repo, e.g. `MalGriot/ebbless-android`)

Keep it small. Two Gradle modules at first; split only when a module boundary
earns its keep.

```
ebbless-android/
├─ app/                         Compose UI, navigation, DI wiring, Activity
│  └─ src/main/
│     ├─ java/.../ui/           library/ player/ queue/ settings/ import/ artist/ beta/
│     ├─ java/.../visuals/      record/ cassette/ cymatics/ lyrics/ flow/
│     └─ res/
├─ core/                        no Android UI
│  ├─ api/                      worker client + DTOs
│  ├─ model/                    Track, Playlist, QueueRef, Profile v2
│  ├─ parse/                    link parsers (ported), art URL rewriting
│  ├─ data/                     Room, DataStore (web key names), repositories
│  ├─ sync/                     mergeProfiles (ported), session, handoff
│  ├─ discover/                 scoring, taste graph, Swell, blend
│  └─ playback/                 PlaybackService, EbblessPlayer, decks, AdGuard, focus
│     └─ assets/deck-host.html  YT + SC deck page (bundled, versioned)
├─ testfixtures/                links.json, profile-merge-vectors.json (shared with web repo)
├─ docs/                        this spec, decisions log
└─ .github/workflows/           build, test, sign (secrets in GitHub, never in repo)
```

Dependencies (minimum): Jetpack Compose + Material3, Navigation Compose,
Media3 (`exoplayer`, `session`, optionally `cast`), Room, DataStore,
kotlinx.serialization, kotlinx.coroutines, OkHttp (or Ktor client), Coil
(images), Credential Manager + Google ID library, androidx.webkit. No DI
framework at first (manual constructor wiring) unless it becomes painful. [A]

`minSdk`: 26 recommended (renderer priority API, simpler foreground service
and notification handling). The TWA uses 21. [A, decision]

---

## 10. Testing strategy and release requirements

### 10.1 Tests

- **Shared fixtures with the web repo**: `links.json` (input to parsed
  `{source,type,id}`), `profile-merge-vectors.json` (two profiles plus `now`
  to expected merge). Run in the worker tests (`worker/test/`) and in Kotlin
  unit tests so the three `mergeProfiles` copies cannot drift. Adding these to
  the web repo is a later, approved change, not part of this audit.
- **Unit**: parsers, art URL rewriting, queue engine (shuffle/repeat/span),
  Discover scoring, ad heuristic state machine (pure Kotlin, fed fake deck
  events), live position math (ON AIR).
- **Integration**: worker client against staging; Room migrations.
- **Playback instrumentation** (real devices, not emulators, for audio):
  screen-off soak, track transitions, crossfade, Bluetooth controls, headset
  unplug, phone call interruption (audio focus), Doze, process death and
  restore, low-memory kill.
- **Device matrix [A]**: one Pixel (stock), one Samsung (aggressive battery
  manager), one low-RAM Android Go or older device, Android 12 to the current
  version. Battery-optimization behavior on OEM skins is a known source of
  background-audio kills.
- **UI**: Compose screenshot tests for key screens; GPU budget equivalent:
  no animations running offscreen, verified with frame and memory profiling.

### 10.2 Release requirements

- Signing: decide whether the native app replaces the TWA (same package, same
  upload key, version code above the TWA's `1`) or ships as a new package.
- CI: build, test, sign in GitHub Actions (pattern exists in
  `.github/workflows/android.yml`).
- Play (if chosen): privacy policy URL, Data safety, content rating, target
  API level, closed test 12 x 14 days, app access instructions for review
  (beta gate needs a reviewer path).
- Data migration from the TWA: TWA data lives in Chrome and cannot be read by
  a native app. Signed-in testers recover through profile sync. Testers who
  never signed in lose their library unless they sign in first on the web.
  Settings backup (`advBackupBtn`) excludes the library. Needs a tester notice.

---

## 11. Risks, unresolved questions

### 11.1 Top risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| R1 WebView YouTube audio stops or stalls in background / screen off | Medium [?] | Kills the core use | POC tests 1 to 3 before any UI work |
| R2 Play rejects or removes the app (P1 to P3) | High if YouTube background + ad muting ship on Play | Account-level risk | Owner decision O1 to O4 |
| R3 YouTube or SoundCloud blocks embeds in WebView (embed error 150/152, SC widget origin checks) | Low to medium [?] | Source unusable | POC test 1; `WebViewAssetLoader` origin |
| R4 Ad heuristic is less reliable in WebView timing | Medium [?] | Audible ads or muted songs | Move guard logic to Kotlin; reuse `ebblessAdLog` style logging |
| R5 Three copies of `mergeProfiles` drift | Medium | Devices fight forever | Shared vectors in CI |
| R6 Feature surface is huge (about 29k lines, 40 routes) | Certain | Long timeline, partial parity | Phased plan, parity checklist per phase |
| R7 OEM battery killers stop the service | Medium | Playback stops | Foreground service done right; test matrix; in-app guidance only if needed |
| R8 Billing conflict (Patreon vs Play Billing) | Certain once tiers ship on Play | Blocks paid tiers on Play | Decide before tiers land in the native app |
| R9 Scraping breakage (YouTube/Spotify/SC/Apple page changes) | Ongoing | Imports fail | Unchanged by native; worker-side fixes still reach the app instantly |

### 11.2 Unresolved questions for the owner

1. Distribution: O1, O2, O3 or O4 (section 8)?
2. Does ad muting/dodging (#523) ship in the native app at all? In which build?
3. Replace the TWA under the same package name, or a new package?
4. Is SoundCloud worth an Artist Pro subscription and a terms review for
   licensed native streams, or stay on the widget?
5. Minimum Android version (proposal: 8.0, API 26)?
6. Which features can wait for a later phase (proposal: podcast captions,
   Cast, ON AIR, Wrapped, sample mode never)?
7. Should native feature parity be required before replacing the TWA, or can
   the native app ship to testers with a reduced set?

### 11.3 Unknowns that only a POC can answer

- WebView renderer and timer behavior in a foreground service, screen off,
  30+ minutes, across OEMs.
- Whether WebView media participates in audio focus by itself.
- Whether two YouTube iframes in one WebView can be preloaded and swapped as
  on the web (the web standby deck autoplays muted).
- Whether the SoundCloud credentialless-iframe lane trick (`SC_LANES`) is
  needed or even supported in WebView, or whether separate WebViews are
  cleaner.
- Whether Credential Manager ID tokens pass `verifyGoogleJwt` unchanged.

---

## 12. Phased implementation plan

### Phase 0.5: Proof of concept (recommended next step, 1 to 2 weeks) [A]

**The smallest POC that validates the riskiest assumptions before UI work:**
a throwaway app with **no Compose design**, three buttons and a log view.

Scope:

- `PlaybackService` (`MediaSessionService`) holding `EbblessPlayer`
  (`SimpleBasePlayer`).
- One hidden WebView owned by the service, loading a bundled `deck-host.html`
  with two YouTube decks and one SoundCloud deck.
- One `ExoPlayer` deck for a podcast enclosure.
- A hard-coded 6-item queue: 3 YouTube ids, 1 SoundCloud `sc:` id, 1 podcast
  `au:` URL, 1 YouTube id, played in order with standby preload and a 5s
  crossfade between YouTube decks.
- Lock-screen/notification controls, Bluetooth next/previous.
- Sign-in button: Credential Manager, then `POST /auth/session` and
  `POST /profile/fetch` against **staging**.

Tests and pass criteria:

| # | Test | Pass |
|---|---|---|
| 1 | Screen off for 30 min, queue loops | Audio continues, every transition happens, on a Pixel and a Samsung |
| 2 | App swiped from recents while playing | Playback continues; notification controls work |
| 3 | Standby YouTube deck preloads muted and swaps | Gap under 300 ms, or crossfade audible both sides |
| 4 | Phone call / other media app starts | EBBLESS pauses or ducks and resumes correctly |
| 5 | Show the active YouTube deck visibly at 200x200+ and hide it again | No reload, no audio glitch |
| 6 | Sign in on a device with the debug key | Worker accepts the token, returns a session and profile |
| 7 | SoundCloud deck plays without a tap after a YouTube track | Plays (web limitation removed) |
| 8 | Run ported ad guard (log only, no muting) on 50 YouTube loads | Log shows ad periods detected as on web |

Exit: written results per test, a go / no-go on the WebView architecture, and
the owner's distribution decision. If test 1 or 2 fails on mainstream
devices, stop and revisit before Phase 1.

### Phase 1: Foundations (no polish)

Worker client, models, parsers (with shared fixtures), Room/DataStore, resolve
pipeline, playback core from the POC hardened, minimal library + player +
queue screens.
**Accept:** paste or share a Spotify, YouTube, SoundCloud, Apple Music and
podcast link; it resolves, saves, plays in the background through the queue
with lock-screen controls; survives process death with resume.

### Phase 2: Accounts and continuity

Credential Manager sign-in, session token, Kotlin `mergeProfiles`, two-way
sync with web key names, handoff prompt, beta gate via Google claim, beta
analytics.
**Accept:** a library edited on web appears on Android and back; removals
propagate; shared merge vectors pass in both repos; handoff works both ways.

### Phase 3: Product parity, core

Full library (sections, pins, sorts, custom order, context menus, share,
refresh link picker, change art, wrong-track flag), Liked Songs, Discover,
Swell (CuRRentSSsss), SwiiiRrrLL, endless continuation, artist page, Add songs,
vibe search with voice, settings.
**Accept:** feature checklist from section 2 marked done or explicitly
deferred by the owner; least-clicks review against the web for each flow.

### Phase 4: Visual identity

Record (+ tap game, needle sfx), cassette, cymatics, lyrics (+ tap-to-seek),
flow mode, accent color clock, intro, splash.
**Accept:** side-by-side review against the web on a phone; no offscreen
animation (profiling); 60 fps on the mid device.

### Phase 5: Extended

Podcasts parity (progress, transcripts), ON AIR, Cast, tester week-up/Wrapped,
feedback and vibe check, podcast captions (if approved).
**Accept:** per feature, behavior matches the web as documented in README.

### Phase 6: Release

Signing decision, privacy policy, Data safety, store listing, closed test (if
Play), TWA retirement plan and tester migration notice.
**Accept:** signed release build in the chosen channel; testers migrated
without losing signed-in libraries.

---

## Sources checked during this audit (external)

- Google Play Device and Network Abuse enforcement against YouTube background
  play (developer forum reports quoting Play rejection emails, not Google's
  policy page itself; verify current wording in Play Console):
  [appstudio.dev](https://discuss.appstudio.dev/t/google-play-taking-my-apps-down-youtube-player/1522),
  [Ionic forum](https://forum.ionicframework.com/t/solved-violation-of-device-and-network-abuse-policy/145910),
  [MIT App Inventor community](https://community.appinventor.mit.edu/t/youtube-background-play/12021)
- YouTube on Android via IFrame API in a WebView:
  [android-youtube-player](https://github.com/PierfrancescoSoffritti/Android-YouTube-Player)
- SoundCloud API registration and terms:
  [Register an app](https://developers.soundcloud.com/docs/api/register-app),
  [API sign-up changes](https://developers.soundcloud.com/blog/api-sign-up-changes),
  [Self-serve API keys](https://developers.soundcloud.com/blog/vibe-coding-ai-agent-docs-self-serve-api-keys),
  [API Terms of Use](https://developers.soundcloud.com/docs/api/terms-of-use)
- Repo docs relied on: `docs/PLATFORM-AUDIT.md` (YouTube and Spotify policy
  citations), `docs/ANDROID-PLAY-STORE.md`, `docs/REGIONAL-SOURCES.md`,
  `docs/deep-roadmap.md`, `README.md`.
