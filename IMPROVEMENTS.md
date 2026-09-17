# Improvements backlog

This is the task list the "manager" session works from. Add one entry per
improvement you want built. When an entry's status is `ready`, the manager
will claim a lane for it via `scripts/session.sh` and hand it to its own
agent session, working in an isolated worktree so it can never collide with
another lane's uncommitted edits.

## Adding entries

Two intake channels, both feed this same backlog:

- **At your computer:** run `node tools/improvements-server.js` (or ask the
  manager to launch it), open `http://localhost:5820`, fill in the form,
  click "Submit to IMPROVEMENTS.md" — it writes straight into this file.
  Entries from here default to **`ready`** — you're at the keyboard, so
  it's queued immediately.
- **On the go, no Claude sign-in needed:** open EBBLESS itself → Settings →
  About → "Suggest an improvement" (or go straight to
  [github.com/MalGriot/EBBLESS/issues/new?template=improvement-idea.yml&labels=idea](https://github.com/MalGriot/EBBLESS/issues/new?template=improvement-idea.yml&labels=idea)).
  Only needs a GitHub login — nothing Claude-specific. It files a GitHub
  issue labeled `idea`, not an entry in this file directly. The manager
  syncs those into the backlog below (`gh issue list --label idea --state
  open`), appends each as an entry here, and closes the issue with a
  comment linking to the entry it became — ask it to sync, or it checks at
  the start of a session. Entries from here default to **`draft`** — this
  channel is reachable by anyone with the app open (not necessarily you in
  person), so a synced idea waits for you to flip it to `ready` in this
  file before any agent is dispatched on it. Only Title is required on
  either channel; everything else can be filled in later.

## How this works

0. **Every time you say "start the queue":** the manager first syncs in any
   new Geethub-sourced ideas (checking the *unfiltered* open-issue list, not
   just ones labeled `idea` — that label doesn't always get auto-applied)
   and runs the dedup check in step 2 below on anything new. Then, instead
   of silently dispatching anything, it renders the **entire backlog** (all
   statuses, not just `draft`/`ready`) as a plain list: manager's own
   priority order top to bottom, each entry with a short, jargon-free
   description in plain English — something you can read at a glance and
   understand without opening the file. It stops there and waits. You reply
   with which entries to flip to `ready` (or `dropped`, etc.).
   - Priority order favors entries closest to done first — `review` >
     `in-progress` > `ready` > `draft` — then within a tier, by the
     manager's judgment of urgency/impact.
   - Only after you've picked does the manager act: it runs up to the
     parallelism limit (**2-3 lanes at once**) across whichever entries are
     now `ready`, are already `in-progress`, or were left unfinished from a
     prior batch — prioritizing anything closest to completion over
     brand-new `ready` entries.
1. You add/edit entries below (directly, or via one of the intake channels above). Anything you want built goes in `ready`.
2. Whenever the manager syncs new entries in (from a GitHub-issue sync, or
   before promoting anything to `ready`), it first checks the new entry
   against every existing entry in the backlog below — any status,
   including `merged`/`dropped` — for duplicates or overlap: same feature
   area, same underlying complaint, or one that's a subset of another.
   It does **not** silently fire off a redundant lane for a near-duplicate.
   Instead it: folds the new detail into the existing entry's Notes and
   discards the duplicate (obvious, exact-match dupes), or flags both
   entries side by side and asks you which should stand when it's a
   judgment call (overlapping but not identical, or the existing one is
   already `in-progress`/`review`). Only entries that survive this check
   get queued.
3. The manager (this Claude Code session) picks up `ready` entries, per the
   selection and priority rules in step 0, up to the agreed parallelism
   limit (currently: **2-3 lanes at once**), and for each one:
   - runs `scripts/session.sh start <slug> "<scope>"` to create an isolated
     worktree + branch (`agent/<slug>`)
   - dispatches a subagent into that worktree with the entry's description
     as its brief
   - sets the entry's status to `in-progress`
4. Before any lane commits+pushes, the manager diffs it against every other
   active lane's current worktree contents. If two lanes touched overlapping
   regions of `index.html` in a way that would conflict, the manager holds
   the later one, sequences the merge, and re-runs the diff check rather
   than letting both push blind.
5. Lanes **commit and push to their own `agent/<slug>` branch only** —
   never to `main`, and nothing is ever deployed live by the manager. Status
   moves to `review`.
6. Once all in-flight lanes for a batch reach `review`, the manager posts
   you a report (what changed, per-lane diff summary, how to look at each
   branch locally) and stops.
7. You review locally. For whatever you approve, the manager gives you a
   final list of diffs to actually ship, and merges to `main` / deploys only
   on your explicit go-ahead.

Status values: `draft` (not ready yet) · `ready` (queue it) ·
`in-progress` · `review` (pushed, awaiting your local check) ·
`approved` (ok to merge to main) · `merged` · `dropped`.

## Backlog

<!--
Add entries in this shape:

### <short-slug>: <one-line title>
- **Status:** draft
- **Priority:** medium
- **Description:** what should change and why, concretely enough that an
  agent with no other context could implement it correctly.
- **Touches:** rough area of index.html / which feature, if known.
- **Branch:** (filled in by the manager once a lane is claimed)
- **Notes:** anything else — constraints, things to avoid, prior attempts.
-->

### breathe-love-deep-album: "Breathe Love Deep" should be an album sourced from SoundCloud
- **Status:** review
- **Priority:** medium
- **Description:** The "Breathe Love Deep" release, default-loaded into the
  app's library, should (1) be categorized/displayed as an ALBUM like this
  app's other multi-track releases, and (2) resolve its data (art, track
  list, everything) directly from its SoundCloud source, never routed
  through Spotify or Apple Music matching.
- **Touches:** starter/default library seed (`STARTER_LIBRARY_URLS` /
  `seedStarterLibrary()`), album categorization (`isAlbumType()`),
  SoundCloud source resolution (`sourceKindForType()`, `resolveTrackArt()`).
- **Branch:** agent/breathe-love-deep-album
- **Notes:** Synced from a Geethub issue. Found the SoundCloud-sourcing
  half was already correct: `STARTER_LIBRARY_URLS` already seeds
  "Breathe Love Deep" from its own SoundCloud set link
  (`https://soundcloud.com/mal-griot/sets/breathelovedeep`), resolved as an
  `sc_playlist`, whose art/tracks come straight from
  `fetchSoundCloudLink()` and `sourceKindForType('sc_playlist')` ->
  `'soundcloud'` -> `resolveTrackArt()`'s existing SoundCloud exception
  (native art, no Spotify/Apple Music round-trip) - the same helper/pattern
  added by `spotify-album-art` and reused by `lockscreen-album-art` /
  `spotify-art-source`. What was missing was album categorization:
  `isAlbumType(type)` only recognized `'album'` (bare Spotify) and
  `'am_album'` (Apple Music) - SoundCloud has no separate album URL shape
  (a "set" covers both playlists and albums), so this release was falling
  into the generic Playlists bucket.

  Fixed and pushed (commit `cd13264`): added a new `sc_album` type that
  resolves through the exact same `resolvePlaylist` branch, `sourceKindForType`
  mapping, and `canonicalLinkForPlaylist` handling as `sc_playlist` (identical
  SoundCloud-native resolution - no new fetch path, no reinvented logic),
  but is recognized by `isAlbumType()` so it renders in the Albums section
  like every other release. `seedStarterLibrary()` now tags specifically the
  `/sets/breathelovedeep` URL as `sc_album`; any other SoundCloud set a
  listener pastes in themselves still defaults to plain `sc_playlist` as
  before - this only changes the one default-seeded release, not general
  SoundCloud-set behavior.

  Verified via a local static server serving this worktree directly (not
  the shared preview-tool launcher, which turned out to be serving the
  main checkout's `index.html` regardless of worktree - worth knowing for
  future lanes) on a fresh browser profile: after the intro/onboarding,
  the library shows "Breathe Love Deep" (10 tracks, 1h 1m) under its own
  "ALBUMS" section header, separate from the Playlists grid, matching how
  other albums render. Confirmed in localStorage that its cached playlist
  object has `"type":"sc_album"` and its track art/images are SoundCloud
  CDN URLs (`i1.sndcdn.com`), not Spotify/Apple Music. Checked console
  errors: one `"An unknown error occurred when fetching the script"`
  appears, but it reproduces identically on unmodified `HEAD` served the
  same way (a pre-existing sandbox/service-worker quirk, not caused by
  this change) - no new console errors from this fix. Did not exercise
  actual SoundCloud embed/audio playback in this sandbox (no network
  egress to SoundCloud/YouTube from this environment during the check;
  the localStorage cache already held previously-resolved real data), so
  playback itself is unverified - recommend a quick real-device/browser
  check of `beginImport`/embed playback for this album before treating
  audio playback as confirmed.

### spotify-album-art: Player album art should pull from Spotify art
- **Status:** merged
- **Priority:** high
- **Description:** Player album art should pull from Spotify art no matter
  what link the user enters, except when it's a Soundcloud link — in that
  case, pull everything (art included) directly from Soundcloud instead.
- **Touches:** player UI / now-playing album art resolution.
- **Branch:** agent/spotify-album-art
- **Notes:** Synced from Geethub issue #1. Folded in issue #2 ("Soundcloud
  links should be treated as direct links") as a duplicate — its title is
  the same exception clause already covered here, and its body was empty.
  Related to `lockscreen-album-art` below (same Soundcloud-exception logic,
  different surface — in-app player vs. OS lock screen) — worth sharing an
  art-resolution helper between the two rather than solving twice. Fixed
  and pushed (commit `7aa250d`): added a reusable `resolveTrackArt(sourceKind,
  title, artist, nativeArt)` helper (+ `sourceKindForType(type)`) that every
  track-resolution path now calls — Spotify/SoundCloud keep native art,
  everything else (Apple Music, YouTube, etc.) gets a Spotify cover lookup.
  `lockscreen-album-art` should reuse this same helper via `track.art` /
  `artworkUrls(track)` rather than reimplementing the logic.
  **Superseded:** Spotify's Client Credentials flow this originally relied
  on is now blocked (Spotify requires Premium to create a developer app as
  of Feb 2026) — see `spotify-art-source` above, which replaced the
  `/spotifyart` lookup with the free, keyless iTunes Search API instead.
  No Spotify secrets are needed anymore. Still needs `wrangler deploy` to
  go live — that's your call.

### spotify-art-source: Swap /spotifyart lookup off the blocked Spotify API
- **Status:** review
- **Priority:** high
- **Description:** Spotify locked developer-app creation behind a Premium
  account (Feb 2026), so `/spotifyart`'s Client Credentials flow
  (`SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`) is a dead end for this
  user. Replace it with the iTunes Search API (public, free, no key/login,
  same source already used for Apple Music matching elsewhere in this
  app) as the art-lookup-by-title/artist source. Keep the existing
  SoundCloud-native-art exception and the existing graceful fallback to
  each source's own native art when no match is found.
- **Touches:** `worker/src/index.js` (`handleSpotifyArt` and the
  Client Credentials token helper around line 780-850); the endpoint name
  and any client-side references to it in `index.html` may need
  renaming/updating for accuracy, or can stay as-is if only the backend
  swaps sources.
- **Branch:** agent/spotify-art-source
- **Notes:** Supersedes the `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`
  requirement noted in `spotify-album-art`'s entry above — that decision
  is now moot, drop it once this lands. Do not use Spotify's undocumented
  anonymous web-player token trick as an alternative — same class of
  brittle, ToS-risky reverse-engineering this app's README already
  rejected for YouTube's innertube API.

  Fixed and pushed (commit `47a4d67`): deleted the Spotify Client
  Credentials token helper and search call entirely, replaced with
  `searchItunesTrackArt(title, artist)` hitting the public, keyless iTunes
  Search API and upsizing `artworkUrl100` to `1200x1200`. Same route
  (`GET /spotifyart?title=&artist=`), same `{ image }` response shape, same
  cache-key/TTL strategy, same graceful null-on-miss behavior — no client
  change needed in `index.html`. Verified live via `wrangler dev --local`:
  a real query (Blinding Lights / The Weeknd) returned real upsized art, a
  nonsense query returned a clean `{"image":null}`. This is no longer
  blocked on Spotify credentials — the `SPOTIFY_CLIENT_ID`/
  `SPOTIFY_CLIENT_SECRET` requirement noted in `spotify-album-art` above is
  now moot. Not deployed (`wrangler deploy` not run) — deploy is your call
  once reviewed.

### lockscreen-album-art: Lock screen art should be Spotify album art on mobile
- **Status:** review
- **Priority:** low (deprioritized below mobile-install-button; also blocks on spotify-album-art landing first)
- **Description:** On mobile, the OS lock-screen / media-session artwork
  should show the Spotify album art (same Soundcloud exception as
  `spotify-album-art`: if it's a Soundcloud link, use Soundcloud's own art).
  Currently it isn't consistent — YouTube art is still showing up sometimes
  on the lock screen instead.
- **Touches:** mobile media session metadata (`MediaSession` API /
  equivalent), lock screen artwork.
- **Branch:** agent/lockscreen-album-art
- **Notes:** Synced from Geethub issue #3. Agent found the reported bug
  couldn't be reproduced on current `main` — a prior fix (`c860d3a`) plus
  `spotify-album-art` landing (`3c12bbc`) already had the lock screen
  reading resolved art via `t.art`. It found and fixed a latent duplication
  though: `updateMediaSessionMeta()` (~line 5528) had its own inline art
  logic instead of calling the shared `artworkUrls()` helper — the exact
  kind of drift that caused this bug once before (`59035ee` fixed it,
  `ef630ab` silently reverted it, `c860d3a` restored it). Simplified to
  delegate to `artworkUrls()` so it can't drift again. Commit `a62d718` on
  `agent/lockscreen-album-art`, pushed, not merged. Verified by tracing
  every track-creation path and a syntax check; couldn't exercise
  `navigator.mediaSession` directly since the browser tool renders local
  files as a static snapshot. Real-device check recommended once art
  actually goes live (see `spotify-art-source` below — this depends on
  that landing before it does anything visible).

### mobile-tutorial-load: Tutorial not loading on mobile
- **Status:** merged
- **Priority:** high
- **Description:** The onboarding tutorial isn't loading on mobile. Open
  question from the reporter: would a video version of the tutorial be more
  reliable on mobile than whatever it currently is (worth investigating
  before committing to a fix)?
- **Touches:** onboarding / tutorial flow, mobile.
- **Branch:** agent/mobile-tutorial-load
- **Notes:** Synced from Geethub issue #4. Fixed and pushed (commit
  5524ec4 on the branch): root cause was `introEligibleNow` in `index.html`
  (~line 6910) gating the intro to `!isTouchDevice || isStandaloneApp`,
  which excluded nearly all real phone visits (touch, not installed as a
  standalone PWA) from ever seeing it — a same-day regression from commit
  `24d1196` (Sep 16). Gate removed; intro now always eligible. Verified on
  a mobile viewport: first-visit intro plays through all stages with no new
  console errors, returning visitors still skip it as before. Went with the
  direct fix over a video tutorial — the existing intro already has
  touch-aware copy/interactions and rendered reliably once the gate was
  gone, so a rewrite wasn't warranted.

### mobile-install-button: Missing install button on mobile splash
- **Status:** merged
- **Priority:** medium
- **Description:** On the splash screen shown after the tutorial on mobile,
  the app should detect whether it's already been installed to the home
  screen. If not installed, an "install" button should appear below the
  EBBLESS logo — it's currently missing.
- **Touches:** mobile splash screen, PWA install-prompt detection.
- **Branch:** agent/mobile-install-button
- **Notes:** Synced from Geethub issue #5. Same general area as
  `mobile-tutorial-load` (post-tutorial mobile splash) but a distinct bug —
  kept separate. Fixed and pushed: root cause was the button being gated
  entirely on Chromium's `beforeinstallprompt` event, which never fires on
  iOS Safari (and can be silently withheld even on Chrome/Android) — so the
  button was permanently invisible on iPhone regardless of install state.
  Rewrote to gate on actual install state (`isMobileUA && !isStandaloneDisplay()`)
  instead, with an iOS-specific "Tap Share, then Add to Home Screen"
  fallback since no native prompt exists there, plus an `appinstalled`
  listener to clear the splash immediately if installed mid-splash.
  Verified in a mobile viewport across not-installed / installed / iOS /
  non-Chromium-mobile states. **Follow-up flagged by the agent (not yet a
  backlog entry):** the Settings screen's own "Install" fallback button
  (`installBtn`/`installBlock`, ~line 5756) has the identical
  `beforeinstallprompt`-only bug and also never shows on iOS — worth a
  future lane if you want it fixed too.
  Also folded in Geethub issue #6 ("Where's the install button on mobile
  splash?") as a duplicate - same complaint, filed before this fix landed.
  Closed with a comment pointing here.

### splash-tutorial-choice: Splash screen should offer tutorial-or-skip with sound
- **Status:** review
- **Priority:** medium
- **Description:** On the splash screen, show two buttons: one to play the
  tutorial, one to skip straight in. Choosing the tutorial option should
  trigger sound (tutorial music).
- **Touches:** splash screen, onboarding/tutorial flow, audio triggers.
- **Branch:** agent/splash-tutorial-choice
- **Notes:** Synced from Geethub issue #7. Fixed and pushed (commit
  `3c1873d`): added a `#splashChoice` panel with "Play Tutorial"/"Skip"
  pill buttons to `#splash`, wired via a new `showSplashChoice()` that
  replaces the old automatic `runIntro(false)` call. "Play Tutorial" calls
  the existing `runIntro(false)`, which already plays `#onbMusic`
  (`brand/assets/intro-theme.mp3`) — no new audio pattern needed, and
  triggering it from the click handler also fixes a latent autoplay-policy
  risk (previously fired with no user gesture at all). "Skip" behaves like
  a returning visitor. Bug found+fixed along the way: `#onbBackdrop`/
  `#onbMark` are visible-by-default static markup that would've sat on top
  of the new buttons and hidden them; now hidden while the choice is up.
  Verified in mobile (375x812) and desktop viewports: both buttons work,
  tutorial plays with music, skip proceeds straight through, reload after
  skip doesn't re-show the choice, no new console errors.

