# Operation: study Spotify (pass 1)

Date: 2026-10-17. Method: REA (`rea-agents` 6.5.0, github.com/morluto/rea) driving a throwaway,
logged-out Chrome profile, plus static analysis of the public web player bundles from
open.spotifycdn.com. No login, no DRM interaction, no audio capture, no code copied.
This is a study of how the product is built and behaves, to inform EBBLESS decisions.

Limits: keyword counts come from minified code, so they show where Spotify invests, not how
well anything works. Runtime network and WebSocket capture failed (REA rejects page reloads
during a window, and a page already loaded before attach shows no history). Pass 2 should
attach before navigation.

## What the web player is

- A PWA: Workbox service worker, ~42 MB origin storage, `workbox-precache` cache, IndexedDB
  `keyval-store`. Three big bundles: app (4.5 MB), vendor (1.6 MB), design system "encore" (0.56 MB).
- Uses the Media Session API (17 refs), WebAssembly (module/instance), AudioContext, SharedWorker,
  BroadcastChannel (cross-tab state), IntersectionObserver (lazy rows).
- Backend families seen: `spclient.wg.spotify.com` (the real app backend), `api.spotify.com`
  and `api-partner.spotify.com` (Web API + GraphQL-style partner API), `apresolve` (service discovery),
  `clienttoken`, `seektables.spotifycdn.com` (seek tables), `i.scdn.co` / `mosaic.scdn.co` (images),
  `exp.wg.spotify.com` + `remote-config-*` (experiment and feature-flag service).
- About 300 named feature flags in one bundle. Everything is gated and A/B tested remotely.
- Logged-out "anonymous" users still get a full local state layer in localStorage: queue view,
  library sort/filter, left sidebar widths, playback speed, home pins, remaining-time toggle,
  cinema media preference, onboarding checklist. State is namespaced `anonymous:` vs per-user.

## Feature weight in the bundle (mentions, minified)

queue 671, lyrics 169, canvas 148, offline 143, jam 141, cinema 121, playbackSpeed 111,
mixing 64, autoplay 61, blend 54, prefetch 52, fade 47, normalize 33, enhance 23, crossfade 18,
gapless 6, daylist 5.

Read: Spotify's investment is in the queue and in "stuff around the song" (lyrics, canvas loops,
cinema/video, social: jam, blend), not in the player core.

## Patterns worth stealing (hypotheses to check against index.html)

1. **Anonymous-first local state.** Same state layer for signed-out users. EBBLESS already has no
   sign-up, so make sure every preference persists locally with equal care.
2. **Queue as the central object** (the largest subsystem). Check EBBLESS queue: reorder, play next,
   add to queue from anywhere, undo.