### splash-button-labels: Rename splash screen button labels
- **Status:** ready
- **Priority:** low
- **Description:** On the splash screen's tutorial-choice buttons (added by
  `splash-tutorial-choice`), rename "Skip" to "Enter" and "Play Tutorial" to
  "Tutorial".
- **Touches:** splash screen (`#splashChoice` buttons).
- **Branch:** (none yet)
- **Notes:** Synced from Geethub issues #8 and #9 - combined into one entry
  since both are simple label edits to the same two buttons. Its dependency
  (`splash-tutorial-choice`) has now landed on `main`, so this is unblocked.

### tutorial-i-tried-it-album: "I Tried It" tutorial sample should show as a two-track album
- **Status:** review
- **Priority:** medium
- **Description:** The "I Tried It" sample shown in the onboarding tutorial
  is actually an album - it should display as such, showing both tracks,
  matching how it appears in the real Spotify album.
- **Touches:** onboarding/tutorial flow, tutorial sample data.
- **Branch:** agent/tutorial-i-tried-it-album
- **Notes:** Synced from Geethub issue #11. Fixed and pushed (commit
  `ed129ca`): tutorial now shows a `DEMO_TRACKS` array of two tracks -
  "I Tried It" (5:56) and "I Tried It (Radio Edit)" (3:34) - matching the
  real playlist track-row shape. **Held for user confirmation:** the Radio
  Edit title/duration was inferred from Wind Horse Records' Bandcamp
  listing, not scraped from Spotify directly - needs a check against the
  real Spotify album page before merging to `main`.

### tutorial-caption-timing: Onboarding captions overlap ("smooth" / "no ads ever")
- **Status:** review
- **Priority:** medium
- **Description:** During the onboarding tutorial, the "Crossfade smoothly"
  and "With no ads ever" captions (settings/crossfade beat) overlap instead
  of one fully disappearing before the next appears.
- **Touches:** `runIntro()`'s settings-section caption beats in `index.html`
  (~line 6886, the `crossfadeBtn` pair).
- **Branch:** agent/tutorial-caption-timing
- **Notes:** Synced from a Geethub issue. Read `baa95e6` (the prior tutorial-
  replay fix) first to confirm this wasn't the same class of bug — it isn't;
  that commit fixed a *cross-run* race (`cancelPrevIntro`, stale DOM state
  from `discardIntroChrome()`), this is a *same-run* timing bug entirely
  local to one pair of captions.

  Root cause: `setCaption('Crossfade smoothly', crossfadeBtn)` was followed
  by only `wait(500)` before `setCaption('With no ads ever', crossfadeBtn)`
  — shorter than `#onbCaption`'s own 550ms opacity transition
  (`transition:opacity 550ms ...`, ~line 991). Both captions share the same
  DOM element and target, and `setCaption()` swaps text in place with no
  clear in between (the same pattern the "New music for you" / "Every day"
  pair uses safely, since that pair gets a full 1400ms hold each). Here the
  gap was tighter than the fade itself, so the second caption's text swapped
  in while the first was still mid-fade-in, reading as an overlap rather
  than a clean handoff.

  Fixed and pushed (commit `b531241`): extended the hold after "Crossfade
  smoothly" from 500ms to 600ms so its own fade-in completes, then inserted
  an explicit `clearCaption()` plus a 550ms wait (matching the CSS
  transition duration exactly) before "With no ads ever" fades in. This is
  a minimal, targeted change to this one pair — no other beat's timing,
  duration, or the `cancelPrevIntro`/`discardIntroChrome` replay-safety
  mechanism from `baa95e6` was touched.

  Verified via a `MutationObserver` on `#onbCaption` logging text/visibility
  with timestamps (browser preview couldn't drive local `file://` pages
  directly, so served the worktree over `python3 -m http.server` and drove
  it from there) across two full tutorial runs — an initial `?intro` run
  and a Settings → "Replay tutorial" run (the exact scenario `baa95e6`
  hardened). Both runs showed "Crossfade smoothly" go `visible:false`
  roughly 550ms before "With no ads ever" goes `visible:true` (e.g.
  `t=43581` false → `t=44133` true on the first run; `t=53261` false →
  `t=53814` true on the replay), zero console errors in either run, and the
  rest of the sequence (including the closing "Flow with the go" beat and
  the return to the real app) played through unaffected in both. No open
  questions.