3. **Prefetch + seek tables** so the next song starts instantly and scrubbing is accurate.
   EBBLESS equivalent is warm-loading the next source (see #458 work).
4. **Crossfade/gapless/normalization** exist as features, but weight is low. Relevant to flow.
5. **Playlist mixing** (a dedicated "mixing" feature with snap thresholds and undo history): a
   playlist-level blend/transition tool, not just a list.
6. **Media Session + lock-screen controls** are first class.
7. **Playback speed** as a persisted setting (podcast and spoken-word use).
8. **Remote config for everything.** EBBLESS can ship flags without redeploys via the worker.

## Where EBBLESS can structurally win

- No ads, no account: Spotify cannot remove these without gutting its business.
- Cross-source: one queue across YouTube, SoundCloud and others. Spotify is one catalog, one walled garden.
- Flow over ownership (mission): Spotify's own code shows heavy gating, onboarding checklists and
  upsell surfaces. EBBLESS can stay uncluttered.

## Still open

- Logged-in capture (Jam, Blend, Daily Mix, Connect, realtime channel, first-play latency) needs an
  account session. Do only with an explicit yes.
- Pass 2 (below) covers the tap-count audit and the logged-out cold load.

---

# Pass 2: tap-count audit and cold-load comparison (2026-10-17)

Confidence key: **M** = measured by me in the running app, **C** = read from code, **S** = Spotify's
standard logged-in web behavior from public UI knowledge (not measured; logged-in capture not done).

## Tap-count audit (taps after the app is open; typing and Enter not counted as taps)

| Task | Spotify | EBBLESS | Verdict |
|---|---|---|---|
| First ever listen, brand-new person | Sign up or log in wall before full songs (S) | Enter, then close "Start here" tip, close sign-in card, close install bar, tap playlist, tap Play = 6 (M) | Win vs Spotify, but 4 of the 6 are interruptions. Target: 2 (Enter, music starts) |
| Play a playlist from the library | 1, hover play on the card (S) | 2, card opens a detail panel, then Play (M) | Lose by 1 |
| Play a specific song by name | Type, top result is the song, 1 tap (S) | Type, Enter, results are PLAYLISTS/mixes ("Stevie Wonder Superstition" returned playlists, no song row), open one, Play, hunt for the song = 4+ and may fail (M) | **Biggest loss** |
| Add a song to the queue | 2, menu then Add to queue (S) | 2, menu then Add to queue (C) | Parity |
| Play a song next | 2 (S) | 2 (C) | Parity |
| Like a song | 1, heart on the row (S) | 2 from the row menu; player heart exists (C, unverified in the UI) | Check row-level heart |
| Start a "keep going" mix from a song | 2, song menu then Go to radio (S) | Not found in code (C) | Gap |
| Resume where I left off | 0 to 1, home shows recents (S) | Unmeasured | Measure next |
| Speed control for podcasts and spoken word | 2 (S) | No playbackRate in code (C) | Gap |
| Sleep timer | 2 to 3 (S) | None in code (C) | Gap |

Strengths already in EBBLESS: one box for link, search or "describe your vibe", voice input, Undo toast,
crossfade (163 mentions) and lyrics (263) are heavily built, Media Session wired.

## Cold load, same method, same profile, cache disabled

|  | Spotify web player | EBBLESS (localhost, uncompressed) |
|---|---|---|
| Requests | 160 | 21 |
| Transferred | 2.1 MB | 2.2 MB (1.8 MB of it is `index.html`) |
| Third-party analytics, ads and consent hosts | 7+ (Google Tag Manager, GA, scorecardresearch, cookielaw consent, fastly insights, recaptcha) | 0 |
| Telemetry calls to its own backend in 20 s | 26 on spclient, most to the events receiver | n/a |
| Widevine DRM license certificate fetched | Yes, at ~3.2 s | No DRM involved |

Notes: EBBLESS shows 4 spclient requests in its record, almost certainly late Spotify telemetry from the
same browser tab I navigated away from. Production EBBLESS is served compressed, so 2.2 MB overstates it.
No WebSocket opened while logged out, so Spotify's realtime channel could not be observed. Logged-in
capture (Connect, Jam) remains off the table without your account.

## What Pass 2 changes in the picture

1. EBBLESS's single biggest gap is **song-level search**. Everything else is minor next to it.
2. First-run interruptions (tip, sign-in, install bar) cost more taps than the whole task.
3. Spotify spends much of its client budget on telemetry, consent and A/B flags. EBBLESS carrying none of
   that is a real, defensible speed and trust advantage worth stating in copy.

---

# Outcome (2026-10-17)

## Shipped to main (local, not pushed), cache v308 to v311

| Item | Change | Verified |
|---|---|---|
| Song-level search | Search results now lead with up to 4 song rows (YouTube official first, then SoundCloud) above playlists. One tap plays it. If a queue was playing, the toast has Undo that restores queue, song and position. Songs paint as soon as they arrive, they do not wait on the playlist search. | In browser: Stevie Wonder, Daft Punk, Prince, Sade. Tap plays, Undo restores. |
| Quiet first run | Sign-in card and install bar wait until the first song has played. Tapping anywhere outside the Start here guide dismisses it and the tap still does its job. | In browser on a fresh origin: only the guide before play, install bar after. Sign-in card verified by code only (Google sign-in cannot fire on localhost). |
| One-tap library play | Every grid card (not artists) has a play button in the art corner. Hover on desktop, always visible on touch. Rest of the card still opens the detail panel. | In browser: tap starts the playlist. |
| Sleep timer | Player More menu: Sleep timer, 15 / 30 / 60 min or end of this song, with Turn off. Fades out and pauses. | In browser: chooser, toast, and firing (clock advanced) pause playback. End-of-song mode verified by code only. |

## Corrections to this audit (found while building)

- **Quiet first run is smaller than first stated.** The three prompts are not mandatory taps, I dismissed them
  myself. The real cost was clutter and a layout shift when the install bar popped in over the cards.
- **"Keep this going" already exists.** Discover is on by default, so a single song continues into related songs.
  My keyword grep missed it because the code calls it Discover. Not a gap.
- **Heart on rows:** the player heart already likes the playing song in one tap. Heart on every list row is not
  built, it would add clutter across 8 row builders for little gain. Left as is.
- **Playback speed exists** (`playerSpeedBtn`) but is hidden behind an advanced setting. Not a missing feature, a
  discoverability question.

## Not shipped, needs a decision

- **Copy line "21 requests, not 160" (item 7).** The numbers are real for a logged-out cold load on 2026-10-17, but
  competitor figures in public copy go stale and invite disputes. Safer: claim only what EBBLESS does ("no ads, no
  trackers, no account") and keep the comparison internal.
- **Speed control visibility** for podcasts and spoken word.
- **Push to production.** Everything above is committed to local main only.