### album-art-icon-colors: Album art style icons have inconsistent accent colors
- **Status:** review
- **Priority:** low
- **Description:** The three album-art "style" icons in the picker menu
  (Default / Spinning Record / Cassette Tape) should all use the same
  accent-color source for their small circle accents, so they stay in sync
  if the accent ever changes. The record icon's center-label dot already
  used the accent var; the cassette's two reel-hub dots and the default
  icon's glyph did not.
- **Touches:** `index.html` CSS around line 386-393 (`.art-style-swatch`,
  `.swatch-default`, `.swatch-disc`/`.swatch-label`, `.swatch-cassette`/
  `.swatch-hub`, the small swatch icons shown in the `#artStyleMenu`
  picker), distinct from the larger physical-material `.record-spindle` /
  `.cs-hub-core` elements used in the actual playing record/cassette
  views, which intentionally use realistic hardware colors, not the
  theme accent.
- **Branch:** agent/album-art-icon-colors
- **Notes:** Synced from a Geethub issue (backlog entry had not yet been
  created in this worktree's copy of this file, added now). Fixed and
  pushed (commit `073c2c6`): `.swatch-hub` (cassette reel-hub dots) changed
  from a hardcoded `var(--faint-2)` to `var(--accent)`, matching
  `.swatch-label` (record center dot), which already used `var(--accent)`.
  Added a new `.swatch-default{color:var(--accent)}` rule so the default
  icon's glyph (drawn with `fill="currentColor"`) also resolves to the
  accent instead of inheriting the menu's default `var(--faint-2)`. No
  hardcoded hex values introduced, all three now read the same
  `--accent` custom property, so they move together automatically if the
  accent (which is itself driven by the day's color-clock) changes.
  Verified: ran a local `python3 -m http.server` directly in this worktree
  (not the shared `preview_start` launch config, which per a sibling
  lane's warning can silently serve the main checkout's `index.html`
  regardless of worktree) and pointed the browser tool at that port
  explicitly, confirming via `location.href` in the page that the tab was
  actually loading from the worktree's own server before trusting any
  result. Opened a playlist's player view, opened the art-style picker
  menu, and via `getComputedStyle` confirmed `--accent`, `.swatch-label`
  background, `.swatch-hub` background, and `.swatch-default` color all
  resolved to the identical computed RGB value. Screenshot confirms all
  three icons render the same pink accent visually. This app has no
  light/dark theme toggle (the "accent" is a day-color-clock variable,
  not a light/dark mode switch), so no separate dark-mode check applied;
  since all three now share one CSS var, they will track any future
  accent change (including any day-color-clock rotation) together by
  construction. Checked console: two pre-existing "unknown error fetching
  the script" messages appear, unrelated to this CSS-only change (present
  before editing, no JS touched, no new network failures beyond an
  unrelated aborted intro-theme audio fetch on a duplicate page load).
