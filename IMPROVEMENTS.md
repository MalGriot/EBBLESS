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
  open`), appends each as an entry here, and comments on the issue with a
  link to the entry it became — ask it to sync, or it checks at the start
  of a session. **Synced issues stay open until the change actually
  ships** (per Geethub issue #197), so the open-issue list always shows
  what's still pending:
  - at sync: comment linking the entry; the issue stays open (skip any open
    issue whose number already appears in an entry here — it's synced).
  - entry reaches `review`/`approved`/`merged` (built, not yet live): add
    the `waiting-for-deployment` label.
  - deployed live: swap to the `completed` label and close the issue as
    completed.
  - entry `dropped` or folded into another entry as a duplicate: close the
    issue as not planned / duplicate, with a one-line reason.
  Entries from here default to **`draft`** — this
  channel is reachable by anyone with the app open (not necessarily you in
  person), so a synced idea waits for you to flip it to `ready` in this
  file before any agent is dispatched on it. Only Title is required on
  either channel; everything else can be filled in later.

## How this works

0. **Every time you say "start the queue":** the manager first syncs in any
   new Geethub-sourced ideas (checking the *unfiltered* open-issue list, not
   just ones labeled `idea` — that label doesn't always get auto-applied)
   and runs the dedup check in step 2 below on anything new. Then, instead
   of silently dispatching anything, it renders the **open backlog** (every
   entry not yet `merged`, `dropped` or `archived`) as a plain list. Never list
   `merged`/`dropped`/`archived` entries unless explicitly asked (wasted tokens).
   Order: manager's own
   priority order top to bottom, each entry with a short, jargon-free
   description in plain English — something you can read at a glance and
   understand without opening the file. It stops there and waits. You reply
   with which entries to flip to `ready` (or `dropped`, etc.).
   - Priority order favors entries closest to done first — `review` >
     `in-progress` > `ready` > `draft` — then within a tier, by the
     manager's judgment of urgency/impact, always weighting bug fixes ahead
     of new features at the same tier (per Geethub issue #48).
   - Run this whole step at **minimum token spend**: no play-by-play
     narration of the sync/dedup work, no restating this protocol before or
     after, no prose summary alongside the list — the list itself (short,
     plain-English, one line per entry) is the one required output. This
     file is thousands of lines; sync and dedup via targeted `grep`/section
     reads, not a full read. Only break silence for something that actually
     needs surfacing, like a sync failure or a genuinely ambiguous duplicate.
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
`approved` (ok to merge to main) · `merged` · `dropped` ·
`archived` (parked until after MVP; not listed at "start the queue" unless asked).

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
- **Status:** merged
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
- **Status:** merged
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
- **Status:** merged
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
- **Status:** merged
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
- **Status:** merged
- **Priority:** low
- **Description:** On the splash screen's tutorial-choice buttons (added by
  `splash-tutorial-choice`), rename "Skip" to "Enter" and "Play Tutorial" to
  "Tutorial".
- **Touches:** splash screen (`#splashChoice` buttons).
- **Branch:** `agent/splash-button-labels`
- **Notes:** Synced from Geethub issues #8 and #9 - combined into one entry
  since both are simple label edits to the same two buttons. Its dependency
  (`splash-tutorial-choice`) has now landed on `main`, so this is unblocked.
  Changed only the visible label text on `#splashPlayTutorial` ("Play
  Tutorial" -> "Tutorial") and `#splashSkipTutorial` ("Skip" -> "Enter") in
  `index.html`, plus the three code comments nearby that quoted the old
  button text (for consistency) - left every id/class/handler untouched.
  Commit `6938341`. Verified by serving this worktree's `index.html` with
  `python3 -m http.server` (confirmed via `location.href` that the browser
  was pointed at the worktree copy, not the main checkout), clearing
  `localStorage` to force the first-visit `showSplashChoice()` path, and
  confirming via screenshot/read_page that the buttons render "Tutorial" and
  "Enter". Clicking "Enter" set `ebbless_onboarding_complete=true` and
  dropped straight into the library view (returning-visitor path);
  reloading fresh and clicking "Tutorial" called `runIntro(false)` with
  `#onbMusic` playing (`intro-theme.mp3`), confirmed by screenshot mid-intro.
  No new console errors from the app itself - the only console errors seen
  ("unknown error fetching the script") don't correspond to any failing
  request in the network log for this origin, so they're a pre-existing
  browser-pane/extension artifact, not something this change introduced.

### tutorial-i-tried-it-album: "I Tried It" tutorial sample should show as a two-track album
- **Status:** merged
- **Priority:** medium
- **Description:** The "I Tried It" sample shown in the onboarding tutorial
  is actually an album - it should display as such, showing both tracks,
  matching how it appears in the real Spotify album.
- **Touches:** onboarding/tutorial flow, tutorial sample data.
- **Branch:** agent/tutorial-i-tried-it-album
- **Notes:** Synced from Geethub issue #11. Fixed and pushed (commit
  `ed129ca`): the demo sample data lived in `index.html`'s
  `runIntro()` as three flat consts (`DEMO_ART`/`DEMO_TITLE`/`DEMO_ARTIST`/
  `DEMO_TRACK`, ~line 6479) feeding `showLoadedLibraryCard()` and
  `showLoadedLibraryPanel()`, which hardcoded a "1 track" library card and a
  single track-row in the playlist panel. Replaced with a `DEMO_TRACKS`
  array of two track objects (same `{title, artist, art}` shape a real
  loaded playlist's `pl.tracks` entries use elsewhere in the app, e.g.
  `toggleLibraryPlaylistPanel()`'s own `pl.tracks.forEach()` around line
  2858), plus a `DEMO_ALBUM` const for the album/playlist name. The library
  card now reads "2 tracks" and the playlist panel renders both rows,
  mirroring the exact track-row markup the real panel builds. The
  single-track beats (player, lyrics, art-style menu) still show just the
  first track ("I Tried It" - the version already playing there, duration
  5:56 unchanged) since only one track is ever "now playing" during the
  intro. Mirrored the same change in the `?introBeat=` debug-capture
  harness further down the file (`CAP_TRACKS`, used by the `library` and
  `library-panel` capture cases) so it stays consistent with the real
  sequence.

  **Confirmed against the label's own listing** (commit `a9b06fb`):
  checked Wind Horse Records' Bandcamp page and web-search aggregation
  directly - this is a two-track release, "I Tried It (Original Mix)"
  5:56 and "I Tried It (Radio edit)" 3:34 (lowercase "edit", not "Edit" -
  fixed a casing mismatch from the initial guess). Apple Music's own
  listing treats it as a single; Spotify's web player is a JS SPA that
  doesn't expose its track list to a plain fetch, but the label's own page
  is the authoritative source for its own release and the durations match
  what the tutorial already had hardcoded.
- **Verified:** Syntax-checked (`node -e "new Function(...)"` over the
  extracted `<script>` block - no errors). Loaded the file in a live
  browser preview (a plain `python3 -m http.server` over this worktree, not
  the main checkout) and exercised both the real timed intro (`?intro=1`)
  and the deterministic debug beats (`?introBeat=library` /
  `?introBeat=library-panel`): the library card now shows "2 tracks", the
  playlist panel shows both "I Tried It" and "I Tried It (Radio edit)" rows
  with the correct artist/art, and the rest of the sequence (paste/load
  beats, player, art-style menu, captions/timing) played through
  unaffected. No new console errors or failed network requests against the
  worktree's own server; the console/network noise seen during testing
  traced to unrelated stale tabs/servers left over from other concurrent
  sessions on this machine, not this change.

### tutorial-caption-timing: Onboarding captions overlap ("smooth" / "no ads ever")
- **Status:** merged
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
- **Status:** merged
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

### bug-report-button: Settings email button should say "Report a bug"
- **Status:** merged
- **Priority:** medium
- **Description:** In Settings, change the existing email/contact button's
  label (and framing) to "Report a bug".
- **Touches:** Settings screen, the email/contact button.
- **Branch:** agent/settings-cleanup
- **Notes:** Synced from Geethub issue #14. Bundled with
  `settings-install-button` and `remove-brand-guidelines` into one
  `agent/settings-cleanup` lane (all three touch the Settings screen) to
  save on separate agent spin-up overhead. Fixed and pushed (commit
  `d36f357`): the row's `<div class="label">` already read "Report a bug"
  (from an earlier, unrelated intro-sequence change), but the button
  itself — the actual clickable `<a class="btn-ghost" href="mailto:...">`
  — still said "Email". Changed its text to "Report a bug"; the
  `mailto:sumtinels@gmail.com?subject=EBBLESS%20bug%20report` href and
  behavior are untouched. Verified via a local `python3 -m http.server`
  served directly from this worktree (confirmed via `location.href` in
  the page, not the shared preview launcher), opened Settings, and
  confirmed the button now reads "Report a bug". No console errors beyond
  the two pre-existing, unrelated "unknown error fetching the script"
  messages present before this change.

### splash-install-delay: Delay splash install button 2-3s after logo
- **Status:** merged
- **Priority:** medium
- **Description:** On the splash page, the install button (added by
  `mobile-install-button`, merged) should wait about 2-3 seconds after the
  logo appears before it shows, instead of appearing immediately.
- **Touches:** `index.html` `startApp()`'s mobile splash block (~line 6310,
  inside the `isMobileUA && !isStandaloneDisplay()` branch) — wrapped the
  existing `is-install` class add / tap handler / `appinstalled` listener /
  stranded-visitor timeout in a `setTimeout(..., INSTALL_INVITE_DELAY_MS)`
  instead of running them synchronously alongside `is-active`.
- **Branch:** agent/splash-links-fixes
- **Notes:** Synced from Geethub issue #15. Refinement of the already-merged
  `mobile-install-button` work, not a duplicate of it. Bundled with
  `stale-track-links` into one `agent/splash-links-fixes` lane to save on
  separate agent spin-up overhead. Commit 702f7d6. Added
  a 2500ms delay and a guard that skips showing the invite if the splash was
  already hidden (backgrounded/dismissed) before the timer fires. Verified
  with a mobile-viewport browser check against this worktree's own static
  `index.html` (not the shared preview launcher): polled `#splash`'s
  classList at intervals after a simulated cold launch and confirmed it
  carried only `is-active` through ~2.3s, then gained `is-install` once the
  2.5s delay elapsed (screenshot + DOM checks both match). No new console
  errors vs. before the change (the only console errors present, both
  before and after, are the pre-existing sandboxed YouTube iframe API script
  block and a vibrate-without-gesture warning, unrelated to this change).

### stale-track-links: Some resolved track links are stale/outdated
- **Status:** merged
- **Priority:** medium
- **Description:** Tracks resolved and cached before later link-matching
  protocol changes are now pointing at old/outdated links. Reporter's
  example: "State of Mind" in the "Reetzzz" playlist, installed on mobile
  home screen. These should be re-resolved/updated.
- **Touches:** `index.html` RESOLVE PIPELINE section (~line 2196): new
  `RESOLVE_LOGIC_VERSION` constant stamped as `resolveVersion` onto every
  payload `resolvePlaylist()` writes; new `isResolveStale()` /
  `reResolveStaleInBackground()` helpers after `getCachedPlaylist()`
  (~line 2299); a staleness check in `beginImport()`'s cache-hit fast path
  (~line 3713); a one-time startup sweep over the library in `startApp()`
  (~line 6265).
- **Branch:** agent/splash-links-fixes
- **Notes:** Synced from Geethub issue #16. Commit 01cedc3. There was no
  cache-versioning of any kind on the per-playlist `localStorage` cache
  (`ebbless:playlist:<id>`, keyed by `LS_PL`) before this — a resolved
  playlist just sat there indefinitely. Added a `RESOLVE_LOGIC_VERSION`
  constant and stamp it on every playlist/track payload `resolvePlaylist()`
  produces; `isResolveStale()` flags a cached playlist whose stamp doesn't
  match (skipping `type === 'custom'` playlists — Liked Songs, CURRENT/
  Swell, user-made playlists, Discover overflow — which aren't built by
  `resolvePlaylist()` and have no such stamp to compare). Two triggers
  quietly re-resolve a stale entry in the background and swap the refreshed
  tracks in without disturbing what's on screen, falling back silently to
  the existing cache on failure: opening a stale playlist through
  `beginImport`'s cache-hit path, and a one-time sweep over the library at
  startup (so a playlist played straight from the library/queue, never
  reopened through `beginImport`, still gets caught). Once re-resolved, a
  playlist is stamped current and left alone on every later launch — this
  is a one-time migration per version bump, not a standing "always
  refetch" poll, so it shouldn't cost performance or offline behavior on
  playlists that are already current. Verified end-to-end against this
  worktree's own static `index.html` (not the shared preview launcher):
  seeded a real cached playlist via the app's own starter-library flow,
  stripped its `resolveVersion` in `localStorage` to simulate a
  pre-versioning cache entry, reloaded in a mobile viewport, and confirmed
  the startup sweep silently re-fetched it — `ts` and track `videoId`s
  refreshed and `resolveVersion` restored to current — via the app's live
  backend/YouTube search (this sandbox did have outbound network access to
  the app's Cloudflare Worker backend, so this was a genuine live
  re-resolve, not just a code-path trace). Also confirmed a second reload
  of an already-current-version playlist left its `ts` unchanged (no
  needless re-fetch). What's **not** independently confirmed: the exact
  reporter scenario (the specific "State of Mind" / "Reetzzz" track on a
  real installed-to-home-screen PWA) wasn't reproduced 1:1, since that
  depends on that specific playlist's actual pre-existing cache state on
  the reporter's device, which isn't available here — verification instead
  used a simulated stale entry that exercises the same code path. No new
  console errors vs. before the change.

### settings-install-button: Add install button to Settings screen
- **Status:** merged
- **Priority:** medium
- **Description:** Add an install-to-home-screen button on the Settings
  screen, using the same real install-state detection (not just
  `beforeinstallprompt`) as the splash-screen install button.
- **Touches:** Settings screen's existing "Install" fallback button
  (`installBtn`/`installBlock`, ~line 5756 per the `mobile-install-button`
  note).
- **Branch:** agent/settings-cleanup
- **Notes:** Synced from Geethub issue #17. This is the exact follow-up the
  `mobile-install-button` agent already flagged but never turned into a
  backlog entry: the Settings "Install" button has the identical
  `beforeinstallprompt`-only bug and never shows on iOS. Fix should reuse
  the same `isMobileUA && !isStandaloneDisplay()` gating logic added there.
  Bundled with `bug-report-button` and `remove-brand-guidelines` into one
  `agent/settings-cleanup` lane to save on separate agent spin-up overhead.
  Fixed and pushed (commit
  `d36f357`): the Settings install block previously only revealed itself
  via a `document.addEventListener('ebbless:install-available', ...)`
  listener tied to the Chromium-only `beforeinstallprompt` event, so it
  never appeared on iOS Safari. Reused the exact helpers the
  `mobile-install-button` splash fix introduced (`isMobileUA`,
  `isStandaloneDisplay()`, `isIOS`, `deferredInstallPrompt`,
  `runInstallPrompt()`) rather than reimplementing anything: the block now
  shows whenever `isMobileUA && !isStandaloneDisplay()`, the button
  triggers the native prompt when `deferredInstallPrompt` is available,
  falls back to an in-place "Tap Share, then Add to Home Screen" message
  on iOS (second tap dismisses the block, mirroring the splash button's
  UX), and an `appinstalled` listener hides the block once installed.
  Verified via a local `python3 -m http.server` served directly from this
  worktree (confirmed `location.href` pointed at the worktree copy, not
  the shared preview launcher). Used the browser tool's mobile viewport
  preset (which also emulates an Android Chrome UA) to confirm
  `installBlock.hidden` flips to `false` and the button renders under a
  simulated `isMobileUA && !isStandaloneDisplay()` state, and confirmed it
  stays hidden under the default desktop UA (matching prior
  `isStandaloneDisplay()`-only behavior). Clicked the button in that state
  with no `deferredInstallPrompt` and `isIOS` false and confirmed it's a
  safe no-op (no thrown errors), same as the equivalent splash-button
  path on a non-Chromium, non-iOS mobile browser. No new console errors —
  only the two pre-existing, unrelated "unknown error fetching the
  script" messages present before this change.

### remove-brand-guidelines: Remove brand guidelines from the app
- **Status:** merged
- **Priority:** medium
- **Description:** The brand guidelines content currently shown somewhere
  in the app should be removed — it doesn't need to live in-app.
- **Touches:** wherever brand guidelines are currently surfaced (likely
  Settings/About area) — needs locating.
- **Branch:** agent/settings-cleanup
- **Notes:** Synced from Geethub issue #18. Issue body had no further
  detail; agent will need to locate the actual surface first. Bundled with
  `bug-report-button` and `settings-install-button` into one
  `agent/settings-cleanup` lane to save on separate agent spin-up overhead.
  Located the surface: a "Brand" block at the bottom of
  Settings with a "Brand guidelines" row linking out to
  `brand/brand-guidelines.html` in a new tab. Fixed and pushed (commit
  `d36f357`): removed that entire `settings-block` (heading, row, and
  link) from Settings. Left `brand/brand-guidelines.html` and
  `brand/BRAND.md` themselves in place — they're developer-facing
  reference material (the visual brand manual and its condensed
  developer/agent source of truth, respectively), explicitly linked from
  `README.md`'s project-structure section, not in-app content — so only
  the in-app surfacing was in scope here. Confirmed no other reference to
  `brand-guidelines.html` remained anywhere in `index.html` before
  removing the link. Verified via a local `python3 -m http.server` served
  directly from this worktree (confirmed `location.href` pointed at the
  worktree copy), opened Settings, and confirmed via
  `document.querySelectorAll('h2')` that no "Brand" section renders
  anymore, with the "Library"/"Support" sections immediately adjacent and
  otherwise untouched. No new console errors — only the two pre-existing,
  unrelated "unknown error fetching the script" messages present before
  this change.

### github-issues-status-tabs: GitHub issues repo should have "waiting for deployment" and "completed" views
- **Status:** merged
- **Priority:** medium
- **Description:** The Geethub issues repo (MalGriot/EBBLESS) should have
  views/labels for "waiting for deployment" and "completed" states, so the
  status of a submitted idea is visible from GitHub itself.
- **Touches:** Geethub repo configuration (labels only) — not `index.html`,
  no app code involved, no worktree/branch.
- **Branch:** n/a — done directly against the repo, not a code lane.
- **Notes:** Synced from Geethub issue #19. Done directly (no agent lane
  needed): created two labels on MalGriot/EBBLESS — `waiting-for-deployment`
  (`#fbca04`) and `completed` (`#0e8a16`). **Open tension worth your input:**
  the existing autoclose rule ([[feedback_github_idea_autoclose]]) closes
  every synced idea issue immediately, before any code is built — so these
  labels currently have nothing to attach to, since the issue is already
  closed by the time an entry reaches `waiting-for-deployment` or
  `completed`. Either (a) these labels only ever get used if you manually
  reopen/label an issue you care about tracking, or (b) the autoclose rule
  changes so synced issues stay open and get labeled through the pipeline
  instead of closing at sync time. Left as-is (autoclose unchanged) since
  you didn't ask to change that rule — flagging so you can decide.

### player-button-colors: Player buttons should match play-button color and stay legible against album art
- **Status:** merged
- **Priority:** medium
- **Description:** Merges two overlapping ideas (Geethub issues #20 and
  #21 — see the old `player-button-color-source` and `player-button-contrast`
  entries this replaces) about player buttons being hard to see. Two parts,
  implemented together as one color pipeline rather than two competing
  sources: (1) all player buttons (album art control, cymatics, etc.)
  should use the same color as the play button, instead of each deriving
  its color from the day-color-clock / time-of-day `--accent`; (2) on top
  of that base, buttons should stay legible against the currently-playing
  album art — sample the art's dominant color/brightness, and if it's
  dull/low-contrast, brighten the button color or fall back to white.
- **Touches:** `index.html` CSS `.visual-tabs .v-tab.is-active` and
  `.viz-ctl-btn.is-active` (~line 370 and ~498, switched from `--accent` to
  `--player-accent`); the `PLAYER ACCENT FROM ALBUM ART` JS block (~line
  2544 comment, ~2566 `sampleDominantColor`, ~2634 new
  `ensureLegibleAccent`, ~2651 `updatePlayerAccentColor`).
- **Branch:** agent/player-button-colors
- **Notes:** Found that most player buttons (`.ctl-btn` transport controls
  including the play button itself, seek bar fill/knob, like button, mini
  bar progress, queue "now playing" play button) already read from a
  `--player-accent` CSS var fed by `updatePlayerAccentColor()` /
  `sampleDominantColor()` — an existing canvas-based color-extraction
  helper that samples the currently-loaded album art via a downscaled
  (24x24) probe-image canvas, falling back to the day-color-clock
  `--accent` when there's no art or the image can't be read (CORS). Two
  player-button groups had been left out of that system and were still
  hardcoded to `--accent` directly: the art/cymatics/lyrics view-tab
  switcher (`.visual-tabs .v-tab.is-active`) and the cymatics visualizer's
  pattern/speed/auto controls (`.viz-ctl-btn.is-active`). Switched both to
  `var(--player-accent)` so every player button now shares one base color
  source with the play button, satisfying part 1 without needing a second,
  competing color system.
  For part 2 (contrast), reused the existing `sampleDominantColor()` output
  rather than writing a new sampler: added `ensureLegibleAccent(rgbStr)`,
  called on the sampled color right before it's written to
  `--player-accent`. It computes perceived luminance
  (`0.299r+0.587g+0.114b`); colors at or above a 0.5 luminance floor pass
  through unchanged, colors below that are converted to HSL (new
  `rgbToHsl`/`hslToRgb` helpers, no existing HSL utilities were present in
  the file) and either brightened (lightness raised to a 0.56 floor,
  saturation raised to a 0.45 floor, preserving hue) when there's enough
  saturation to still read as a color, or replaced with flat white `#fff`
  when saturation is under 0.22 (i.e. the art is essentially gray/dull, so
  brightening would just produce muddy gray rather than something legible).
  This only touches the album-art-sampled path — the `--accent`
  color-clock fallback (no art / CORS failure) is left as-is, since it's a
  deliberately tuned brand color rather than an arbitrary photo sample.
  **Verified:** ran a local `python3 -m http.server 8934` directly in this
  worktree (not the shared `preview_start` launcher, per the warning left
  by prior lanes that it can silently serve the main checkout regardless
  of worktree) and confirmed via `location.href` in the browser tool that
  the tab was loading from `127.0.0.1:8934`/this worktree before trusting
  any result. Checked the pure color-math (`rgbToHsl`/`hslToRgb`/
  `ensureLegibleAccent`) standalone in Node first (e.g. `rgb(20,20,20)` →
  `#fff`, `rgb(120,60,40)` → `rgb(199,115,87)`, an already-bright
  `rgb(200,200,200)` passes through unchanged), then confirmed the same
  behavior live in the running app using the standard test playlist: with
  the default `--player-accent` unset, manually setting it via
  `document.documentElement.style.setProperty` and adding `.is-active`
  confirmed `.ctl-btn.main`, `.viz-ctl-btn`, and `.visual-tabs .v-tab` all
  resolve their background to that var. Then played two real tracks: "…
  gasp" (dusty, low-contrast cover) sampled to `rgb(176,78,107)`
  (luminance 0.434, below the floor) and was correctly brightened to
  `rgb(193,92,122)` — confirmed both by directly re-running the sampling
  algorithm against the live artwork URL and by reading the resulting
  `--player-accent` / `.ctl-btn.main` / `.seek-track .fill` /
  `.visual-tabs .v-tab.is-active` / `.viz-ctl-btn.is-active` computed
  background colors, all matching. A second track ("breathe love d e e p")
  sampled to `rgb(188,147,105)` (luminance 0.606, above the floor) and was
  left unchanged, confirming the pass-through path. Screenshot of the
  player view for the first track shows the play button, active view tab,
  and progress bar all rendering the same warm, clearly-visible rose/tan
  tone against the dark UI — matching the album art's palette rather than
  the unrelated day-color-clock gold.
  **Caveat:** while iterating I hit a false negative where a stale browser
  tab kept showing the pre-fix (unbrightened) color after an edit +
  server-restart cycle even though the served file was already correct
  (opening a fresh tab and re-navigating resolved it immediately) — this
  looked like a service-worker cache at first (the app does register
  `sw.js`) but no registration or cache actually existed at the time, so
  the more likely explanation is stale in-memory JS in a tab that was
  never fully reloaded; worth a hard refresh if verifying this again and
  results look surprising. No open questions on the implementation itself.

### mobile-background-resume: App restarts to splash after switching apps on mobile
- **Status:** merged
- **Priority:** high
- **Description:** On mobile, switching away from the app (e.g. to another
  app) and back pauses the music and restarts the app from the splash
  page, instead of resuming where it was.
- **Touches:** mobile lifecycle handling (`visibilitychange`/`pagehide`
  equivalents), app state persistence across backgrounding, splash-screen
  re-trigger logic.
- **Branch:** `agent/mobile-background-resume`
- **Notes:** Synced from Geethub issue #22. The existing
  `visibilitychange` listener (~line 5895) was already reasonably careful -
  it persists resume state and a `wasPlayingBeforeHide` flag on hide, and on
  return either calls `resumePlayback()` (iOS suspends the YouTube iframe's
  underlying `<video>` on lock/background even though the `keepAliveAudio`
  element keeps the lock-screen transport looking alive) or, past a
  deliberate 10-minute `BACKGROUND_RESET_MS` threshold, does an explicit
  `location.reload()`. That reload path isn't the actual bug: mobile
  browsers/PWAs (iOS Safari standalone home-screen apps especially) kill the
  whole page process under memory pressure and silently reload from scratch
  the moment the user switches back - routinely well inside that 10-minute
  window, since it needs a *live* JS process to even reach the timer logic.
  From `startApp()`'s point of view that's indistinguishable from a genuine
  cold launch, and `startApp()` (line ~6120) unconditionally replayed the
  full branded `#splash` logo/reveal animation (`is-active`, held for
  `SPLASH_MS` = 3400ms, longer with the mobile install-prompt flow) on every
  call - there was no "this is a resume, not a first launch" signal for it
  to check, so every backgrounded-and-returned session looked to the user
  like the app had restarted from scratch. This is the same shape of bug as
  `mobile-tutorial-load` (a gate that fires unconditionally where it should
  only fire on true first-visit), just on the branded splash rather than the
  onboarding intro.

  **Fix:** the hide-side of the `visibilitychange` handler already wrote
  `LS_BACKGROUNDED_AT` (timestamp) to `localStorage`; added a matching
  `LS_WAS_PLAYING` key written alongside it, since the in-memory
  `wasPlayingBeforeHide` variable doesn't survive a real process kill.
  `startApp()` now reads both back at the very top: if `LS_BACKGROUNDED_AT`
  is set and recent (under `BACKGROUND_RESET_MS`, i.e. the visit is
  functionally a resume rather than a stale reopen), it skips the `is-active`
  reveal entirely and just marks `#splash` `is-hidden` directly (it's opaque
  and visible-by-default as a no-FOUC cover, so it still has to be
  dismissed, just without the animation/install-prompt dance), and - after
  `tryResume()` restores the queue/track - makes a best-effort
  `resumePlayback()` call if `LS_WAS_PLAYING` was true. Both keys are
  cleared immediately after being read so a later *genuine* cold launch (or
  a background gap past the 10-minute threshold) still gets the normal
  splash. A true first-ever visit (verified in a fresh tab with no prior
  `LS_BACKGROUNDED_AT`) is unaffected - `#splash` still gets `is-active`
  and plays its full reveal.

  **Verified:** ran `python3 -m http.server` directly from this worktree
  (not the shared preview-tool launcher, per a prior lane's caution that it
  can serve the main checkout regardless of worktree) and confirmed via
  `location.href` in the browser tool that the page under test was this
  worktree's `index.html`. In a 375x812 mobile viewport: (1) a genuine
  fresh tab with no prior background state still shows the full splash
  (`is-active` present) - cold launch unaffected; (2) with onboarding
  marked complete and `artworkWrap` given `is-playing`, dispatching a
  `visibilitychange` to `hidden` correctly wrote `LS_BACKGROUNDED_AT`/
  `LS_WAS_PLAYING` to `localStorage`; (3) reloading the page (simulating the
  OS killing and reopening the page on app-switch return) resulted in
  `#splash` going straight to `is-hidden` with `is-active` never set - no
  splash flash - and both localStorage flags were read and cleared as
  expected. No new console errors from the change; the only console errors
  present ("An unknown error occurred when fetching the script") are
  pre-existing YouTube iframe-API fetch failures caused by this sandbox
  having no real network access to youtube.com, reproduced identically on
  a plain cold load with no backgrounding involved, so they're unrelated to
  this fix.
  **Caveat:** couldn't exercise the real YouTube iframe/audio resume itself
  in this sandbox (no network access to actually load a player), so
  `resumePlayback()`'s effect on real audio is unverified here - browsers
  may also still block autoplay-without-gesture on a fresh page load
  regardless, in which case the user would still need one tap to resume
  sound even though the app now correctly avoids re-showing the splash and
  restores the track/queue UI. Worth a real-device check once this merges.

### player-controller-centering: Desktop player/controller is missing/off-center, not centered
- **Status:** merged
- **Priority:** medium
- **Description:** On desktop, there's no player/controller visible centered
  in the UI at all (not just off to one side) - just blank space where it
  should be. Investigate why it's not rendering/positioned there and fix so
  the player/controller appears centered in the desktop layout.
- **Touches:** `index.html` ~line 825-859, the `@media (min-width:1150px)`
  "split-desktop" 3-pane grid block - added `min-height:0` to the
  `#view-library`/`#view-player` rule and the `#queue-panel` rule. Also
  `index.html:57`, `#ambient`'s `z-index` (`0` -> `-1`).
- **Branch:** agent/player-controller-centering
- **Notes:** Synced from Geethub issue #23. Reporter clarified (2026-09-18):
  it's not just off-center, there's no center player visible at all on
  desktop. Checked against existing entries - distinct from
  `player-button-colors` (that one is about button color/contrast on an
  existing, visible player, not this one's absence/positioning), no overlap
  found.

  Root cause: the `>=1150px` "split-desktop" layout (added in `6957871`,
  well before this session) places `#view-library`, `#view-player` and
  `#queue-panel` as `position:static` grid items sharing one
  `grid-template-rows: var(--topbar-h) 1fr` row, but never gave any of them
  `min-height:0`. Grid items default to `min-height:auto`, which resolves to
  the item's own content height whenever its overflow is visible in that
  axis - and `#queue-panel` has no vertical overflow constraint of its own
  once it's turned into a static grid item (its normal fixed-position
  top/bottom sizing, and the internal `.queue-scroll{overflow-y:auto}` that
  depends on it, don't apply). With only a couple of queued tracks this went
  unnoticed, but with a real queue loaded (the common case - e.g. an
  8-10-track album) `#queue-panel`'s un-scrolled content forced the shared
  grid row to grow to match it (1424px measured against an 800px-tall
  viewport in testing), stretching `#view-player` right along with it. The
  player content itself then rendered far below the visible viewport, and
  `#app`'s own `overflow:hidden` silently clipped all of it away - so the
  whole player/controller (artwork, seek bar, transport buttons) vanished
  with no visible trace or console error.

  Fix: added `min-height:0` to the `#view-library`/`#view-player` rule and
  the `#queue-panel` rule inside the `@media (min-width:1150px)` block, so
  each pane is forced back to the grid row's actual (viewport-bounded,
  stretched) height instead of the row growing to fit whichever pane has
  the most content; each pane's own overflow/scroll behavior (queue's
  internal `.queue-scroll`, view-player's `overflow-y:hidden`) then takes
  over as intended.

  Verified with a real browser check, served from this worktree's own
  `index.html` via `python3 -m http.server` (not the shared preview
  launcher, per the multi-session note in `CLAUDE.md`) at a 1280x800
  desktop viewport: loaded the "breathe love d e e p" album (10 tracks) to
  populate the queue. Before the fix, `#view-player .view-scroll` and
  `#queue-panel` both measured 1424px tall (vs. an 800px viewport) and
  `.transport-full` sat at y=1053-1137, entirely past the visible area.
  After the fix, both measure exactly 740px (the actual grid-row height)
  and every transport control
  (`#shuffleBtn`/`#prevBtn`/`#playBtn`/`#nextBtn`/`#repeatBtn`) falls fully
  within the viewport, properly centered under the artwork. Also confirmed
  the non-split desktop layout (860-1149px width) was unaffected and still
  renders/centers correctly. No new console errors versus before the fix
  (the only console errors present in both cases are a sandboxed-network
  YouTube iframe API script-fetch failure, unrelated to this change).

  **Follow-up (2026-09-21):** the user reported the controls were *still*
  missing after the above fix ("need the controls. all of them"). Re-tested
  at a shorter, equally-common desktop height (1280x720, vs. the 1280x800
  used above) and reproduced it: the seek bar rendered but every transport
  button (shuffle/prev/play/next/repeat) was fully invisible and
  unclickable, even though `getBoundingClientRect()` said each button's box
  was inside the viewport. `document.elementsFromPoint()` at the play
  button's own center returned `#ambient` (the fixed decorative background
  layer) as the topmost hit, not the button - despite `#ambient` appearing
  earlier in the DOM. Root cause: `#ambient` is `position:fixed` with
  `z-index:0`; per CSS stacking rules, *any* positioned element (regardless
  of z-index value or DOM order) paints above plain non-positioned in-flow
  content. The transport buttons, seek bar, and their containers in the
  player view are all `position:static`, so `#ambient` was rendering on top
  of them - swallowing both their pixels and their clicks. This is separate
  from the grid `min-height:0` bug above (that one controlled *whether the
  row was tall enough to contain the controls at all*; this one controls
  *what paints on top once they're in the visible area*) - it only became
  reachable/testable after the min-height:0 fix stopped pushing the whole
  row far below the fold. The artwork image happened to escape this by
  luck: `.artwork-wrap` has its own `position:relative`, which promotes it
  into the same positioned-elements paint tier as `#ambient`, where later
  DOM order wins.

  Fix: changed `#ambient`'s `z-index` from `0` to `-1` (`index.html:57`).
  This matches a convention already used elsewhere in this file for
  exactly this kind of decorative fixed background - `.lib-bg` (the
  library view's equivalent backdrop) is already `z-index:-1` - so `#ambient`
  was the inconsistent one. A negative z-index guarantees it paints behind
  *all* other content unconditionally, regardless of any other element's
  own position/z-index, rather than depending on which elements happen to
  be positioned.

  Verified: reloaded the worktree's own `index.html` at 1280x720 (no prior
  browser fix applied) and reproduced the invisible/unclickable buttons via
  `document.elementsFromPoint()`. After the fix, `read_page`/`find` locate
  Shuffle, Previous, "Play or pause", Next, and Repeat as normal reachable
  buttons, and a full-viewport screenshot shows all five rendered and
  centered under the seek bar, both with an empty queue and with a real
  loaded album. No new console errors.

  Pushed to `agent/player-controller-centering` (commits `c08bef7`,
  `d6de2d6`); not merged - left for review per the session's instructions.

### app-down-splash-blocked: App stuck on splash, never loads past it
- **Status:** merged
- **Priority:** high
- **Description:** Reporter says the app hasn't gotten past the splash page
  on mobile since roughly Fri/Sat (check the date of the most recent synced
  idea before this one for the exact window), across different mobile
  browsers and incognito - but working on desktop Chrome. Separately, the
  splash's "Tutorial"/"Enter" buttons have been reported as going nowhere.
  Investigate whether these are the same regression (a splash-flow bug
  blocking progression) or two different bugs.
- **Touches:** splash/onboarding flow (`startApp()`, `showSplashChoice()`,
  the `mobile-background-resume` and `splash-tutorial-choice` code this
  overlaps with).
- **Branch:** `agent/app-down-splash-blocked`
- **Notes:** Synced from Geethub issues #83 (high priority, app down) and
  #28 (splash buttons go nowhere - same symptom, folded in here rather than
  a separate entry). This is a live bug affecting real usage - highest
  priority in this sync per the "bugs before features" rule (issue #48,
  folded into "How this works" below).

  Confirmed one real bug is the cause of both reports, and fixed it.
  `showSplashChoice()` (added by `splash-tutorial-choice`, commit `3c1873d`,
  still present on `main`) hides `#onbBackdrop`/`#onbMark`/`#onbSkip` so
  they don't sit on top of the splash choice buttons - but it never hid
  `#onbCapture`, a separate piece of the intro's static markup: an
  invisible, full-viewport, `position:fixed;z-index:10005` tap-catcher
  (`<button id="onbCapture">`, meant to let a tap anywhere skip the intro
  once `runIntro()` is running and has wired up its click handler). Before
  `runIntro()` ever runs - i.e. exactly the moment `showSplashChoice()` is
  showing "Tutorial"/"Enter" - `#onbCapture` has no listener attached yet,
  but it's still the topmost element at every point on screen, `#splash`
  (z-index 9999) included. Every tap on either button was hitting this dead
  button instead and doing nothing: no error, no console output, just a
  swallowed tap. Confirmed via `document.elementFromPoint()` at both
  buttons' coordinates - it resolved to `onbCapture`, not the button -
  and via a dispatched pointerdown/mousedown/pointerup/mouseup/click
  sequence at those coordinates, which also landed on `onbCapture` and did
  nothing.

  This also explains bug #1 without needing a second cause: a fresh/
  incognito mobile visit always has `ebbless_onboarding_complete` unset, so
  `showSplashChoice()` runs on *every* load, and both choices were broken -
  there was no way to get past the splash, on any mobile browser, in
  incognito, ever. Desktop Chrome most likely worked because that browser
  already had the onboarding flag set from before `splash-tutorial-choice`
  existed (or from an earlier successful run), so it takes the
  `onboardingComplete` branch at the bottom of the script straight into
  `startApp()` and never reaches `showSplashChoice()` at all - consistent
  with "fine on desktop Chrome, broken everywhere fresh." No separate
  regression in `mobile-background-resume`'s visibilitychange/backgrounding
  logic was found or needed to explain either report.

  Fix: added `onbCapture` to the element list `showSplashChoice()` hides
  before showing the choice buttons (and to the list it restores on the
  "Tutorial" path before handing off to `runIntro()`, which manages
  `onbCapture` itself from there). See `index.html`'s `showSplashChoice()`.

  Verified in a mobile-viewport browser check served directly from this
  worktree (`python3 -m http.server`, confirmed via `location.href` before
  trusting any result - not the shared preview launcher, per this backlog
  entry's own warning about it silently serving the main checkout).
  Before the fix, `elementFromPoint()` at both button centers returned
  `onbCapture`; after the fix it returns the actual button
  (`splashSkipTutorial` / `splashPlayTutorial`), and a simulated real tap
  (pointerdown -> mousedown -> pointerup -> mouseup -> click at the
  button's own coordinates, not a programmatic `.click()`, which bypasses
  hit-testing and would have "worked" even with the bug present) correctly
  completes both paths: "Enter" hides the splash and sets
  `ebbless_onboarding_complete`; "Tutorial" starts `runIntro()`
  (`body.onb-active` engaged). No new console errors introduced by the fix.

### link-match-accuracy: Wrong-track matches - use album art image comparison + study source meta tags
- **Status:** merged
- **Priority:** high
- **Description:** Multiple reports of badly wrong YouTube matches (e.g.
  "Lava Lamp" by Thundercat resolved to an unrelated 270-minute meditation
  track; "Spottieottiedopalicious" resolved to a different song entirely).
  Two concrete improvements requested: (1) when resolving a Spotify/Apple
  Music track to a YouTube link, fetch the Spotify album art first and
  verify the candidate YouTube video's thumbnail actually matches it before
  accepting the match; (2) audit what metadata/meta-tags are currently being
  pulled from Spotify and Apple Music for matching, to find further
  improvement opportunities.
- **Touches:** RESOLVE PIPELINE / track-matching logic in `index.html` and
  the worker backend's YouTube search/matching code.
- **Branch:** `agent/link-match-accuracy`
- **Notes:** Synced from Geethub issues #70, #74, #81, #31. Distinct from
  `stale-track-links` (merged) - that fixed *cached, outdated* matches after
  a protocol change; this is about the *matching algorithm's* accuracy on
  fresh resolves. High priority - reporter called a bad match "severely
  wrong, needs to absolutely never happen again."

  **Investigation:** The worker (`worker/src/index.js`) already had a
  fairly sophisticated matcher: a title-token-overlap hard filter, a
  hard-exclude list for live/acoustic/remix/cover/karaoke uploads, and -
  critically - a duration-based hard filter + scoring bonus
  (`durationScore`/`DURATION_HARD_DIFF_SECONDS`, added in an earlier commit,
  `7332eb8`). All of Spotify's title/artist/duration/album-art metadata
  the app fetches was already in play *in principle*. Apple Music tracks
  carry title/artist/art but the worker's Apple Music scrape
  (`handleAppleMusicList`/`handleAppleMusicTrack`) never pulls a duration
  field out of Apple's page data at all - nothing to compare there yet.

  **Root cause found:** the duration signal was silently dead for the
  common case. `resolvePlaylist()`'s per-track loop (every multi-track
  Spotify playlist/album import) and `resolveTracksFromLink()`'s Spotify
  branches (the "+ Add song/playlist" flow) called
  `searchYouTube(title, artist)` without the third `sourceDurationMs`
  argument, even though the source track's duration was already sitting on
  the track object. Only the single-track resolve path passed it. So for
  playlists - where these bug reports almost certainly came from - the
  worker's duration hard-filter and scoring bonus never activated, leaving
  only title-token overlap as a safety net. That net has a hole: when
  Spotify's and YouTube's title spelling diverge enough to share zero
  significant tokens (confirmed live: Spotify's "Spottieottiedopalicious"
  vs. YouTube's actual "SpottieOttieDopaliscious" upload share none), the
  title-overlap filter's fallback-to-unfiltered-pool behavior kicks in and
  a same-artist, wrong-song, high-view-count video can win outright.

  **Changed:**
  1. `index.html`: pass the source track's duration through to
     `searchYouTube()` in `resolvePlaylist()`'s bulk loop and in
     `resolveTracksFromLink()`'s Spotify single-track and playlist/album
     branches (SoundCloud/Apple Music branches left as-is - see below).
  2. `worker/src/index.js`: the duration hard-filter was a flat 90s
     absolute difference regardless of track length - fine for a 5-minute
     song (~30% tolerance) but nearly meaningless against a 270-minute
     mislabeled upload. Changed to
     `min(90s, max(30s, 20% of source duration))` so short tracks get a
     proportionally tighter net while longer tracks keep the wider 90s
     absolute margin (intros/fades on long tracks need more slack than a
     flat percentage would give).
  3. Bumped `SEARCH_CACHE_VERSION` (worker scoring change) and
     `RESOLVE_LOGIC_VERSION` (client re-resolve trigger) so playlists
     already cached with a wrong match get quietly re-resolved instead of
     serving the stale bad link indefinitely.

  **Verified live**, not just traced: ran `worker/src/index.js` for real
  via `wrangler dev --local` (network access was available in this
  session) and hit the actual `/search` endpoint against live YouTube
  search:
  - `Spottieottiedopalicious` / OutKast **without** duration: matched
    `"Outkast - ATliens (Official HD Video)"` - reproduces the reported
    bug exactly, live, on current `main` behavior.
  - Same query **with** `durationMs` (the fix): correctly matched
    `"SpottieOttieDopaliscious"`.
  - `Lava Lamp` / Thundercat: both with and without duration currently
    return a correct-looking match (`"[Lyrics+Vietsub] Thundercat - Lava
    lamp"`, 179s vs. the real ~191s track) - the specific 270-minute
    meditation-track result from the report doesn't reproduce today
    (YouTube's live index has likely shifted since the report), but the
    new percentage-based duration filter would reject a candidate that far
    off regardless of source track length, and the duration fix closes the
    same *class* of bug either way.
  - Sanity-checked normal tracks to confirm no regression: `Blinding
    Lights` / The Weeknd and `Bohemian Rhapsody` / Queen both still
    resolve to the correct official audio/video with duration passed.

  **Not done - thumbnail/album-art image similarity:** investigated and
  concluded infeasible without a heavy new dependency, per the task's own
  constraint. Cloudflare Workers have no native image-decoding API (no
  `Canvas`/`ImageData`/`OffscreenCanvas` in the runtime); comparing a
  Spotify cover to a YouTube thumbnail for real (even a cheap perceptual
  hash) requires decoding JPEG/PNG bytes first, which means pulling in a
  WASM image codec - exactly the "heavy new dependency" the task asked to
  avoid. Given the duration fix directly reproduces and fixes the
  higher-profile reported case live, it was prioritized as the
  highest-leverage, lowest-risk change; image comparison is left as
  future work if the team decides the dependency weight is worth it.

  **Also not done:** wiring duration through for SoundCloud and Apple
  Music sources - neither the worker's SoundCloud (`handleSoundCloud`) nor
  Apple Music (`handleAppleMusicList`/`handleAppleMusicTrack`) responses
  currently include a duration field at all, so there's nothing on the
  client track object to pass yet. Adding it would need scraping/parsing
  each source's own duration field (SoundCloud's v2 API likely has one;
  Apple Music's dehydrated page JSON shape wasn't confirmed) and wasn't
  attempted here to avoid guessing at an unverified field mapping - flagged
  as a natural follow-up, not needed to fix the two reported cases (both
  were Spotify).

### track-relink-menu: Per-track "refresh this link" menu with thumbnail choices
- **Status:** merged
- **Priority:** medium
- **Description:** Each track row in a playlist should have a hold/long-press
  menu with a "refresh link" option. Selecting it opens a picker showing 3-5
  alternative YouTube candidates, each with its actual video thumbnail, so
  the listener can manually pick the right one.
- **Touches:** playlist track-row UI, RESOLVE PIPELINE (needs a
  multi-candidate search mode, not just top-1).
- **Branch:** agent/relink-menus
- **Notes:** Synced from Geethub issue #69. Complements `link-match-accuracy`
  (automatic improvement) as a manual fallback for when auto-matching still
  gets it wrong.

  **Implementation:** extended the worker's `/search` endpoint
  (`handleSearch` in `worker/src/index.js`) rather than adding a second
  endpoint - it now also returns a `candidates` field with the top 5 scored
  results from the same pool/scoring pass that already picks the top-1
  match, so no second search round-trip is needed. Purely additive: existing
  callers that only read `videoId`/`title`/`channel`/`duration` are
  unaffected.

  On the client, added a shared per-track context menu (`trackCtxMenu` in
  `index.html`, same floating-panel pattern as the existing library-card
  `libCtxMenu`) with a single "Refresh link" item today. It's reachable two
  ways: a hold/long-press (`attachLongPress`) on the row itself - wired into
  both the main tracklist (`renderTrackList`) and the Library playlist panel
  (`toggleLibraryPlaylistPanel`) - and, on the main tracklist only, a kebab
  button for desktop/mouse users who have no long-press gesture. Long-press
  works even on a track with no match yet (`videoId` null / "Couldn't find
  this one" rows), which is exactly when a manual refresh matters most.

  "Refresh link" opens `openRefreshLinkPicker()`, which reuses the existing
  `import-overlay` modal (same one `openReplaceLinkFlow` etc. use) and calls
  the existing `searchYouTube()` - now reading its `.candidates` field
  (falling back to a single-item list built from the top-1 fields if an
  older/un-updated backend response has none, so the picker still shows
  *something* rather than breaking). Each candidate renders with its real
  YouTube thumbnail (`img.youtube.com/vi/<id>/mqdefault.jpg`), title,
  channel, duration, and the currently-linked one is flagged "current".
  Picking a candidate (`applyRelinkChoice`) updates that track's
  `videoId`/`matchedTitle`/`channel`/`duration` in the cached playlist,
  re-renders, and toasts "Link updated".

  **Verified:** worked through the whole flow live against a real playlist
  in this worktree's own copy of `index.html`, served directly from this
  checkout via `python3 -m http.server` (confirmed via `location.href` in
  the browser, not a shared preview) - long-pressed a track row to confirm
  the menu opens and stays open, opened the picker, and confirmed 3-5
  distinct candidates render with working thumbnails. Since the deployed
  Worker (`spotify-youtube-search.malgriot.workers.dev`) doesn't have this
  change yet, the multi-candidate path itself was verified against
  `wrangler dev --local` (temporarily pointing `BACKEND` at
  `http://localhost:8787`, then reverting that before committing - the
  committed `index.html` still points at the real deployed Worker).
  Confirmed via `curl` against `wrangler dev --local` that `/search` returns
  5 distinct, correctly-scored candidates, and via the browser that picking
  a non-default candidate persists the new `videoId`/`matchedTitle`/
  `channel`/`duration` into `localStorage`. No new console errors from
  either code path. **Not deployed** (`wrangler deploy` not run) - like
  other worker-touching entries in this file, deploy is your call; until
  then the picker will still work but only ever show one candidate (the
  existing top-1 fields, via the fallback above) against the live backend.

### playlist-relink-all: Playlist-level "refresh all links" option
- **Status:** merged
- **Priority:** medium
- **Description:** The playlist hold-menu (in Library) should have an option
  to refresh/re-resolve the links for every track in that playlist at once.
- **Touches:** playlist hold-menu UI, RESOLVE PIPELINE.
- **Branch:** agent/relink-menus
- **Notes:** Synced from Geethub issue #68. Related to `track-relink-menu`
  (same idea, per-track vs. whole-playlist) and `stale-track-links` (merged,
  automatic background version of this).

  **Implementation:** added a "Refresh links" item to the existing playlist
  context menu (`openLibCtxMenu` in `index.html`, the 3-dot/hold menu on
  each Library card), hidden for `type === 'custom'` playlists (Liked
  Songs, CURRENT/Swell, user-made, Discover overflow) since those aren't
  backed by a source link `resolvePlaylist()` can re-fetch against - same
  guard `isResolveStale()` already uses. Picking it calls a new
  `manualRelinkPlaylist(id)`, which is deliberately thin: it calls the same
  `resolvePlaylist(id, pl.type, ...)` that `reResolveStaleInBackground()`
  (from `stale-track-links`) already uses for the automatic version, just
  invoked directly on user demand instead of gated on `resolveVersion`
  being stale - with a "Refreshing links…" / "Links refreshed" toast pair
  around it (or a "Couldn't refresh links right now." toast on failure)
  since this is a direct user action rather than a silent background one.
  No changes needed to the RESOLVE PIPELINE itself - it already re-fetches
  the source tracklist and re-searches every track, manual tracks
  (`withManualTracks`) included.

  **Verified:** live in this worktree's own served copy of `index.html`
  (same server/browser session as `track-relink-menu` above). Opened the
  Library context menu on a real Spotify-backed playlist, confirmed
  "Refresh links" appears (and confirmed the hide-for-custom-playlists
  guard reads correctly against `isResolveStale`'s same check), clicked it,
  saw the "Refreshing links…" toast, and after resolution completed
  confirmed in `localStorage` that the playlist's `ts`/`resolveVersion` were
  bumped and a track that had been manually relinked via
  `track-relink-menu`'s picker moments earlier was correctly overwritten
  back to the pipeline's own top-scored match (expected: a full relink-all
  is a fresh resolve, not a merge with prior manual per-track picks). No
  new console errors.

### playlist-full-loading: Fix greyed-out / missing tracks - target 100% playlist loading
- **Status:** merged
- **Priority:** high
- **Description:** Reporter says a lot of tracks show up greyed-out/missing
  from loaded playlists, wants every track to resolve successfully.
- **Touches:** RESOLVE PIPELINE, `beginImport()`, track resolution failure
  handling.
- **Branch:** agent/playlist-full-loading
- **Notes:** Synced from Geethub issue #59. Related to `link-match-accuracy`
  - both are about resolve-pipeline reliability, but this is about tracks
  failing to resolve at all vs. resolving to the wrong thing. Worth
  investigating together.

  **Investigation findings (worker/src/index.js, `handleSearch`):**
  reproduced against the real, unmocked `/search` endpoint (`wrangler dev
  --local`, no mocking) and found the dominant root cause: YouTube
  intermittently answers `youtube.com/results` with a redirect into a
  Google bot-check/consent interstitial instead of serving results - and a
  short burst of `/search` calls in quick succession (exactly what a
  multi-track playlist's resolve loop produces) was enough to trigger it
  repeatedly in testing, even with the app's own `CONSENT` cookie already
  set. Cloudflare's `fetch()` follows redirects by default, and that
  interstitial sometimes redirects through a chain long enough for the
  runtime to give up ~7s later with an opaque "Too many redirects"
  `TypeError`, which fell through the worker's top-level catch-all as an
  unhelpful, slow 500 - indistinguishable from a genuine bug, and far too
  slow for the client's existing retry-with-backoff (`SEARCH_MAX_ATTEMPTS`
  in index.html) to absorb cheaply across a whole playlist. This is what
  was producing runs of consecutive greyed-out tracks once the block was
  hit mid-playlist, rather than isolated one-off misses.

  Fixed by fetching YouTube's search/watch pages with `redirect: 'manual'`
  (new `fetchYouTubePage` helper) so a redirect-to-interstitial is detected
  and fails in one round-trip instead of chasing the chain - paired with
  one quick, quiet internal retry inside the worker (the block was
  intermittent, not sticky: a request moments later usually went through
  clean) before surfacing a specific, fast 503 the client can distinguish
  and retry. Applied to both `/search` (the hot path, hit once per track)
  and `/ytvideo` (direct YouTube-video imports).

  Secondary, smaller fix: `handleSearch` now retries once with a relaxed
  query (`relaxedSearchTitle` - strips `(...)`/`[...]` and "feat./ft."
  clauses) when the full-title query comes back with **zero** results,
  since an over-specific title can occasionally pull YouTube's own search
  away from the plain song entirely. In testing this rarely triggered - the
  redirect/bot-check above was the real cause of failures, not title
  shape - but it's a real gap this closes as defense in depth (e.g.
  remix/feature-heavy titles). Verified the previously-existing
  match-scoring logic (`scoreCandidate`, exclude/duration/title-overlap
  filters) is untouched, so this doesn't affect wrong-match cases owned by
  `link-match-accuracy`.

  **Verification:** with the fix applied, ran ~99 real `/search` requests
  against the local worker (isolated burst tests up to 30 tracks at 8-way
  concurrency, plus a full end-to-end resolve of the standard 32-track test
  playlist through `index.html` served via plain `python3 -m http.server`,
  confirmed via `location.href` to be this worktree's own server) - zero
  4xx/5xx and 32/32 tracks resolved with a real `videoId` (100%), versus
  the pre-fix run hitting the redirect-block failure repeatedly within the
  first ~10 requests. `BACKEND` was pointed at `localhost:8787` only for
  that manual browser check and reverted before committing (confirmed via
  `git diff` showing no index.html changes).

  **Verification gap:** this was tested against a local dev machine's IP
  reputation with YouTube, not Cloudflare's Worker egress IPs (which the
  README notes were specifically chosen to avoid the CORS-proxy 401s this
  kind of block resembles) - so the trigger frequency in production may
  differ from what was reproduced here. The fix is a strict improvement
  either way (fails fast + retries instead of hanging on an uncaught
  exception), but real-world frequency after deploy is worth watching.

  **Follow-up not done here (flagging per this lane's scope: root-causing
  a whole-playlist bug, not adding new UI):** there is still no per-track
  retry affordance in the UI once a track lands in the greyed-out state at
  the end of a resolve - the only recovery path today is re-resolving the
  whole playlist (`reResolveBtn`) or reloading. Worth a small follow-up
  once this fix's real-world impact is visible.

### discovery-pipeline-metadata: Discovery songs should show Spotify/Apple metadata, not YouTube's
- **Status:** merged
- **Priority:** medium
- **Description:** Discovery/recommended songs currently pull their title,
  artist, and album art straight from YouTube. Instead: pick candidates via
  the existing last.fm recommendation algorithm, find each on YouTube for
  playback, but display the title/artist/art resolved back from Spotify or
  Apple Music (a second matching pass), not YouTube's own metadata.
- **Touches:** discovery/recommendation pipeline.
- **Branch:** agent/discovery-pipeline-metadata
- **Notes:** Synced from Geethub issue #77.

  Found that title/artist for `/similar`-sourced candidates already came
  from Last.fm rather than YouTube, but the art always came from
  `fetchDiscoverArt()` hitting the MusicBrainz/Cover Art Archive-backed
  `/art` endpoint - a different lookup from the Spotify/Apple Music one
  (`resolveTrackArt`/`sourceKindForType`, `/spotifyart`) every other
  source in the app uses. The `fetchArtistSearch()` last-resort fallback
  (used when `/similar` and `/ytmix` both come up empty for every seed)
  was worse: title/artist there came straight off a raw YouTube search
  result, exactly the bug this entry describes.

  Fixed and pushed (commit `b5943c1`): reused the existing `/spotifyart`
  worker endpoint (iTunes Search API, same one `resolveTrackArt` calls
  elsewhere) as a second matching pass for discovery tracks specifically.
  `searchItunesTrackArt()`/`handleSpotifyArt()` in `worker/src/index.js`
  now also return the matched `trackName`/`artistName` from iTunes'
  catalog alongside the upsized artwork, not just `{ image }` - additive
  to the response shape, since every existing caller only ever read
  `.image` off it. Added `resolveDiscoverMetadata(title, artist)` in
  `index.html`, which calls `/spotifyart` and returns the resolved
  `{ title, artist, art }`, falling back to the original title/artist
  (and the MusicBrainz `/art` lookup for art alone) on any miss so a
  niche/unreleased-to-Apple-Music track still gets *some* art instead of
  none. `fetchDiscoverCandidates()` (both the `/similar`-with-videoId and
  the `/similar`-without-videoId-then-searchYouTube branches) and
  `generateSwell()`'s artist-search fallback now build every discovery
  track object through this instead of `fetchDiscoverArt()`. The YouTube
  videoId (and the raw YouTube search hit, kept in `matchedTitle`/
  `channel` as before) is still resolved and used for actual playback -
  only what's *displayed* changes.

  Verified via a local static server (`python3 -m http.server 8934`)
  serving this worktree directly, confirmed via `location.href` in the
  browser that the tab was actually on `http://127.0.0.1:8934` and not a
  shared launcher serving the main checkout. Ran the worker locally too
  (`npx wrangler dev --local --port 8787`) and confirmed `/spotifyart`
  now returns matched title/artist alongside art (e.g. `title=Blinding
  Lights&artist=The Weeknd` -> `{"title":"Blinding Lights
  (Remix)","artist":"The Weeknd & ROSALÍA", "image": ...}`) and a clean
  `{"image":null,"title":null,"artist":null}` on a nonsense query. Seeded
  a Liked Songs track in the app's `localStorage`, redirected the app's
  `/spotifyart` and `/art` calls to the local worker via a page-level
  `fetch` patch, and ran the real `generateSwell()` pipeline end to end:
  every resulting Current/Swell track showed a clean Spotify/Apple-style
  title and artist (e.g. `"In Your Eyes" / "The Weeknd"`) and `art` URLs
  on Apple's `mzstatic.com` CDN, while `matchedTitle`/`channel` still held
  the raw YouTube upload title/channel used only to find the videoId
  (e.g. `"The Weeknd - In Your Eyes (Official Audio)"`), and playback's
  `videoId` was still a real resolved YouTube id. Confirmed via network
  request logs that every discovery candidate hit `/spotifyart` and none
  fell through to the `/art` MusicBrainz fallback. Checked the console -
  no new errors; the only error present was a pre-existing aborted
  `intro-theme.mp3` fetch unrelated to this change. As with the sibling
  `spotify-art-source`/`spotify-album-art` lanes, the worker change is
  not deployed (`wrangler deploy` not run) - that's your call once
  reviewed; until it's deployed, discovery tracks keep their current
  (already-correct-for-title/artist, MusicBrainz-art) behavior in
  production.

### tutorial-chaptered-prompts: Tutorial should pause per chapter with a "next" prompt
- **Status:** merged
- **Priority:** medium
- **Description:** Restructure the onboarding tutorial into chapters. Each
  chapter's animation loops in place until the user taps "next" to advance;
  music plays in per-chapter clips, only starting when that chapter begins
  (on "next"), rather than running continuously start to finish.
- **Touches:** `runIntro()` and the tutorial beat sequence in `index.html`.
- **Branch:** agent/tutorial-chaptered-prompts
- **Notes:** Synced from Geethub issue #25. Large-ish rework of the existing
  timed-beat tutorial system - touches the same code as
  `tutorial-preload-pacing`, `tutorial-crossfade-demo`, `tutorial-keyboard-disable`,
  and `tutorial-paste-link-copy` below; worth bundling into one lane since
  they all land in `runIntro()`.

### splash-tutorial-music-preload: Splash should play first beat of tutorial music on load
- **Status:** merged
- **Priority:** low
- **Description:** The splash screen should start playing the first beat/clip
  of the tutorial music as soon as it loads, rather than silence until the
  tutorial itself starts.
- **Touches:** splash screen, `#onbMusic` / tutorial audio triggers.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #26. Note: autoplay-with-sound before
  any user gesture may be blocked by mobile browsers - worth checking during
  implementation.

### tutorial-keyboard-disable: Mobile keyboard shouldn't pop up during tutorial
- **Status:** merged
- **Priority:** medium
- **Description:** On mobile, the on-screen keyboard sometimes appears during
  the "paste a playlist" tutorial beat. It shouldn't - that beat is
  demonstrative, not an actual input the user needs to type into.
- **Touches:** `pasteUrl()` inside `runIntro()`'s `sequence()` (the only place
  in the intro that calls `.focus()` on `#urlInput`).
- **Branch:** `agent/tutorial-mobile-fixes`
- **Notes:** Synced from Geethub issue #61. Fixed by making `#urlInput`
  `readOnly` for the instant it's focused during the demo paste, then
  blurring and clearing `readOnly` again immediately after - a readonly
  input doesn't raise the mobile on-screen keyboard on focus, but still
  gets the field's own focus/caret look for that flash-paste beat. Verified
  by loading `?intro=1` at a 375x812 mobile viewport and polling
  `document.activeElement` every 100ms for the full ~40s sequence: it never
  equalled `urlInput` at any sample, while the field's value still received
  the pasted demo URL as before.

### tutorial-preload-pacing: Preload tutorial assets before playing; fix glitchy pacing
- **Status:** merged
- **Priority:** medium
- **Description:** The tutorial's first frame should ensure everything
  (assets/animations) is loaded before playback starts - reporter says
  pacing is currently glitchy, sometimes too fast, sometimes out of sync.
- **Touches:** `runIntro()` startup / asset preload.
- **Branch:** agent/tutorial-preload-pacing
- **Notes:** Synced from Geethub issue #62.

  Fixed in commit `3da813b`: `sequence()`'s caption/animation timeline is
  scored to `intro-theme.mp3` timestamps but previously started immediately
  regardless of how much audio had buffered, so a slow/fresh load let the
  visual timeline race ahead of the music. Added `waitForMusicReady()`
  (resolves on `canplaythrough` or a 2.5s cap so a broken connection can't
  freeze the intro) and gated the `sequence()` call on it, respecting the
  existing `done`/cancel flag and `prefers-reduced-motion` short-circuit.
  Verified on both a fast local load and a simulated stalled connection
  (monkey-patched `readyState`) - pacing stayed in sync in both cases, with
  the fallback cap confirmed to unstick a broken load after ~2.5s. No new
  console errors. Pushed to `agent/tutorial-preload-pacing` - awaiting your
  local review before merge.

### tutorial-crossfade-demo: Tutorial should visually animate the crossfade slider
- **Status:** merged
- **Priority:** low
- **Description:** In the tutorial's crossfade beat, after the crossfade
  toggle is switched on, animate the crossfade slider visually moving from
  0 to 10 seconds, then settling to 5 seconds.
- **Touches:** tutorial crossfade beat (near the caption-timing fix in
  `tutorial-caption-timing`, merged).
- **Branch:** agent/tutorial-crossfade-demo
- **Notes:** Synced from Geethub issue #63.

  Found the beat in `runIntro()`'s settings section (~line 8970 in
  `index.html`, right after `tutorial-caption-timing`'s fix to the same
  "Crossfade smoothly" / "With no ads ever" caption pair): the crossfade
  toggle was flipped on (`tap(crossfadeBtn, true)`, `crossfadeBtn.textContent
  = 'On'`) but `crossfadeDurSlider`/`crossfadeDurVal` never moved - the
  slider just sat wherever the real `crossfadePrefs.ms` last left it.

  Added `animateCrossfadeDurDemo()`, a small async helper alongside the
  tutorial's other scripted-interaction helpers (`tap()`, `hoverThenPress()`)
  that sweeps the slider's `value`/label from 0ms to 10000ms over 12 steps,
  holds briefly, then eases back down to 5000ms over 8 steps, driven by the
  same `wait()` used everywhere else in `runIntro()` (so it respects
  `prefers-reduced-motion` and bails cleanly via the `done` flag if the
  visitor skips the tutorial mid-sweep). It's purely cosmetic: it never
  touches `crossfadePrefs` or calls `lsSet`, so the real crossfade-length
  setting is untouched throughout - exactly the same never-persisted pattern
  already documented for the toggle itself, and `renderCrossfadeUI()` (called
  from `finish()`) resets the slider back to the visitor's actual saved value
  once the tutorial ends either way. Since the slider's real HTML `min` is
  `1000` (1s), the helper temporarily lowers `min` to `'0'` so the sweep can
  actually reach 0s, then restores the original `min` before returning -
  scoped to the sweep's own lifetime, so it can never leak into the real
  control.

  Wired it into the beat right after the toggle turns on and before the
  existing `clearCaption()` hold, replacing a flat `wait(500)` with
  `await animateCrossfadeDurDemo()` followed by a shorter `wait(200)` - added
  runtime is additive only, doesn't touch `tutorial-caption-timing`'s
  clear/550ms-wait handoff into "With no ads ever" that follows.

  Also handled a follow-up ask to call out the slider visually while it
  animates: rather than invent a new highlight, reused the tutorial's
  existing per-beat "spotlight" mechanism (`#onbSpotlight` /
  `placeCaptionNear()`'s `unionRect()`), the same darkened-vignette-with-a-lit-
  cutout treatment every other beat already uses to call out its target, and
  already the pattern the style-record/viz beats use to spotlight two
  elements as one region (e.g. the artwork square AND the tab that changes
  it). Changed `setCaption('Crossfade smoothly', crossfadeBtn)` to
  `setCaption('Crossfade smoothly', [crossfadeBtn, crossfadeDurRow])` so the
  lit region now covers the toggle and the length-slider row together for
  the whole beat, not just the toggle - no new CSS or visual language added.

  Verified by serving this worktree with `python3 -m http.server` (a shared
  preview-tool browser pane on this machine turned out to have other active
  sessions' tabs/dev-servers mixed into it - noticed mid-verification when a
  `navigate` call unexpectedly landed on an unrelated worktree's page;
  switched to always targeting this session's own tab explicitly by id and
  reloaded the one foreign tab an errant script injection had reached, to
  leave it as found) and driving `?intro` runs of the real tutorial. Injected
  a lightweight interval-based observer (matching the `MutationObserver`
  technique `tutorial-caption-timing` used, since this sandbox can't drive
  `file://` pages directly either) logging `crossfadeDurSlider.value`,
  `crossfadeDurVal.textContent`, `#onbCaption` text, and `#onbSpotlight`'s
  position/size with timestamps. Captured a full run showing the slider
  climb 0.8s -> 10s over ~540ms then ease back down to exactly 5s over
  ~360ms in the "Crossfade smoothly" window, `#onbSpotlight` widen to a
  ~514x156px box (versus the ~40-80px single-button boxes every other beat
  in the same run produced) for that exact window, and the slider's `min`
  restored to `1000` and value reset to the real default `4000` once
  `finish()`'s `renderCrossfadeUI()` ran at the end - confirming the sweep,
  the widened highlight, and the real-setting isolation all work together.
  A direct screenshot mid-beat also showed "Crossfade length 5s" with the
  toggle On once the sweep settled. Zero console errors traceable to this
  change in any run (the only console errors seen were pre-existing
  Google-Identity/network-fetch failures from this sandbox's lack of
  network egress, unrelated to this change). No open questions.

### tutorial-paste-link-copy: Clarify "paste a link" tutorial caption
- **Status:** merged
- **Priority:** low
- **Description:** The tutorial's "paste a link" beat should specify what
  kind of link - e.g. "paste a link to a playlist, album, or song."
- **Touches:** tutorial caption copy.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #66. Trivial copy change - good
  candidate to bundle with other tutorial-beat lanes above.

### settings-bug-report-github-form: "Report a bug" should link to a GitHub issue form
- **Status:** merged
- **Priority:** medium
- **Description:** The Settings "Report a bug" button currently opens a
  mailto link (per `bug-report-button`, merged). Reporter wants it to lead
  to an actual bug-report form on GitHub instead (e.g. the same
  `improvement-idea.yml`-style issue template flow already used for
  suggestions).
- **Touches:** Settings screen bug-report button/link.
- **Branch:** agent/settings-bug-report-github-form
- **Notes:** Synced from Geethub issue #27. Judgment call resolved by user:
  **replace** the mailto link entirely with the GitHub form (not offer
  both).

  Fixed and pushed (commit `69b0fef`): added a new
  `.github/ISSUE_TEMPLATE/bug-report.yml` (adapted from the existing
  `improvement-idea.yml` pattern - title prefix `[bug]`, label `bug`,
  fields for what happened / steps to reproduce / device-browser /
  touches / notes). The Settings button (`#reportBugBtn`) now links to
  `https://github.com/MalGriot/EBBLESS/issues/new?template=bug-report.yml&labels=bug`
  with `target="_blank" rel="noopener"`, matching the existing
  `#suggestIdeaBtn` convention; mailto behavior removed entirely, no
  mailto references remain in the DOM. Also fixed two onboarding-tutorial
  JS selectors that targeted the old `a[href^="mailto:"]` and would have
  silently broken after the href change - now use `#reportBugBtn`
  directly. Verified via a worktree-local `python3 -m http.server`
  (confirmed via `location.href`): button href/attributes correct, zero
  mailto links in the DOM, Settings renders correctly, no new console
  errors. Pushed to `agent/settings-bug-report-github-form`, not merged -
  awaiting your review.

### settings-share-app: Add "share this app" button in Settings
- **Status:** merged
- **Priority:** low
- **Description:** Add a button in Settings that lets the user share EBBLESS
  itself (the app, not a specific song/playlist).
- **Touches:** Settings screen.
- **Branch:** agent/settings-share-app
- **Notes:** Synced from Geethub issue #43. Related to `share-song-playlist`
  below (song/playlist-level sharing) - different scope, worth keeping
  separate since one shares the app, the other shares specific content.

  Fixed and pushed (commit `7c17f83`): added a "Share EBBLESS" row to the
  Settings "About" block, styled identically to existing rows. Click handler
  calls `navigator.share({title, text, url})` when available (swallowing
  user-cancel rejections), falling back to `navigator.clipboard.writeText`
  with a "Copied!" toast on success (mirrors the existing "Link copied"
  clipboard pattern already used elsewhere in the file). Verified via a
  worktree-local `python3 -m http.server`: row renders matching existing
  Settings styling; confirmed `navigator.share` is unavailable in the
  automated browser so the fallback path is what's exercised; confirmed
  clicking the button correctly hits the clipboard-fallback branch and
  drives the toast UI, though the actual "Copied!" success text couldn't be
  triggered end-to-end since `navigator.clipboard.writeText` rejected with
  `NotAllowedError: Document is not focused` in the headless pane (not an
  app defect - `document.hasFocus()` stayed false even after
  `window.focus()`); both success/failure branches are present and wired
  correctly in source. No new console errors vs. baseline. **Caveat:** real
  on-device confirmation of the "Copied!" toast and of `navigator.share`
  opening an actual OS share sheet wasn't possible in this headless tool -
  worth a quick real-device check.

### player-mobile-spacing: Player should sit clear of screen edges (desktop taskbar, mobile footer nav)
- **Status:** merged
- **Priority:** medium
- **Description:** The player currently sits too low - on desktop it can get
  covered by the OS taskbar, and on mobile there's not enough space between
  the player's bottom controls and the footer nav. Consider moving the whole
  player block (art, controls) up slightly on both platforms.
- **Touches:** player view layout CSS.
- **Branch:** `agent/tutorial-mobile-fixes`
- **Notes:** Synced from Geethub issue #30. Related to but distinct from
  `player-controller-centering` (merged, fixed the desktop player being
  fully invisible) - this is a spacing/breathing-room polish pass on a now-
  visible player. Fixed by adding bottom padding to `#view-player
  .view-scroll` (which sits inside a flex column with `justify-content:safe
  center`, so extra bottom padding nudges the centered content up): 28px on
  mobile (<=859.98px, on top of the existing `.view{bottom:calc(var(--nav-h)
  + var(--safe-b))}` offset that already clears `#bottom-nav`'s own box) and
  44px on desktop (>=860px, where `.view{bottom:0}` previously left almost
  no margin - only the base 8px - above the viewport edge). Verified by
  serving this worktree's `index.html` directly, loading the real "I Tried
  It" test playlist, and opening the player view: at a 375x812 mobile
  viewport the transport controls sit ~62px above `#bottom-nav`; at a
  1440x900 desktop viewport they sit ~76px above the viewport bottom; and at
  1200x800 (the `split-desktop` 3-pane layout, >=1150px) they sit ~42px
  above the viewport bottom - clearing a typical 40-50px OS taskbar band in
  all three cases.

### cymatics-true-black-contrast: Cymatics background should be true black
- **Status:** merged
- **Priority:** low
- **Description:** The cymatics visualizer's background should be true
  black, with higher contrast against the dots - but the dots' own
  brightness should stay unchanged.
- **Touches:** cymatics visualizer CSS/rendering.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #49.

### record-cassette-size: Make spinning record / cassette visuals bigger
- **Status:** merged
- **Priority:** medium
- **Description:** The spinning record and cassette tape visuals should be
  larger and closer to the screen edges, sized proportionately - without
  moving or resizing the rest of the UI, which the reporter considers
  already correct.
- **Touches:** `.record-*` / `.cs-*` (cassette) visual elements in the
  player view.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #50.

### lyrics-glow-trail: Lyrics should glow with a fading trail effect
- **Status:** merged
- **Priority:** medium
- **Description:** The current lyric line should glow in a color. Passed
  lines should keep glowing in that same color but at progressively lower
  vibrance, fading all the way back to the first lyric line (a trailing-glow
  effect). If the user manually selects/clicks a lyric line, the glow/trail
  state should stay consistent with wherever they clicked.
- **Touches:** lyrics view rendering.
- **Branch:** agent/lyrics-glow-trail
- **Notes:** Synced from Geethub issue #51. Pushed (commit `08537a2`):
  `.lyric-line.is-current` glows in `--player-accent`; new `.lyric-line.is-past`
  uses the same color/glow scaled by a per-line `--glow` (0-1) set in
  `updateLyricsHighlight` only when the active line changes, so seeking back
  clears later lines. Transition off under `prefers-reduced-motion`.
  Verified against fake synced lines in the real `#lyricsScroller`; not yet
  checked on a real track, visually, or on browsers lacking `color-mix()`.

### cymatics-heart-centering: Center the title in cymatics fullscreen (heart pushes it left)
- **Status:** merged
- **Priority:** low
- **Description:** In cymatics fullscreen view, the track title is currently
  pushed off-center to the left by the heart/like icon. The heart should sit
  above the title, both centered on screen.
- **Touches:** cymatics fullscreen layout CSS.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #53.

### playlist-queue-slide-height: Playlist and queue slide-up panels should match max height
- **Status:** merged
- **Priority:** low
- **Description:** The slide-up panel for an opened playlist should always
  expand to the same maximum height as the queue panel does, and both should
  sit closer to the top ("x"/close button).
- **Touches:** playlist panel / queue panel slide-up CSS.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #54.

### playlist-art-at-top: Opened playlist panel should show its art at the top
- **Status:** merged
- **Priority:** low
- **Description:** When a playlist is opened from the library, its cover
  image should appear at the top of the panel.
- **Touches:** playlist panel layout.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #55.

### logo-tap-to-player: Tapping the logo on the main HUD should open the player tab
- **Status:** merged
- **Priority:** low
- **Description:** Tapping the EBBLESS logo in the main header/HUD should
  navigate to the player tab.
- **Touches:** header/HUD nav, logo tap handler.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #71.

### album-art-swipe-nav: Swipe album art left/right for prev/next track
- **Status:** merged
- **Priority:** medium
- **Description:** Swiping left or right on the album art in the player
  should skip to the next/previous track respectively.
- **Touches:** player view, album art touch handlers.
- **Branch:** agent/album-art-swipe-nav
- **Notes:** Synced from Geethub issue #72. Fixed and pushed (commit
  `f76d1f4`): added a swipe handler on `#artworkWrap` (bound to `artworkWrap`,
  declared line 1468) matching the existing swipe pattern already used by the
  fullscreen "flow" view's `flowArtWrap` handler (lines 6808-6828: touchstart/
  touchend, horizontal `dx`/vertical `dy` delta, 70px threshold) - inserted
  right after the existing tap-to-play/pause block, before `MINI BAR TAP`
  (~line 6837). Horizontal drag over 70px (and greater than vertical delta)
  calls the same `playNext(auto)` (line 6380) / `playPrev()` (line 6395)
  functions the real `nextBtn`/`prevBtn` buttons use; vertical-dominant or
  small drags are ignored, so tap-to-play/pause and vertical scroll are
  unaffected. No new queue/playback logic - reuses existing transport
  functions exactly.

  Verified via a local `python3 -m http.server 8934` served directly from
  this worktree (confirmed via `location.href` that the tab loaded from
  that port, not the shared preview launcher), 375x812 mobile viewport, real
  loaded playlist: a synthetic left swipe (dx≈-200px) advanced the track
  (title changed), a small 5px drag left the track unchanged and tap-to-play
  still toggled correctly, and a 250px vertical-only swipe didn't trigger
  track change. No new console errors (only the pre-existing YouTube iframe
  API fetch error). **Caveat:** no real audio playback in this sandbox, so
  `playPrev()`'s "seek to 0 if >3s played" branch wasn't exercised with real
  timing - but since the swipe calls the identical functions as the existing
  transport buttons, behavior should match those buttons live.

### album-art-doubletap: Double-tap album art / cymatics to toggle fullscreen
- **Status:** merged
- **Priority:** low
- **Description:** Double-tapping the album art (or cymatics view) should
  toggle fullscreen.
- **Touches:** player view / cymatics view touch handlers.
- **Branch:** agent/album-art-doubletap
- **Notes:** Synced from Geethub issue #73. Decision made 2026-09-22: double-tap
  toggles fullscreen (not like/heart).

### video-playback-option: Add a video-playback button next to lyrics
- **Status:** merged
- **Priority:** medium
- **Description:** Add an option to play the actual YouTube video (not just
  audio) for the current track, via a new button placed next to the existing
  lyrics button.
- **Touches:** player view controls, YouTube embed/player logic.
- **Branch:** agent/platform-compliance-audit
- **Build:** covered by `platform-compliance-audit` (65269b4), YouTube tab.
- **Notes:** Synced from Geethub issue #45.

### desktop-mini-player: Floating desktop mini-player when tab loses focus
- **Status:** merged
- **Priority:** medium
- **Description:** When the user switches away from the EBBLESS browser tab
  on desktop, show a small, movable/draggable mini-player in a corner of the
  screen with full playback controls.
- **Touches:** desktop layout, likely a `document.hasFocus()`/`visibilitychange`
  trigger plus a new floating-widget component. Picture-in-Picture Web API
  may be relevant here (real OS-level floating window) - worth researching
  as an alternative to a plain in-page floating div.
- **Branch:** agent/desktop-mini-player
- **Notes:** Synced from Geethub issue #64. Bigger lift than most entries in
  this batch - likely its own lane.

  Fixed and pushed (commit `0110681`): used the Document Picture-in-Picture
  API (`documentPictureInPicture`) rather than a plain in-page floating div —
  a div is invisible the instant the tab backgrounds, which defeats the
  point. Confirmed live that calling `requestWindow()` directly on
  `visibilitychange`/blur throws `NotAllowedError` (no user gesture on a
  tab-switch); the working mechanism instead is registering a MediaSession
  `'enterpictureinpicture'` action handler (`navigator.mediaSession
  .setActionHandler('enterpictureinpicture', openMiniPlayer)`) — Chromium
  exempts that handler from the gesture requirement and invokes it itself
  when audio is playing/holds audio focus and the tab is switched away from,
  auto-closing the window on return. New block after the existing
  `mediaSession` setup (~line 6466): `miniPlayerSupported()`,
  `buildMiniPlayerDOM()`, `updateMiniPlayerUI()`, `openMiniPlayer()`, plus
  two one-line sync hooks added to `setPlayingUI()` (~line 5384) and
  `updateTrackMetaUI()` (~line 6157). The mini player's prev/play-pause/next
  buttons call the existing `playPrev`, `playNext(false)`, and
  `playIndex(state.queuePos)`/`playRickrollFallback()` — no playback logic
  duplicated. Unsupported browsers / a declined/failed `requestWindow()`
  fall through to a no-op via try/catch (audio just keeps playing in the
  backgrounded tab as before, same as today).

  Verified via a local `python3 -m http.server` served from this worktree
  (confirmed `location.href` each time — the shared browser pane was
  apparently in concurrent use by another lane mid-test and once silently
  swapped the tab to a different origin, caught via `tabs_context` and moved
  to a fresh dedicated tab). Confirmed `'documentPictureInPicture' in
  window` is true and the action-handler registers without throwing; got
  the app into a genuinely playing state and confirmed
  `document.hasFocus()`/`visibilityState` flip correctly on backgrounding;
  no new console errors from the change; mirrored the PiP window's
  markup/CSS/button-wiring into a real iframe document and confirmed all
  three buttons fire clicks correctly.

  **Caveat — not fully proven end-to-end:** the sandboxed test browser
  can't grant real OS-level PiP windows at all (`requestWindow()` returns
  `InvalidStateError: ... no window` even on a genuine trusted click,
  `documentPictureInPicture.window` stayed `null` after backgrounding a
  playing tab), so the actual "window appears on tab-switch, closes on
  return" behavior is reasoned from Chromium's documented
  `enterpictureinpicture` auto-trigger contract, not directly observed here.
  This is a sandbox limitation, not a known code bug — `openMiniPlayer()`'s
  catch block handles exactly that failure path as a no-op — but **spot-check
  in a real desktop Chrome/Edge before treating this as fully verified.**
  Also note: this only works in Chromium-based browsers (Document PiP has
  no Safari/Firefox support as of this writing) — non-Chromium desktop users
  get the pre-existing behavior (audio keeps playing, no floating window),
  not a broken experience, just no new feature.

### album-art-2x2-grid-bug: Album art sometimes shows placeholder grid instead of real art
- **Status:** merged
- **Priority:** medium
- **Description:** In the player and queue, album art sometimes shows a
  generic 2x2 grid placeholder instead of the actual resolved album art.
- **Touches:** track art resolution (`resolveTrackArt()` / `artworkUrls()`),
  player and queue art rendering.
- **Branch:** `agent/album-art-2x2-grid-bug`
- **Notes:** Synced from Geethub issue #35.

  **Investigation:** `resolveTrackArt()`/`artworkUrls()` themselves turned
  out fine - reloading the standard test playlist
  (`5qMMDwZ1Wo8q0lpDOmsXnZ`) and inspecting the resolved cache confirmed
  every track had both a `videoId` and a real resolved `art` URL, and the
  in-app player/queue rows (single `<img>` + `attachArtworkFallback()`)
  read that correctly - no grid there, and no blank/broken art either.

  The actual 2x2 grid only exists in one place: `renderLibrary()`'s
  playlist/album tile (`.lib-card .art`, the `grid-face` built from up to
  4 track thumbnails). The root cause was that this was never a pure
  fallback - `renderLibrary()` built the 4-track collage unconditionally
  whenever a playlist had >=1 matched track, and *also* stacked the real
  source cover (`pl.image`, e.g. Spotify/SoundCloud) behind it when one
  existed. A `.lib-card .art.animated .face` CSS rule
  (`lib-art-crossfade`, a 9s `ease-in-out infinite` keyframe animation)
  then crossfaded the two faces back and forth forever. So for any
  playlist that had a real cover, the tile alternated between the real
  cover and the 2x2 track-thumbnail grid roughly every 4.5s - the grid
  was genuinely on screen about half the time, even though the real
  album art (`pl.image`) was sitting right there the whole time and
  never actually missing. That matches the report precisely: "sometimes"
  it's the grid, "sometimes" it's the actual art, on the same playlist,
  with nothing about track resolution changing in between.

  **Fix:** in `renderLibrary()` (`index.html`, the tile-building branch
  around the old `withArt`/`gridFace` block), a real `pl.image` now wins
  outright - the card renders just that image, no grid, no crossfade, no
  `.animated` class. The 2x2 collage is still built, unchanged, as the
  fallback for a playlist with matched tracks but *no* source-provided
  cover at all (still a legitimate "nothing better to show" case, not a
  bug). Removed the now-dead `.animated`/`spotify-face`/
  `lib-art-crossfade` CSS (including its `prefers-reduced-motion`
  override) since nothing sets those classes anymore.

  **Verification:** served this worktree's `index.html` directly via
  `python3 -m http.server` from inside
  `../ebbless-worktrees/album-art-2x2-grid-bug` (confirmed via
  `location.href` in the browser that the loaded origin was this
  worktree's server, not the main checkout or another lane's worktree -
  several other lanes' worktrees/servers were live in the same shared
  browser at the time). Loaded the standard test playlist plus a second
  SoundCloud playlist (auto-imported on localhost) and, before the fix,
  confirmed both playlist tiles had `.art.animated` with a `grid-face` +
  `spotify-face` pair (i.e. actively crossfading, so the grid really was
  intermittently covering the real art). After the fix, re-inspected the
  DOM: both tiles render a single non-animated `<img>` pointed straight
  at `pl.image` (Spotify CDN / SoundCloud CDN URL respectively), no
  `grid-face` or `.animated` anywhere in the document. Also checked the
  Player and Queue screens directly (track art, "Now"/"Next"/"Later"
  rows) - all showed correct per-track art throughout, consistent with
  the investigation finding that per-track resolution was never the
  problem. Console showed no new errors from the change (two pre-existing
  "unknown error fetching script" messages remained, unrelated to this
  fix - a service-worker registration quirk of plain `http.server`, seen
  identically before and after).

### desktop-playlist-hover-buttons: Playlist hover play button blocks pin/3-dot buttons
- **Status:** merged
- **Priority:** medium
- **Description:** On desktop, hovering a playlist card reveals a play
  button that overlaps/blocks the pin button and the three-dot menu button,
  making them unusable.
- **Touches:** playlist card hover-state CSS (desktop library grid).
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #76.

### desktop-settings-inline: Desktop Settings should replace the player pane in place
- **Status:** merged
- **Priority:** medium
- **Description:** On desktop, clicking Settings currently navigates to a
  separate screen. Instead it should pop up in the player pane's spot,
  replacing the player view there, so the header nav doesn't change.
- **Touches:** desktop split-view layout, Settings navigation.
- **Branch:** agent/desktop-settings-inline
- **Notes:** Synced from Geethub issue #78. Same general area as
  `player-controller-centering` (merged) - the desktop split-pane layout -
  worth the same care around `min-height`/z-index quirks found there.

  Root cause: the `>=1150px` "split-desktop" 3-pane grid block (the same
  one `player-controller-centering` fixed) scoped every one of its rules
  to `body.split-desktop:not(.view-settings-active)`. `setView()` toggles
  `.view-settings-active` on `<body>` whenever Settings becomes the active
  view, so opening Settings simply knocked the whole grid out - `#app`
  fell back to its plain (non-grid) layout, `#view-library`/`#queue-panel`
  reverted to their normal fixed-position/hidden rules, and `#view-settings`
  took over the full screen exactly like the sub-1150px "separate screen"
  behavior. That's a real navigation-away, just visually convincing enough
  on desktop to look intentional.

  Fix (`index.html`, inside the existing `@media (min-width:1150px)`
  block): dropped the `:not(.view-settings-active)` scoping from the grid
  itself and from `#view-library`/`#queue-panel`'s placement rules, so the
  3-pane grid and the outer panes stay put regardless of whether Settings
  is open. Only the center column now swaps: `#view-player` is forced
  visible (`display:block!important`, ignoring its own `hidden` attribute -
  the same pre-existing trick that keeps `#view-library` visible
  regardless of `state.currentView`) whenever `.view-settings-active` is
  *not* set, and `#view-settings` gets the identical treatment when it
  *is* set - so exactly one of the two occupies grid-column 2 at a time,
  driven by the class `setView()` already toggles. No JS changes were
  needed; `setView()`'s existing settings-toggle logic (remembering
  `preSettingsView` so a second click on Settings returns to wherever you
  came from) already generalized cleanly to this case.

  Verified with a real browser check, served from this worktree's own
  `index.html` via `python3 -m http.server` (not the shared preview
  launcher - it kept silently reattaching the pane to an unrelated
  worktree's already-running dev server on the launch.json's default
  port, exactly the multi-session collision `CLAUDE.md` warns about;
  working around it required passing an explicit `tabId` on every browser
  call rather than letting it default to "the active tab"). At 1280x800
  (well inside the split-desktop breakpoint): loaded an album, started
  playback, then clicked Settings - the center pane swapped to the
  Settings content while the library pane (playlists/albums) and the
  queue pane (now-playing + upcoming tracks) stayed exactly as they were,
  and the header nav still showed only the Settings gear (no Library/
  Player/Queue buttons reappeared). Confirmed via the DOM that
  `document.body.className` was `view-settings-active split-desktop` and
  the YouTube iframe's `src` (video id, query params) was byte-for-byte
  unchanged from before opening Settings - i.e. playback wasn't paused,
  stopped, or reloaded under the hood. Clicked Settings again to close it:
  `body.className` dropped back to plain `split-desktop`, `#view-player`
  came back exactly where it left off, and the iframe `src` was still
  identical - confirmed visually too (artwork/track/seek/transport all
  back, mid-track). `location.href` never changed across any of this - no
  navigation, just DOM/class swaps. Also checked 1100px (just below the
  1150px breakpoint) and a narrower ~800px width: at both, clicking
  Settings still fully navigates away exactly as before (`body.className`
  is bare `view-settings-active`, no `split-desktop`, header nav collapses
  to the full Settings screen, mini-bar keeps showing the current track at
  the bottom) - confirming the sub-1150px behavior is untouched. Checked
  the console throughout: the only error present, before and after, is the
  pre-existing sandboxed-network YouTube iframe API script-fetch failure
  already called out in `player-controller-centering`'s notes - no new
  errors from this change.

  Pushed to `agent/desktop-settings-inline` (commit `39e07d9`); not
  merged - left for review.

  **Closed out (2026-09-22):** merged to `main` along with
  `desktop-player-fullscreen-toggle` below (commit `df093f3`), resolving a
  real CSS conflict between the two - see that entry's notes for the
  resolution. Re-verified Settings-inline still works correctly after the
  merge, in a real browser, with the fullscreen toggle also exercised in
  the same session. Pushed live at the user's request.

### desktop-player-fullscreen-toggle: Desktop player fullscreen should slide panels off, nav buttons become toggles
- **Status:** merged
- **Priority:** medium
- **Description:** On desktop, with the player centered, its fullscreen
  button should slide the library/playlist panel off to the left and the
  queue panel off to the right, opening the player to the full screen width.
  The header nav's Queue and Library buttons should become toggles that
  show/hide those panels directly (rather than just navigating).
- **Touches:** `index.html` - the `@media (min-width:1150px)` "split-desktop"
  CSS block (~line 874-949: new `.desktop-fs`/`.desktop-fs-lib-open`/
  `.desktop-fs-queue-open` rules), `state` (~line 2527: `deskFsOpen`/
  `deskFsLibOpen`/`deskFsQueueOpen`), the nav button click handlers (~line
  2749-2764), `updateSplitDesktop()` (~line 2755), the new
  `toggleDesktopFs()`/`closeDesktopFs()`/`toggleDesktopFsLib()`/
  `toggleDesktopFsQueue()` functions (~line 2778-2803), and `fsBtn`'s click
  handler (~line 6768).
- **Branch:** agent/desktop-player-fullscreen-toggle
- **Notes:** Synced from Geethub issue #79. Related to `desktop-settings-inline`
  and `player-controller-centering` (merged) - same desktop-layout area,
  worth planning together. Worked in an isolated worktree per the repo's
  multi-session protocol to avoid clobbering the parallel
  `desktop-settings-inline` lane also touching this area.

  Root cause: `fsBtn` (the album-art expand button, aria-label "Enter flow
  mode") always opened "flow mode" (`#flow-layer`, a full-viewport overlay
  built for mobile/tablet) regardless of layout - including in the
  `>=1150px` "split-desktop" 3-pane layout, where the player is already
  visible full-time alongside library and queue. There it just duplicated
  the already-visible player into a second fullscreen overlay with no way
  back to library/queue, which isn't the "slide the side panels away"
  behavior the issue asked for. Separately, the header nav's Library/Queue
  buttons were unconditionally `display:none` in split-desktop (added by the
  `player-controller-centering` fix) since both panes are always on-screen
  there already - so there was no existing UI hook for a "bring a panel
  back" affordance either.

  Fix: added a `body.split-desktop`-scoped branch to `fsBtn`'s click handler
  that calls a new `toggleDesktopFs()` instead of `openFlow()`. This toggles
  a `.desktop-fs` class on `<body>`, which (via new CSS in the
  `min-width:1150px` block) transforms `#view-library` off-screen left and
  `#queue-panel` off-screen right (`translateX(-100%)`/`translateX(100%)`,
  animated via the existing `--ease-out` transition curve) while lifting
  `#view-player` out of the grid onto a `position:fixed` layer spanning the
  full split-view width (`z-index:44`) - both side panes stay real grid
  items so nothing about the underlying 3-column grid itself changes, they
  just get pushed out of view. One gotcha: `#queue-panel`'s existing
  non-fullscreen split-desktop rule sets `transform:none!important` (to
  cancel the <1150px drawer transform it also carries) - CSS `!important`
  always beats specificity regardless of selector length, so the new
  fullscreen transform needed its own `!important` to actually win; the
  library pane needed no such override since it never had a competing
  `!important` transform to begin with.

  The header nav's Library/Queue buttons are now shown (still hidden
  otherwise) only while `.desktop-fs` is active, and their click handlers
  branch on `body.split-desktop` to call new `toggleDesktopFsLib()`/
  `toggleDesktopFsQueue()` instead of `setView('library')`/
  `toggleQueuePanel()` - each toggles a `.desktop-fs-lib-open`/
  `.desktop-fs-queue-open` class that slides that one panel back in as a
  `position:fixed`, `z-index:46` overlay drawer on top of the fullscreen
  player (independently of the other panel), with the nav button's
  `is-active` state kept in sync the same way `toggle-queue` already did
  elsewhere. `updateSplitDesktop()` (the `matchMedia('(min-width:1150px)')`
  listener) now calls the new `closeDesktopFs()` whenever the viewport drops
  below the breakpoint, so resizing out of split-desktop can't leave the app
  stuck with panels transformed off-screen and no way to reach them (the
  mobile/tablet layout doesn't have a `.desktop-fs` concept at all).

  Verified by serving this worktree's `index.html` directly via `python3 -m
  http.server` from inside the worktree (confirmed via `location.href` in
  the browser that the served copy - not the main checkout, which a shared
  preview launcher in this environment silently substituted at least twice
  during testing - had the new code, after also catching the browser
  serving a stale cached copy of the file on one earlier check and forcing
  a fresh load) at a 1280x800 desktop viewport with the standard "I Tried
  It" test playlist auto-loaded: clicking `fsBtn` added `desktop-fs` to
  `<body>` and moved `#view-library`/`#view-player`/`#queue-panel` to
  `x:-340/0:1280/1280` (confirmed via `getBoundingClientRect()`) - library
  and queue fully off-screen, player spanning the entire 1280px width - and
  showed the Library/Queue nav buttons (Player nav button stayed hidden, as
  before). Clicking the Library nav button slid `#view-library` back to
  `x:0` as an overlay on top of the fixed player and marked the button
  `is-active`; clicking Queue while Library was open closed Library and
  slid `#queue-panel` in from the right to `x:940`, each independently.
  Clicking `fsBtn` again removed `desktop-fs` and restored the exact
  pre-fullscreen 3-pane rects (`library x:0/w:340`, `player x:340/w:600`,
  `queue x:940/w:340`) with the nav buttons hidden again - confirming no
  regression to the normal split-desktop layout. Console showed only the
  pre-existing "unknown error... fetching the script" YouTube-iframe-API
  noise already documented in `fullscreen-player-controls`'s notes (present
  on a fresh reload with no interaction at all); no new errors.

  **Follow-up fix (same branch, second pass):** the first pass's
  `fsBtn`-in-`split-desktop`-always-calls-`toggleDesktopFs()` branch was too
  broad - it fired regardless of `visualMode`, so entering fullscreen on
  desktop while viewing the cymatics visualizer or lyrics got trapped in the
  smaller panel-slide player pane (`position:fixed;top:var(--topbar-h)`,
  topbar/nav still visible) instead of the true full-bleed
  `openFlow()`/`openLyricsFs()` overlays (`#flow-layer`/`#lyricsFsLayer`,
  `position:fixed;inset:0`, topbar hidden) those views use everywhere else -
  a regression from "before this lane" behavior the user explicitly flagged
  ("cymatics and lyrics should cover the screen on fullscreen like before").
  Fixed `fsBtn`'s click handler (~line 6775) to check `visualMode` first:
  `'lyrics'`/`'viz'` now always get the full-bleed overlay on any viewport,
  and only `visualMode === 'art'` + `body.split-desktop` reaches
  `toggleDesktopFs()`'s panel-slide treatment; mobile/non-split-desktop art
  view still falls through to `openFlow()` unchanged. Also made
  `toggleDesktopFs()` (~line 2792) defensively reset
  `deskFsLibOpen`/`deskFsQueueOpen` and their body classes every time it
  enters fullscreen, instead of relying on them already being false, per the
  user's separate ask that the library/queue drawers always start closed on
  a fresh fullscreen entry.

  While verifying the viz-fullscreen path this also surfaced (and fixed) a
  latent bug in `closeFlow()`: it restored `vizAutoBtn` using a stale
  `nextElementSibling` anchor reference captured once at page load - that
  anchor is `vizSpeedBtn`, which had itself also been moved out to the flow
  layer and not yet restored, so `insertBefore` threw a `NotFoundError`
  every time viz fullscreen was closed. This was already reachable on
  mobile before this lane (identical `openFlow()`/`closeFlow()` code path,
  untouched by either pass) but had never been exercised on desktop before
  since split-desktop could never reach viz-fullscreen at all pre-fix.
  Restoring `vizSpeedBtn` before `vizAutoBtn` (order matters: `vizAutoBtn`'s
  anchor needs to already be back in the home container) fixes it.

  Verified by serving this worktree's `index.html` directly via `python3 -m
  http.server` from inside the worktree directory (confirmed via
  `location.href` each time that the served/rendered copy was the worktree,
  not the main checkout, per the repo's standing note that the shared
  preview launcher has been unreliable across worktrees) at a 1280x800
  desktop viewport with the standard "I Tried It" test playlist: switched to
  the cymatics visualizer tab, hit fullscreen - `#flow-layer` gained
  `is-open`, covering the entire screen with the topbar hidden, matching the
  pre-lane behavior. Repeated for lyrics - `#lyricsFsLayer` gained
  `is-open`, same full-bleed coverage. Switched back to the default
  album-art view, hit fullscreen - confirmed the desktop panel-slide
  behavior (library/queue sliding off, player expanding, `desktop-fs` class
  on `<body>`) still works exactly as the first pass verified. Opened both
  the library and queue drawers while in art fullscreen, exited, then
  re-entered fullscreen fresh - confirmed `desktop-fs-lib-open`/
  `desktop-fs-queue-open` were absent on the fresh entry (drawers start
  closed every time). Also checked a fresh tab's console through a full
  viz-fullscreen open/close cycle: no `NotFoundError`, and DOM inspection
  confirmed `vizCanvas`/`vizAutoBtn`/`vizSpeedBtn` all correctly returned to
  their home containers (`artworkWrap`/`vizControls`) after closing. A
  mobile-viewport (375x812, non-split-desktop) check confirmed the
  unrelated art-view `openFlow()` path is unchanged. Only the pre-existing,
  already-documented "unknown error... fetching the script" YouTube-iframe
  noise remained; no other new console errors.

  **Closed out (2026-09-22):** merged to `main` along with
  `desktop-settings-inline` (commit `df093f3`). The two conflicted on the
  same `@media (min-width:1150px)` CSS block - `desktop-settings-inline`
  had removed the `:not(.view-settings-active)` scoping from the base
  grid/library/queue-panel/lib-filter rules (so the layout stays put while
  Settings is open), while this entry's own commits still carried the
  original `:not(.view-settings-active)` guards on those same base rules
  (written before that fix landed). Resolution: kept the base rules
  unguarded (per `desktop-settings-inline`), kept `:not(.view-settings-active)`
  only on this entry's own new desktop-fs-specific rules (the panel-slide
  transforms and drawer overlays - those shouldn't ever be active
  simultaneously with Settings in practice, since `fsBtn` only exists in
  the player view), and merged the library/queue nav-button visibility
  rule (`:not(.desktop-fs)`) without reintroducing the now-removed
  Settings dependency. Verified in a real browser after merging: Settings-
  inline swap, fullscreen panel-slide, and both Library/Queue drawer
  toggles all still work correctly together, in either order, clean exits,
  no new console errors. Pushed live at the user's request.

  **Follow-up (2026-09-22, commit `e30d6f9`):** user reported the desktop
  fullscreen album art wasn't centered, across all three styles. Two
  compounding bugs, both from this entry's own merge: (1) the
  `margin-right:0!important` rule this entry's merge left on `.view-scroll`
  (needed for the normal narrow 3-pane layout) survived into the
  full-width fullscreen `#view-player`, so `margin:0 auto` centering had
  its right side pinned to 0 and dumped all the leftover space on the
  left instead - fixed by scoping that rule to `:not(.desktop-fs)`. (2)
  while investigating, found the art itself was never actually enlarged
  for desktop fullscreen at all - `.artwork-wrap` stayed at its normal
  in-pane cap (~440px) since only the surrounding pane expanded, not the
  art. Added a `min(86vh,86vw,calc(100dvh - var(--topbar-h) - 300px))`
  override to match the mobile flow-mode fullscreen's own art scale - the
  third term reuses the same reservation the existing `>=860px` rule
  already budgets for title/artist/seek/controls-row/tabs, which mattered
  in testing: an uncapped `86vh` pushed the transport controls off the
  bottom of a shorter (800px-tall) viewport entirely. Verified centering
  via `getBoundingClientRect()` (exact center-X match at both viewport
  sizes tested) and confirmed the size scales up on a taller viewport
  (640px at 1000px-tall) while staying at the pre-existing size where a
  shorter viewport leaves no extra room (440px at 800px-tall, matching
  before this fix - not a regression, just nothing to gain there).

### audio-ducking: Auto-dip EBBLESS volume when other audio plays (desktop)
- **Status:** merged
- **Priority:** low
- **Description:** On desktop, if audio starts playing from another source
  (another tab/app), EBBLESS should detect it and automatically lower its
  own volume.
- **Touches:** playback volume control; likely no reliable cross-app/tab
  audio-detection API exists in browsers - needs research into feasibility
  (e.g. only detectable for other tabs in the same browser via the Web Audio
  API, not system-wide).
- **Branch:** agent/audio-ducking
- **Notes:** Synced from Geethub issue #80. Flagging a feasibility risk -
  true system-wide audio detection isn't available to web apps; may only be
  partially achievable.

### library-hold-add-to-queue: Hold a library track to add to queue / play next
- **Status:** merged
- **Priority:** medium
- **Description:** Holding down on a track in the library should bring up a
  menu with "add to queue" and "play next" options. "Play next" should play
  right after the currently-playing song, with the rest of the queue
  continuing unchanged after that.
- **Touches:** library track rows, queue management.
- **Branch:** agent/library-hold-add-to-queue
- **Notes:** Synced from Geethub issue #52. Fixed and pushed (commit
  `bc0943b`): the library's existing per-track long-press menu (from
  `track-relink-menu`, wired via `attachLongPress(row, ...toggleTrackCtxMenu...)`
  at line 3262) already had "Play next" but had explicitly dropped "Add to
  queue" in an earlier pass. Added it back: new `CTX_ICON_ADD_QUEUE` SVG
  (line 3452), new `addqueue` menu item between "Play next" and "Add to
  playlist" (line 3494), and `handleTrackCtxAction` now calls the existing
  `queueAddToEnd(trackIdx, plId)` (same helper used elsewhere, e.g. line
  4829) for it (line 3532) - no new queue-insertion logic written. "Play
  next" itself was untouched (already correct - calls `queuePlayNext()`,
  which inserts right after `state.queuePos`, dedup'ing any later
  occurrence, leaving the rest of the order unchanged).

  Verified via a local `python3 -m http.server` served from this worktree
  (confirmed via `location.href` and by grepping the served script for
  `addqueue` that the correct worktree code was running - `127.0.0.1:<port>`
  needed instead of `localhost`, which kept getting silently rerouted to a
  stale server). In a 375x812 mobile viewport, dispatched a real
  touchstart/touchend long-press (~650ms) on library track rows: menu shows
  "Add to Liked Songs / Play next / Add to queue / Add to playlist / Refresh
  link"; "Add to queue" on one track appended it to the end of the Queue
  panel with a toast; "Play next" on another inserted it immediately after
  the currently-playing track with the rest of the original queue order
  fully intact. No new console errors (one pre-existing, unrelated `sw.js`
  fetch error from the local test server setup, not the feature). **Caveat:**
  touch-long-press-only, no desktop/mouse equivalent - matches the existing
  `track-relink-menu` pattern (no kebab button on library rows by prior
  design), so this is consistent with existing UX, not a new gap.

### playlist-image-reset: Add "reset to original art" in playlist image picker
- **Status:** merged
- **Priority:** low
- **Description:** The playlist hold-menu's "change image" screen should
  offer a "reset to original" option. If the playlist never had original
  art, this should just clear whatever custom image was assigned in
  EBBLESS.
- **Touches:** playlist image-change UI.
- **Branch:** agent/playlist-image-reset
- **Notes:** Synced from Geethub issue #56.

  Fixed and pushed. `pl.image` was doing double duty as both the
  source-provided cover (set at import in `resolvePlaylist`, around lines
  2316/2327/2360) and the user's custom override - once a user picked a
  custom image the original Spotify/YouTube/SoundCloud/Apple Music cover was
  gone for good, so the old "Remove custom art" button in `openChangeArtFlow`
  (~line 3408) could only fall back to the generic track-grid/icon art, never
  restore the real cover.

  Added a new `originalImage` field, written once at import time alongside
  `image` in all three `resolvePlaylist` payload branches (yt_video,
  yt_playlist, and the generic Spotify/SoundCloud/Apple Music branch) and
  carried through in `duplicateLibraryPlaylist` (~line 3454). `image` itself
  is still the only field the rest of the app reads for display, so no other
  render path changed.

  `openChangeArtFlow` now reads `originalImage` (falling back to `null` via
  `hasOwnProperty` for playlists saved before this change, since we can't
  know their true original) and only shows the reset button when
  `pl.image !== original` - i.e. when there's actually something to revert.
  The button is labeled "Reset to original art" and calls `apply(original)`
  when a real original is known, or "Remove custom art" (`apply(null)`, the
  old behavior) when it isn't - matching the two cases in the spec.

  Verified by serving this worktree with a plain `python3 -m http.server
  8934` (confirmed via `location.href` in the browser that the tab was on
  this worktree's server, not another lane's) and seeding a fake playlist
  in localStorage with `image`/`originalImage` both set to a native cover
  URL: opening "Change art" showed no reset button (nothing to revert),
  setting a custom image URL via "Use this image" made a "Reset to original
  art" button appear, and clicking it reverted `pl.image` back to the
  original URL in localStorage and updated the visible thumbnail
  immediately, with a "Playlist art updated" toast. No new console errors
  from the app (only pre-existing extension-injected script noise unrelated
  to this change).

  Caveat: playlists already saved in localStorage before this change have no
  `originalImage` field, so for them the reset button (when a custom image
  is set) falls back to the old "Remove custom art" behavior (clears to
  `null`, not the real original cover) since the true original was never
  captured. This matches the spec's fallback case and only affects
  previously-imported playlists that already had a custom override applied
  before this fix landed.

### disable-native-context-menu: Suppress OS/browser context menu on long-press
- **Status:** merged
- **Priority:** medium
- **Description:** Long-pressing/holding an item should only ever open
  EBBLESS's own internal menu - the device's or browser's native
  long-press/context menu should be disabled everywhere this applies.
- **Touches:** touch/hold handlers across track rows, playlist cards, etc.
  (likely needs `touch-action`/`contextmenu` prevention applied broadly).
- **Branch:** agent/disable-native-context-menu
- **Notes:** Synced from Geethub issue #57.

  Fixed and pushed (commit `e780879`): added `-webkit-touch-callout:none` to
  the global `body` rule plus a targeted rule on `img,.track-row,.lib-card,
  .q-row` (`-webkit-touch-callout`/`-webkit-user-select`/`user-select:none`)
  so no OS save-image sheet, selection popup, or magnifier can appear on
  hold over track rows, playlist/album cards, or album art. Added one global
  `contextmenu` listener (right after the existing `attachLongPress` helper)
  that calls `preventDefault()` on every event except inside `input`/
  `textarea`/`[contenteditable]`, so native Cut/Copy/Paste still works in
  text fields. Existing `attachLongPress` logic (playlist/album cards,
  track rows) is untouched - this only suppresses the native menu, not the
  app's own. Verified via a worktree-local `python3 -m http.server`
  (confirmed via `location.href`, using `127.0.0.1` + explicit `tabId`
  since the shared preview pane kept getting hijacked by other concurrent
  sessions' localhost servers): right-clicking (same event as touch
  long-press) a playlist card, album art, and a track row showed no native
  menu, only the app's own hover UI; normal taps/navigation still worked;
  no new console errors. **Caveat:** couldn't fully automate a real
  touch-and-hold gesture to confirm the app's own long-press menu still
  fires end-to-end (a JS-dispatched TouchEvent attempt got interrupted when
  the shared preview tab was closed by another session) - since
  `attachLongPress` itself wasn't touched, risk is low, but worth a manual
  spot-check.

### share-song-playlist: Share a song or playlist via link
- **Status:** merged
- **Priority:** medium
- **Description:** Add the ability to share a specific song or playlist - it
  should generate a nice link + message that, when opened, leads the
  recipient to install/open EBBLESS and play that song or playlist.
- **Touches:** new share feature, likely needs a share-link resolution route
  on the backend/worker plus a Web Share API integration client-side.
- **Branch:** agent/share-song-playlist
- **Notes:** Synced from Geethub issue #58. Related to `settings-share-app`
  above (sharing the app itself) - different scope, kept separate.

  Investigated the backend/worker route this entry's own `Touches` line
  suggested might be needed, and skipped it: `worker/src/index.js`'s
  `/playlist`/`/album` handling (`handleEmbed`) already scrapes Spotify's
  embed page for track lists but only ever returns `title`/`artist`/`image`/
  `duration` per track - it never passes back each track's own Spotify URI,
  so there was never a per-track canonical link to build a share URL from in
  the first place, and no existing share-link/shortener endpoint to extend.
  Went fully client-side instead, per this entry's own fallback guidance:
  the "backend" a shared link needs is just the *source* link itself
  (Spotify/YouTube/SoundCloud/Apple Music), which the app already knows how
  to resolve - it's exactly what `canonicalLinkForPlaylist()` (added by the
  merged `Copy link`/`Replace link` work) already reverses a playlist's
  `{type,id}` back into.

  Fixed and pushed (commit `46ba3eb`): added a "Share" item to both the
  playlist context menu (`openLibCtxMenu`, right before "Copy link") and the
  per-track context menu (`openTrackCtxMenuFor`, right after "Add to
  playlist"), each only shown when `canonicalLinkForPlaylist()` finds a real
  source link (custom playlists/Liked Songs have none, same guard "Copy
  link" already uses). Both funnel into `shareEbblessLink()`, which builds
  `{title, text, url}` and calls `navigator.share()` when available,
  swallowing a user-cancel rejection, falling back to
  `navigator.clipboard.writeText(url)` plus the existing "Link copied" toast
  otherwise (identical pattern to `shareAppBtn`/`copyPlaylistLink`). The
  `url` itself is `buildShareUrl()`'s output: `<origin><path>?import=<the
  canonical source link>` for a playlist, plus `&track=<index>` for an
  individual track share - a track has no source id of its own once it's
  sitting inside a resolved playlist (see the `handleEmbed` finding above),
  so sharing one re-shares its parent playlist/album's link plus its
  position within it instead of inventing a fake per-track identity.

  Opening that link is handled entirely client-side too: `startApp()` now
  calls a new `applySharedImportFromUrl()`, which reads `?import=`/`&track=`,
  strips them from the URL immediately (so a bad link or a refresh can't
  re-trigger the import forever), and pushes the source link through the
  *exact* same resolution path a manually pasted link takes -
  `parseImportLink()` -> `beginImport()`. The `{source,type,id} ->
  {internal id, type}` dispatch that used to live inline in `importForm`'s
  submit handler is now `beginImportFromParsedLink()`, shared by both call
  sites, so there's exactly one place that maps a pasted/shared link to a
  `beginImport()` call. `beginImport()` itself gained an optional
  `targetIndex` param, threaded into its `buildQueueFrom()` calls, that a
  shared track link uses to land on the right song instead of always track
  0. One real bug surfaced while testing this: `beginImport()`'s existing
  "jump into the player as soon as the first track resolves" optimization
  fires before the rest of the playlist (and therefore the actually-shared
  track) has resolved, so a naive `buildQueueFrom(targetIndex)` there would
  silently fall back to whichever track happened to resolve first (verified
  this happening - a `&track=3` link landed on track 0 instead). Fixed by
  skipping that early-jump callback entirely whenever `targetIndex` is set,
  so a targeted share always waits for the full resolve and lands on the
  right track, at the cost of that one optimization for shared-song opens
  specifically (whole-playlist shares and ordinary pasted links are
  unaffected and still jump in early as before).

  Verified via a worktree-local `python3 -m http.server`, driving the real
  UI (opening the library, right-clicking/kebab-clicking into both the
  playlist and per-track context menus, confirmed "Share" appears in the
  right position in each with `navigator.share`/`navigator.clipboard`
  patched to capture calls instead of mocked away): playlist share produced
  `.../index.html?import=https%3A%2F%2Fopen.spotify.com%2Fplaylist%2F...`
  with the text `Listen to "This is Mal Griot" on EBBLESS`; track share (a
  track at index 2) added `&track=2` and text naming that track/artist;
  with `navigator.share` removed, the same actions correctly fell back to
  `navigator.clipboard.writeText` plus the "Link copied" toast. Then
  simulated a recipient actually opening each generated link: navigating to
  a `?import=...&track=N` URL for an already-cached playlist jumped straight
  to the player on the right track; clearing storage entirely and opening a
  fresh `?import=<SoundCloud album URL>&track=3` link (a real, non-cached
  resolve, hitting the real worker/SoundCloud over the network) first showed
  the normal first-run splash-choice screen unchanged, then - after
  confirming the early-jump bug fix above - landed correctly on track index
  3 ("vast") once the full resolve finished; a plain `?import=` with no
  `&track=` on a fresh playlist link correctly autoplayed track 0. Confirmed
  the query params were stripped from the address bar after each import.
  Checked the console throughout: no new errors beyond the same pre-existing
  Google Identity/FedCM sign-in noise present on a completely vanilla load
  with none of this change's code touched. **Caveat:** real on-device
  confirmation of `navigator.share` opening an actual OS share sheet (as
  opposed to the captured-call/clipboard-fallback paths exercised here)
  wasn't possible in this headless tool, same caveat the merged
  `settings-share-app` entry above already notes for its own share button -
  worth a quick real-device check.

### single-song-paste-prompt: Prompt for target playlist when pasting a single song
- **Status:** merged
- **Priority:** medium
- **Description:** If the pasted link resolves to a single song (not a
  playlist/album), prompt the user for which playlist it should be added
  to - with a quick option to just add it to Liked Songs.
- **Touches:** `beginImport()` / paste-a-link flow.
- **Branch:** agent/single-song-paste-prompt
- **Notes:** Synced from Geethub issue #65.

  Fixed and pushed (commit `686f840`): previously a single-track paste
  (Spotify/Apple Music track, SoundCloud track, YouTube video) resolved via
  `resolvePlaylist()` into its own one-song "playlist" and got saved
  straight into the library with `saveToLibrary(id)` - a permanent,
  un-browsable one-track entry the listener never asked for. Added
  `isSingleTrackType(type)` and a new `openSingleTrackDestinationPicker(track)`
  (index.html, next to the existing `openAddToPlaylistPicker`/
  `openCreatePlaylistFlow`), which reuses the same import-overlay modal
  pattern to list the listener's existing custom playlists plus a "+ New
  playlist" row, with a one-tap "Liked Songs" shortcut pinned above the list
  (calls `ensureLikedPlaylist()` first since Liked Songs may not exist yet
  for someone who hasn't liked anything). `beginImport()` now checks
  `isSingleTrackType(pl.type)` right after `resolvePlaylist()` resolves and
  routes to the picker instead of `saveToLibrary`/`loadPlaylistIntoPlayer`;
  the `!force` cache-hit fast path at the top of `beginImport()` got the
  same check so re-pasting the same single-track link re-prompts instead of
  silently reopening the old one-track "playlist" in the player.

  Verified by serving this worktree's `index.html` directly with
  `python3 -m http.server` (confirmed via `location.href` in the browser,
  since the shared preview-tool launcher kept re-fronting a different
  worktree's dev server mid-session - had to force a fresh tab/navigate a
  few times to stay on the right origin). Pasted a real Spotify track link
  (`open.spotify.com/track/...`) against the live resolver backend twice:
  once picking an existing custom playlist ("Party Mix" went from 0 to 1
  track, correct art/title), once via "+ New playlist" (created "Chill
  Vibes" with the track, "Playlist created" toast), and once via the
  "Liked Songs" shortcut (created Liked Songs on the fly, "Added to Liked
  Songs" toast). After each, inspected `localStorage['ebbless:library']`
  directly and confirmed no orphan entry was ever added for the pasted
  track's own id - only the chosen destination playlist changed. No new
  console errors traceable to this change; the only console output seen
  ("unknown error fetching script", a transient 502 from the YouTube search
  step) reproduced identically on unrelated pages/origins before any
  interaction, so it's environmental noise in this browsing setup, not
  caused by this fix.

### clear-playlists-confirm: "Clear playlists" needs a serious confirm prompt + danger styling
- **Status:** merged
- **Priority:** medium
- **Description:** The Settings "clear playlists" button should show a
  serious-looking confirmation prompt before acting (reporter: should feel
  as weighty as deleting your account), and the button itself should look
  visually distinct/dangerous and be moved to the bottom of Settings.
- **Touches:** Settings screen, clear-playlists action.
- **Branch:** agent/clear-playlists-confirm
- **Notes:** Synced from Geethub issue #67. Straightforward, low-risk UX
  safety fix - good candidate for an early lane.

  Fixed and pushed (commit `dd08e73`): added a `.btn-danger` style (red
  border/text, filled-red on hover), a centered `#danger-scrim`/
  `#danger-modal` confirm dialog (deliberately a centered card rather than
  the edge-docked sliding sheets used elsewhere, to read as weightier),
  moved the button into a new "Danger zone" block at the bottom of Settings
  (replacing the old "Library" block), and updated its copy to note the
  action can't be undone. `clearLibraryBtn` now opens the modal instead of
  clearing immediately; Cancel/scrim-click closes it with no side effects;
  confirming runs the original clear logic then closes the modal. Verified
  via a worktree-local `python3 -m http.server` (confirmed `location.href`
  before trusting results, since a port collision with another session's
  server occurred on the first attempt): confirm dialog appears instead of
  an immediate clear, Cancel leaves `localStorage` untouched, confirming
  clears it and shows the "Library cleared" toast, button renders bottom-of-
  Settings with danger styling, no new console errors. Not tested against a
  real Spotify/SoundCloud-sourced playlist (used a seeded fake localStorage
  entry instead), but the clear path only touches localStorage keys
  regardless of playlist source.

### missing-starter-playlists: "This Is Mal Griot" (and possibly "Breathe Love Deep") not appearing
- **Status:** merged
- **Branch:** agent/missing-starter-playlists
- **Priority:** high
- **Description:** Reporter says both the "Breathe Love Deep" and "This Is
  Mal Griot" starter Spotify/SoundCloud releases aren't appearing in the
  library. Also reiterates "Breathe Love Deep" should come straight from
  SoundCloud, no Spotify routing.
- **Touches:** `STARTER_LIBRARY_URLS` / `seedStarterLibrary()`.
- **Notes:** Synced from Geethub issues #29 and #32 (#32 - "Soundcloud links
  should be treated as direct links" - folded in as the same underlying ask,
  already largely covered by the merged `breathe-love-deep-album` /
  `spotify-album-art` work for SoundCloud routing generally).
  **Investigated - could not reproduce with current code; no fix needed
  beyond re-verification.** Both `STARTER_LIBRARY_URLS` entries
  (`https://soundcloud.com/mal-griot/sets/breathelovedeep` and
  `https://open.spotify.com/playlist/2AcQTlTA3xgd9HAZJcHYmz`, whose oembed
  title is literally "This is Mal Griot") are live and reachable, and
  `seedStarterLibrary()` correctly parses and resolves both. Verified in a
  real browser by serving this worktree's own `index.html` directly
  (`python3 -m http.server`, confirmed via `location.href` that the served
  copy matched this worktree - the shared preview-tool launcher was seen
  routing to a different worktree/session's server mid-session, so every
  check here was pinned to the correct tab explicitly), clearing
  `localStorage`, and walking the real first-time flow (splash choice ->
  "Enter" -> app). Result: the library populates with "This is Mal Griot"
  (8 tracks, type `playlist`, resolved via the Spotify path) and
  "breathe love d e e p" under ALBUMS (10 tracks, id prefixed `sc:`, type
  `sc_album`) - confirming Breathe Love Deep resolves straight from
  SoundCloud with no Spotify routing, and that "This Is Mal Griot" is not
  actually missing. Repeated the check twice (once forcing
  `ebbless_onboarding_complete` to skip straight to `startApp()`, once via
  the genuine onboarding click-through) with identical results both times.
  Conclusion: whatever caused the original report - likely a transient
  backend hiccup against the shared `spotify-youtube-search.malgriot.workers.dev`
  worker, since `seedStarterLibrary()`'s per-URL resolve is wrapped in a
  silent best-effort try/catch with no retry - is not reproducible against
  the current `STARTER_LIBRARY_URLS`/`seedStarterLibrary()`/resolution code,
  which likely benefited from the unrelated `breathe-love-deep-album`,
  `spotify-album-art`, `album-art-2x2-grid-bug`, and
  `discovery-pipeline-metadata` merges touching the same shared resolve
  path. No code changes made. Moving to `review` rather than closing
  outright, since a live backend blip can't be ruled out from a local
  re-test - flag for close if a maintainer agrees.

### rename-current-playlist: Rename "Current" playlist to "CURRENTSSsss"
- **Status:** merged
- **Priority:** low
- **Description:** Rename the "Current" playlist label to "CURRENTSSsss"
  (exact casing/spelling as given).
- **Touches:** playlist naming/labels.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #24.

### currents-playlist-algorithm: Define Currents playlist selection rules
- **Status:** merged
- **Priority:** medium
- **Description:** The Currents playlist should be built from: one new/
  unplayed song per saved playlist, three suggested songs from the Liked
  Songs playlist, and one song based on the most recently played track -
  selection should weigh genre, year, and vibe, not just matching artist or
  album.
- **Touches:** Currents/recommendation generation logic.
- **Branch:** agent/currents-playlist-algorithm
- **Notes (2026-09-30):** User asked to add release year via the worker
  (soft year-closeness weighting); needs a worker deploy when merged.
- **Notes:** Synced from Geethub issue #36. Related to `blend-playlist`
  below (a second, broader auto-playlist) and `discovery-pipeline-metadata`
  - all touch recommendation logic, worth reviewing together for shared
  helpers. **Update (2026-09-22):** folded in Geethub issue #121
  ("currentsss playlist should have more diverse artist selection, keep the
  vibe tho") as the same underlying task rather than a separate entry -
  it's a specific selection-criterion request (diversify artists without
  losing vibe) that belongs inside this entry's "selection should weigh
  genre, year, and vibe" rule, not a standalone feature. Closed #121 with a
  comment pointing here.

### blend-playlist: Add an auto-updating "Blend" playlist across all saved playlists
- **Status:** merged
- **Priority:** medium
- **Description:** Add a playlist that pulls tracks from all of the user's
  saved playlists, refreshing with a different set of songs every day.
- **Touches:** new auto-playlist generation logic (parallel to Currents).
- **Branch:** claude/magical-franklin-cdyr5c
- **Notes:** Synced from Geethub issue #60. Named **"SwiiiRrrLL"** per the
  user (2026-09-29). Built as a system playlist (`BLEND_ID = 'blend'`),
  pinned right behind CuRRentSSsss, no rename/delete. Built locally, no
  network: up to 50 tracks from every saved playlist/album plus Liked Songs
  (podcasts, CuRRentSSsss, and Discover overflow left out), a fair share per
  source with unused slots handed to bigger sources, interleaved
  round-robin. Yesterday's picks go to the back of the line so the list
  rotates. Reblends once per local day (same 60s rollover poll as
  CuRRentSSsss), fills itself the first time the library has anything, and
  its 3-dot menu has "Reblend now". A reblend keeps the song playing now as
  track 0 (shares CuRRentSSsss' queue-remap helper).

### encourage-liking-songs: Nudge users to like more songs
- **Status:** merged
- **Priority:** high
- **Description:** Add UX nudges that encourage users to like more songs, to
  build a richer per-user dataset - goal is a personal algorithm that
  surfaces both known favorites and undiscovered music the user will likely
  love, not just generic popularity.
- **Touches:** UI prompts around the like button; unclear exact mechanism -
  needs design thought before implementation.
- **Branch:** agent/encourage-liking-songs
- **Notes:** Synced from Geethub issue #40. Vague/directional - needs a
  concrete design decision (what nudge, when, how often) before it's
  actionable as a lane.
  **Decision (2026-09-30):** build all three nudges: a gentle "like this?" prompt after a full listen, a like-streak counter, and a Discover hint that likes are shaping picks.
  **Built (fa1c2db):** post-listen "Like <title>?" chip (every 3+ played-through tracks, 10-min cooldown, backs off on ignores, never same track twice); like streak (toast + Liked Songs line, only when >=2 days, never mentions a broken streak); CuRRentSSsss hint "Based on your N liked songs...". Console helper `ebblessLikeNudge()`.

### accounts-profiles: Add accounts and cross-device profile sync
- **Status:** merged
- **Priority:** high
- **Description:** Add accounts/profiles so the experience (library,
  playlists, likes) is consistent between mobile and desktop, survives a
  device switch, and builds a long-term per-person dataset for
  personalization.
- **Touches:** major feature - needs backend auth, a database/storage layer
  beyond the current per-device `localStorage` model, and a data-migration
  story for existing users' local data.
- **Branch:** agent/accounts-profiles
- **Notes:** Synced from Geethub issue #75. Largest-scope item in this
  batch by far - architectural decision, not a quick lane. Recommend
  discussing approach before queuing.
  Geethub #182 folded in (bug report): user is signed in on desktop and mobile but playlists and settings differ between them - i.e. cross-device sync is what's expected.
  **Decision (2026-09-30):** ~~Supabase~~ revised same day: the app already has Google Sign-In profile sync to the Worker's `PROFILES` KV (restore-only-when-wiped, library only). Owner chose to extend that: full two-way sync of library, likes and settings with merge, plus a visible signed-in state.
  **Built (9283539):** schema-v2 profile (library/pins/playlists/settings) with per-item timestamps + 180-day tombstones, symmetric/idempotent merge shared by client and Worker; Worker `/profile/sync` merges server-side, writes KV only on change, backward-compatible with old records/clients; client pushes 20s after changes / on hide / on return, skips if hash unchanged; injected Account row (email, last synced, Sync now, Sign out/in). **Worker must be deployed** (staging first) - old client/new worker and new client/old worker both still work. **18eba4a:** like streak (`ebbless:likeStreak`) now synced; Account row moved to the top of Settings.

### instant-resume-caching: Cache current track for instant resume across app switches
- **Status:** merged
- **Priority:** medium
- **Description:** Switching away from and back to the app currently takes
  too long to resume the currently-loaded song - it should be cached so
  playback resumes instantly. Also ensure lock-screen and notification-drop
  -down playback controls stay fully responsive.
- **Touches:** playback state caching, `mobile-background-resume` (merged)
  - related but distinct: that fixed the splash re-appearing on resume, this
  is about resume *speed* and lock-screen control responsiveness.
- **Branch:** none - done directly against `main` (commit `24adec7`).
- **Notes:** Synced from Geethub issue #41. **Update (2026-09-22):** found
  already implemented directly on `main`, not through a lane - backlog
  status corrected from `ready`/unclaimed to `merged` to match reality.

### loading-progress-indicator: Add a loading screen/progress indicator while a track loads
- **Status:** merged
- **Priority:** medium
- **Description:** While a track is loading, show a loading indicator -
  reporter suggests reusing the play button's existing filling-ring
  animation style as a progress indicator.
- **Touches:** player view, track-load state.
- **Branch:** agent/loading-progress-indicator
- **Notes:** Synced from Geethub issue #42.

### play-first-loaded-track: Play first resolved track immediately during playlist sync
- **Status:** merged
- **Priority:** medium
- **Description:** When a playlist is pasted, the first track to finish
  resolving should start playing immediately rather than waiting for the
  whole playlist. Skip should be disabled until the whole playlist has
  loaded (then re-enabled) - or, alternatively, show a "play now" prompt on
  the loading screen instead of auto-playing.
- **Touches:** `beginImport()` playlist-load flow, playback start trigger.
- **Branch:** none - done directly against `main` (commit `d98675a`).
- **Notes:** Synced from Geethub issue #82. Reporter offered two options
  (auto-play immediately vs. a "play now" prompt) - leaning toward the
  prompt per their own follow-up ("Actually, it should be a prompt"), but
  flagging both for your call. **Update (2026-09-22):** found already
  implemented directly on `main` (went with immediate auto-play, not the
  prompt) - backlog status corrected from `ready`/unclaimed to `merged` to
  match reality.

### pwa-update-propagation: Updates should reach already-installed mobile PWAs
- **Status:** merged
- **Priority:** medium
- **Description:** When a new version is deployed, users who already
  installed EBBLESS to their mobile home screen should receive the update,
  not stay stuck on the version they installed.
- **Touches:** `sw.js` service worker update/activation logic, `index.html`
  service worker registration + a new "Update available / Refresh" toast.
- **Branch:** `agent/pwa-update-refresh`
- **Notes:** Synced from Geethub issue #33. Root cause: `sw.js` had no
  version marker of its own and did zero caching, so a deploy that only
  touched `index.html` (the common case, since this is a single-file app)
  never changed `sw.js`'s bytes - and a browser only re-checks/reinstalls a
  service worker when the SW *file* is byte-different. Combined with an
  installed/home-screen app rarely triggering a fresh navigation (the only
  time browsers auto-check for a new SW), already-installed users could go
  a very long time without ever getting a new worker at all.
  Fix: `sw.js` now carries a `CACHE_VERSION` string meant to be bumped every
  deploy (see its top comment) so its bytes actually change; `index.html`
  registers with `updateViaCache:'none'` and proactively calls
  `registration.update()` on visibility/focus/hourly-interval so a resumed
  or long-lived session gets checked even without a fresh navigation.
  `skipWaiting`/`clients.claim` (already present) still make an update take
  over promptly once detected, but instead of forcing a reload out from
  under someone (e.g. mid-playback), `index.html` now listens for
  `controllerchange` and shows a small "Update available / Refresh" toast
  (new `#swUpdateToast` element + `.sw-update-toast` CSS) that reloads only
  when tapped.
  Verified: registered/exercised the worktree's own `index.html`+`sw.js`
  (confirmed via `location.href`) served from a local `python3 http.server`
  with `node --check` passing on both `sw.js` and the extracted inline
  script, and by manually triggering/inspecting the `#swUpdateToast` markup,
  CSS, and its reload-on-click handler in a real browser (screenshot
  confirmed it renders correctly above the mini-player and the Refresh
  button does call `location.reload()`). **Verification gap:** the actual
  service-worker *registration* itself could not be exercised end-to-end -
  this sandbox's automated browser refuses all `navigator.serviceWorker
  .register()` calls outright ("An unknown error occurred when fetching the
  script"), reproduced even with a trivial one-line dummy worker and with
  both HTTP/1.0 and HTTP/1.1 local servers, so it's an environment
  restriction, not a bug in this change. The registration/update-detection
  code path (`reg.update()`, `updatefound`, `controllerchange`) is
  therefore unverified live and should get a real-device/real-browser check
  before this is fully trusted - a second real deploy (bumping
  `CACHE_VERSION`) against an already-installed PWA is the strongest test.

### deploy-cache-refresh: Deploys should bust cached assets/cookies on update
- **Status:** merged
- **Priority:** medium
- **Description:** When a new version is deployed, it should refresh users'
  cached assets/cookies so they see the update rather than a stale cached
  version.
- **Touches:** `sw.js` service worker cache versioning/invalidation.
- **Branch:** `agent/pwa-update-refresh`
- **Notes:** Synced from Geethub issue #34. Same fix and lane as
  `pwa-update-propagation` above. `sw.js` previously did no caching of any
  kind (by design - EBBLESS needs live network access for Spotify/YouTube
  on every load), which meant there was no cache to invalidate but also
  nothing forcing a stale `index.html` to be re-fetched once cached by
  HTTP. `sw.js` now caches only the app shell (`index.html`,
  `manifest.json`, `./`) under a versioned `CACHE_VERSION` cache name;
  `activate` deletes any cache whose name doesn't match the current
  version, and navigations are served network-first with the versioned
  cache only as an offline fallback - so bumping `CACHE_VERSION` on deploy
  both forces the update-detection described above and guarantees old
  shell caches don't linger. All non-navigation requests (Worker/Spotify/
  YouTube calls, audio, images) remain completely uncached, unchanged from
  before.
  Verified: same as `pwa-update-propagation` above - `node --check` on
  `sw.js`, and manual inspection of the cache-open/delete/network-first
  logic; the live Cache Storage behavior (old cache entries actually being
  evicted, network-first actually falling back when offline) could not be
  exercised because service worker registration itself is blocked in this
  sandbox's browser (see gap noted above). Recommend confirming via
  DevTools Application > Cache Storage on a real deploy that only one
  `ebbless-shell-v*` cache exists after an update.

### volume-equalizer: Volume equalizer/normalization across tracks
- **Status:** merged
- **Priority:** low
- **Description:** Add a volume equalizer so loudness is consistent across
  different tracks (avoids jarring volume jumps between songs).
- **Touches:** playback audio pipeline - likely Web Audio API gain
  normalization.
- **Branch:** claude/magical-franklin-cdyr5c
- **Notes:** Synced from Geethub issue #37. Scoped as automatic per-track
  leveling, not a manual EQ UI. Web Audio can't touch the cross-origin
  YouTube iframe, so it works through `setVolume`: the worker's `/ytvideo`
  now also returns YouTube's own `loudnessDb` for the video (cache key
  bumped to `ytvideo2`), and `effectiveVolume(deck)` plays every track 5 dB
  under YouTube's target, giving quieter-than-normal tracks that headroom
  back (YouTube already turns loud ones down itself). Every crossfade/
  pause-fade path now scales per deck. Settings > Playback > "Even out
  volume" (default on). **Needs a worker deploy** for the loudness data; on
  the old worker every track is treated as normal loudness (no leveling
  effect, just the flat 5 dB headroom).

### clip-editor: Audio clip editor with a "My Clipsss" playlist
- **Status:** archived
- **Priority:** low
- **Description:** Add an audio editor that lets users clip a track (trim to
  a range) and apply fades. Saved clips go into a new "My Clipsss" playlist
  in the library. Reporter suggests using timestamp-based play/pause as a
  simpler, less data-intensive implementation instead of real audio
  re-encoding.
- **Touches:** new feature - clip editor UI, playback-range/fade logic, new
  playlist type.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #39. Sizable new feature - likely its
  own lane, not a quick fix.

### feedback-prompt: "Are you feeling this app or nah?" periodic feedback prompt
- **Status:** merged
- **Priority:** low
- **Description:** After a few days of use, show a thumbs-up/thumbs-down
  prompt. Either choice should prompt for more detail, and that feedback
  should feed into this same improvements queue - but tagged as
  user-submitted (same as the existing GitHub-idea intake channel) and
  waiting for Mal's confirmation before any lane is dispatched on it, same
  as everything else synced from GitHub.
- **Touches:** new in-app prompt/survey UI, feeds into the GitHub-issue
  intake channel already described above.
- **Branch:** agent/feedback-prompt
- **Notes:** Synced from Geethub issue #44.

### tester-feedback-form: Form for beta testers to report on the app
- **Status:** dropped
- **Priority:** low
- **Description:** Add a form specifically for beta testers to give
  structured feedback on the app.
- **Touches:** likely reuses/extends the existing `improvement-idea.yml`
  GitHub issue template intake channel, or a dedicated form.
- **Branch:** agent/tester-feedback-form (not merged - dropped)
- **Notes:** Synced from Geethub issue #47. Overlaps somewhat with
  `feedback-prompt` above - both are feedback-collection mechanisms;
  worth discussing whether one covers both needs before building both.
  Built and pushed to `agent/tester-feedback-form` (new `tester-feedback.yml`
  issue template + a "Report as a beta tester" Settings row), but dropped
  by you as redundant with the existing "Suggest an improvement" intake -
  not merged. Branch left in place, not deleted.

### library-search: Add a search function for the user's own library
- **Status:** merged
- **Priority:** medium
- **Description:** Users should be able to search their own library for a
  song or playlist they already have, rather than scrolling to find it.
- **Touches:** library view UI, likely a new search input + filter over the
  in-library playlists/tracks list.
- **Branch:** agent/library-search
- **Notes:** Synced from Geethub issue #84.

### playlist-vibe-search: Search Spotify/Apple Music/SoundCloud for playlists by vibe/keyword
- **Status:** merged
- **Priority:** medium
- **Description:** The playlist-input bar should let a user search by vibe
  or keyword (not just paste a direct link) and get back a matching
  playlist - or a list of candidates to pick from - that then loads
  straight into their library.
- **Touches:** playlist input bar / import flow, likely a new search
  endpoint against Spotify/Apple Music/SoundCloud rather than the existing
  direct-link resolve pipeline.
- **Branch:** agent/playlist-vibe-search
- **Notes:** Synced from Geethub issue #85. Distinct from `library-search`
  above (that one searches what the user already has; this one searches
  external platforms to find something new to add) - kept separate.

  **Implementation notes (this pass):** Built and scoped to SoundCloud +
  Apple Music only - Spotify search is not included, deliberately. Spotify's
  official Web API search needs a Client Credentials token, and per the
  worker's existing `/spotifyart` comment, minting one now requires an
  active Premium subscription just to create the developer app - the same
  dead end that already forced `/spotifyart` off the Web API onto iTunes'
  API. The other path - scraping open.spotify.com's own anonymous
  "web player" access token (`/get_access_token`) - was considered and
  rejected: it's an unofficial, session-shaped endpoint (not a stable public
  surface like the `__NEXT_DATA__`/`serialized-server-data` embeds this
  codebase already scrapes for direct-link resolution), so it carries real
  ToS/stability risk for comparatively little gain.

  Added a new worker endpoint, `GET /playlistsearch?q=&storefront=&limit=`
  (`worker/src/index.js`), that runs two scrapes in parallel via
  `Promise.allSettled` (one source failing doesn't take down the other):
  - **SoundCloud**: `api-v2.soundcloud.com/search/playlists`, reusing the
    exact same `getSoundCloudClientId()` rotating-client_id mechanism the
    existing `/soundcloud` direct-link endpoint already depends on in
    production - no new credential-acquisition logic. Filtered to real
    `/sets/` playlists (excludes SoundCloud's own algorithmic
    "system-playlist" results, which the existing resolve pipeline can't
    handle).
  - **Apple Music**: scrapes `music.apple.com/{storefront}/search?term=`,
    which dehydrates into the same `serialized-server-data` blob as the
    album/playlist/song pages `/amlist` already scrapes - reuses
    `extractServerData`, just reads the `... - playlist` section instead of
    one entity's tracklist.

  Each result comes back already shaped like `parseImportLink()`'s output
  (`{source, type, id[, storefront]}`), so `index.html`'s
  `beginImportFromParsedLink` consumes a picked candidate directly - no
  second resolve pipeline. Client side: `#urlInput`'s submit handler now
  only shows the old "doesn't look like a supported link" error when the
  text actually looks like an attempted URL (`looksLikeUrl()`); anything
  else is sent to `/playlistsearch` via `beginVibeSearch()`, which reuses
  the existing import overlay (`importStage`) for a "Searching..." spinner
  and then a picker (`stageSearchResults()` - art, title, curator/uploader,
  source badge) instead of building a separate UI surface.

  **Verified:** worker syntax (`node --check`); ran the worker locally via
  `wrangler dev` (not deployed) and hit `/playlistsearch?q=chill%20afrobeat`
  directly - got real, well-formed candidates from both SoundCloud and
  Apple Music; fed a candidate from each source back into the existing
  `/soundcloud?url=` and `/amlist?kind=playlist&...` endpoints and confirmed
  both resolve to real tracklists, confirming a picked candidate really
  round-trips through the unmodified resolve pipeline. Also checked missing
  `?q=` (400), a nonsense query (empty `results: []`, not an error), and
  `limit=` clamping. Exercised the actual client UI in a browser against
  this worktree's `index.html` (served on a dedicated port, confirmed via
  response content that it wasn't the main checkout or another worktree) -
  typing a non-link phrase into the input bar correctly triggered the
  search flow instead of the old link-parse error; it hit the **production**
  worker (which doesn't have `/playlistsearch` yet) and correctly rendered
  the 404 through the new error stage, confirming the client-side wiring
  end to end even though full search results couldn't be seen against prod
  pre-deploy.

  **Not verified / caveats:** the worker changes are NOT deployed to the
  live Cloudflare Worker (`spotify-youtube-search.malgriot.workers.dev`) -
  only tested locally via `wrangler dev`. Someone needs to `cd worker &&
  npx wrangler deploy` (per README) before this is live for real users.
  Apple Music search defaults to the `us` storefront server-side since the
  input bar has no other signal for the visitor's market - results may skew
  US-centric for listeners elsewhere (direct Apple Music links don't have
  this limitation, since those already carry their own storefront). Did not
  test on a real mobile viewport or with a screen reader. SoundCloud's
  `client_id` scrape is the same mechanism already live in production for
  `/soundcloud`, so it's presumed to keep working the same way, but wasn't
  independently stress-tested for rotation/expiry beyond what the existing
  endpoint already handles.

### mobile-ipod-ui: Mobile UI mode styled like the original iPod (click wheel)
- **Status:** archived
- **Priority:** medium
- **Description:** Add an alternate mobile UI mode that looks and behaves
  like the original iPod - including the click-wheel scrolling interaction
  for navigating the library/menus.
- **Touches:** new feature - mobile UI, likely a toggleable theme/mode plus
  a custom scroll-wheel gesture control.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #86. No overlap with any existing
  entry found - a standalone UI-mode feature.

### ambient-soundscapes: Background ambient sound layer option
- **Status:** archived
- **Priority:** medium
- **Description:** Add a player option to layer a background ambient sound
  under the music - fireplace crackling, soft rain, cafe, forest, beach, car
  ride, etc.
- **Touches:** playback audio pipeline - a second, independently-mixed audio
  layer alongside the main track.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #89. Conceptually adjacent to
  `lp-quality-audio` below (that issue's title also mentions "ambient
  undertones") but this one is concretely scoped (named ambience presets)
  while that one is vague/research-flagged - kept separate rather than
  merged; worth your call on whether they should become one "sound
  atmosphere" feature.

### equalizer-presets: Equalizer presets for playback
- **Status:** archived
- **Priority:** medium
- **Description:** Add selectable EQ presets for the playing music (e.g.
  bass boost, vocal, flat, treble). No further detail given in the issue.
- **Touches:** playback audio pipeline - Web Audio API EQ/filter nodes.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #88. **Flagging as a judgment call,
  not auto-merged:** overlaps with the existing `volume-equalizer` entry
  above (Geethub issue #37, loudness normalization across tracks) and with
  `lp-quality-audio` below (Geethub issue #87, vinyl-warmth EQ) - all three
  are "shape the sound" features but aimed at different problems (leveling
  loudness vs. selectable tonal presets vs. simulating LP warmth). Could
  ship as one unified "sound" settings panel or stay as separate lanes -
  your call before any of these get built.

### lp-quality-audio: "LP quality" sound option (vinyl warmth EQ/ambience)
- **Status:** archived
- **Priority:** medium
- **Description:** Add an option/setting that gives playing music an "LP
  quality" sound - reporter flags this needs research into sound
  settings/EQ and "ambient undertones" before it's actionable; not yet
  scoped to a concrete implementation.
- **Touches:** playback audio pipeline - likely EQ shaping plus subtle
  ambient/noise texture (vinyl crackle?) - needs research/scoping first.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #87. **Flagging as a judgment call:**
  overlaps with both `equalizer-presets` (EQ shaping) and
  `ambient-soundscapes` (ambient layer) above - this issue's own title
  straddles both. Least concrete of the three; may turn out to just be "an
  equalizer-presets preset" once scoped, rather than its own feature.

### album-art-resolution: Album art is blurry/low quality on desktop
- **Status:** merged
- **Priority:** medium
- **Description:** On desktop, album art often renders blurry or low
  resolution. Investigate the desktop art-rendering path and prefer/request
  higher-resolution source images (e.g. larger iTunes/Spotify/SoundCloud
  artwork sizes) where the current pipeline is settling for a smaller image.
- **Touches:** track/playlist art resolution (`resolveTrackArt()`,
  `searchItunesTrackArt()`/`artworkUrls()`), desktop album art rendering.
- **Branch:** agent/album-art-resolution
- **Notes:** Synced from Geethub issue #91. No existing entry covers image
  resolution/sharpness specifically - `album-art-icon-colors` and
  `album-art-2x2-grid-bug` are unrelated bugs (accent color, placeholder
  grid), not resolution.

### lyrics-accuracy: Wrong/missing lyrics even when correct lyrics are findable elsewhere
- **Status:** merged
- **Priority:** medium
- **Description:** Sometimes lyrics don't show even though the correct
  lyrics are findable on Google or Genius. Reporter's example: "Nova Deli"
  by Luedji Luna (genius.com/artists/Luedji-luna) has lyrics on Genius but
  not in-app. Investigate the current lyrics-lookup source/matching and
  improve match accuracy/coverage, possibly by using Genius as a source or
  fallback.
- **Touches:** lyrics fetch/matching pipeline (wherever lyrics are looked up
  by title/artist).
- **Branch:** agent/lyrics-accuracy
- **Notes:** Synced from Geethub issue #90. No existing entry covers lyrics
  accuracy/sourcing - `lyrics-glow-trail` above is a visual effect on
  already-displayed lyrics, unrelated.
  Geethub #195 folded in: use free third-party sources (LRCLIB named; app already queries lrclib by title/artist) to fill tracks with no lyrics, verify it's the right song, and use synced timestamps.

### background-playlist-loading: Playlist/album loading should run in the background with a progress bar
- **Status:** merged
- **Priority:** medium
- **Description:** When a playlist/album/song is loading, the user should be
  able to freely return to the main pages instead of being stuck waiting - a
  progress bar somewhere in the UI shows load status and disappears on
  completion. On finish, default behavior is to just add the loaded
  playlist/album to the library (no auto-play); optionally, the user should
  be able to choose to play it immediately and replace the current queue
  once loading finishes.
- **Touches:** `beginImport()` playlist-load flow, loading-state UI.
- **Branch:** none - done directly against `main` (commits `1b078d6`,
  `ac67c8f`, `699db0b`).
- **Notes:** Synced from Geethub issue #93. Previously flagged as a
  judgment call overlapping `loading-progress-indicator` and
  `play-first-loaded-track`. **Update (2026-09-22):** found already
  implemented directly on `main` - "Show background-loading progress in the
  queue panel", "Don't let background playlist resolution disturb what's
  playing now", and "Disable and pulse the Load button while an import is
  in flight". Backlog status corrected from `draft` to `merged`. Whether
  this also resolved `loading-progress-indicator`'s narrower per-track
  ask is unconfirmed - left that entry as-is for your call.

### podcasts: Support loading and playing podcasts
- **Status:** merged
- **Priority:** medium
- **Description:** Add podcast support - load single episodes, or paste a
  link to a podcast's page and have it load all episodes.
- **Touches:** likely a new content-source path alongside the existing
  Spotify/Apple Music/SoundCloud/YouTube resolution pipeline - needs
  scoping (podcast source/API, episode list resolution, playback).
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #92. No existing entry covers
  podcasts - this is a new content type/feature area, not a fix to
  anything already in the backlog. Likely a larger lane than most entries
  here given it's a new source type; may be worth scoping/splitting once
  picked up. Issue #92 reopened 2026-09-23 with examples: single episode
  `open.spotify.com/episode/0F73EhH9QeUblG8i2IO3eu`, whole show
  `open.spotify.com/show/5XhS5WBxLYgN3S9KhEyrrF`. User suspects a more
  reliable free, good-quality source is needed for podcast and audiobook
  audio (not just YouTube matching).
- **Branch:** claude/magical-franklin-cdyr5c (2026-09-29)
- **Built:** podcasts play the show's real audio file from its public RSS
  feed, never a YouTube match. New worker endpoint `/podcast` takes a
  Spotify show/episode id (reads the name off Spotify's embed page, then
  finds the feed in Apple's free iTunes podcast directory), an Apple
  Podcasts show/episode id (iTunes lookup gives the feed directly), or a
  raw RSS URL, and returns up to 300 newest episodes. In the app: new
  `pod_show` library type (ids `pod:<src>:<id>`); an episode link imports
  the whole show and starts on that episode; episodes use a new `'au'` deck
  kind (a plain `<audio>` element behind the same player surface as the YT/
  SoundCloud decks, videoId `au:<file url>`). Discover, lyrics, loudness,
  wrong-track flag, and relinking are all off for episodes; podcasts stay
  out of CuRRentSSsss and SwiiiRrrLL. A saved show refreshes its episode list
  in the background after 6h. **Needs a worker deploy.** Spotify-exclusive
  shows have no public feed and give a clear error. Couldn't reach Spotify
  or iTunes from the build container, so the Spotify embed field names for
  show/episode are read defensively (with an oEmbed fallback). Check them
  against the live worker first.
- **YouTube fallback (2026-09-30):** a non-subscriber Spotify show with no
  public feed in any directory (iTunes rate-limits the worker; fyyd and
  gpodder are the working fallbacks) now falls back to YouTube: episode
  list from Spotify's embed (or the show's own YouTube channel uploads),
  each episode matched via new `/podcastmatch` (strict: >=60% title overlap,
  show's own channel or >=85% overlap, similar length, clips/trailers/
  reactions rejected). Newest 25 + the linked episode; playback starts on
  the first match; refresh reuses earlier matches. Subscriber-only shows
  (🔓/"Premium") are never sent to YouTube. Verified live: Spotify show
  5XhS5WBx... is "NoSleep Premium (🔓)" (paid), and episode 0F73EhH9...
  resolves to The NoSleep Podcast's public feed.

### currentsss-casing-followup: Fix "Currents" playlist casing to "CuRRentSSsss"
- **Status:** merged
- **Priority:** low
- **Description:** The Currents playlist was renamed to "CURRENTSSsss" (all
  caps) by `rename-current-playlist` (merged), but the reporter now wants
  the exact casing "CuRRentSSsss" (mixed case, not all-caps) instead.
- **Touches:** playlist naming/labels (same spot `rename-current-playlist`
  touched).
- **Branch:** agent/currentsss-casing-followup
- **Notes:** Synced from Geethub issue #94. Follow-up correction, not a
  duplicate - the already-merged rename used different casing than this
  request specifies. Fixed in commit 3ecabc6: replaced all 5 occurrences
  of the string "CURRENTSSsss" in index.html (the onboarding marquee
  label, the library card name div, and the three playlist-data `name`
  fields set in `ensureSwellPlaylist`/its fallback) with the exact
  mixed casing "CuRRentSSsss". Internal identifiers (`SWELL_ID`, the
  `current-label` CSS class, `LS_PL` key) were left untouched since
  they aren't user-facing. Verified by serving index.html locally
  (`python3 -m http.server`) and confirming the onboarding discovery
  card renders "CuRRentSSsss" in both the marquee and name label.

### playlist-remove-track-library: Option to remove tracks from a playlist in library
- **Status:** merged
- **Priority:** medium
- **Description:** Add an option to remove individual tracks from a playlist
  directly from the library view.
- **Touches:** library playlist view, track row actions/menu.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #95.

### fullscreen-lp-cassette-visual: Fullscreen on LP/cassette should fullscreen that visual, not standard album art
- **Status:** merged
- **Priority:** medium
- **Description:** Activating fullscreen while the LP (spinning record) or
  cassette art style is selected currently switches to the standard album
  art in fullscreen instead of fullscreening the LP/cassette visual itself.
- **Touches:** album art style fullscreen logic (art-style picker /
  fullscreen toggle).
- **Branch:** agent/fullscreen-lp-cassette-visual
- **Notes:** Synced from Geethub issue #96. Distinct from `record-cassette-size`
  (merged - that changed the visuals' size, not fullscreen behavior).

  Root cause: `openFlow()` (the "flow mode" fullscreen entry point,
  `index.html` ~line 6647) only ever populated `#flowArtWrap` with the
  generic `flowArtA`/`flowArtB` album-art `<img>`s, or - when the
  visualizer tab was active - moved the real `#vizCanvas` into
  `#flowVizWrap`. It never accounted for the record/cassette art style:
  the actual `#artRecord`/`#artCassette` elements live inside
  `#artworkWrap` in the normal player and are shown/hidden purely by the
  `.artwork-wrap[data-art-style=...]` CSS selectors (see the
  `record-cassette-size` notes for that markup), so once flow mode moved
  the view outside `#artworkWrap` those selectors no longer matched and
  fullscreen fell back to the flat album-art images.

  Fix: `openFlow()` now moves the real `#artRecord` or `#artCassette`
  element into `#flowArtWrap` (and sets `flowArtWrap.dataset.artStyle`)
  whenever flow mode opens on that style and the visualizer isn't active
  - the same "relocate the live element" pattern already used for
  `#vizCanvas`/`#flowVizWrap` - and `closeFlow()` moves it back to its
  original spot. New CSS scoped to
  `#flow-layer .flow-art[data-art-style="record"/"cassette"]` shows the
  moved element and hides the flat `.art` images in that state, and
  `setPlayingUI()` now also toggles `is-playing` on `flowArtWrap` so the
  record-spin animation (which depends on an `.is-playing` ancestor
  class) keeps running once the disc is inside the fullscreen layer.
  Default-style fullscreen is untouched - `flowArtWrap.dataset.artStyle`
  is simply deleted and the original image-swap path runs as before.

  Verified by serving this worktree directly with
  `python3 -m http.server` (the shared preview-tool launcher was
  confirmed, per the `EBBLESS/CLAUDE.md` warning, to sometimes serve a
  different worktree's `index.html`; every check below re-confirmed
  `location.href`/a fetch of `/index.html` for the fix's marker text
  before trusting the page) and driving the app in-browser: with the
  Spinning Record style selected and a track loaded, fullscreen showed
  the actual spinning record filling the view, and
  `artRecord.parentElement.id === 'flowArtWrap'` with
  `flowArtWrap.dataset.artStyle === 'record'`. With Cassette Tape
  selected, fullscreen showed the real cassette element the same way
  (`artCassette.parentElement.id === 'flowArtWrap'`). With the Default
  style, fullscreen still showed the normal album art
  (`flowArtA`/`flowArtB` opacity 1/0) and both `#artRecord` and
  `#artCassette` stayed put inside `#artworkWrap` - no regression.
  Checked the browser console throughout; the only error present
  (`intro-theme.mp3` fetch aborted) is pre-existing background noise
  unrelated to this change, not something introduced by it.

  **Follow-up (commit 01f26de):** after the user's first review, two
  more changes on top of the fix above, both scoped to the record/
  cassette fullscreen view only (default flat-album-art fullscreen is
  untouched): (1) `#flow-layer .flow-art[data-art-style="record"/
  "cassette"]` now overrides the shared `min(52vh,62vw)` sizing to
  `min(86vh,86vw)` so the moved-in element reads as genuinely
  fullscreen-scale; centering still comes for free from `#flow-layer`'s
  own flex layout, and the record/cassette markup already sizes its
  internals (label, reels) by percentage so nothing clipped or
  distorted at the larger size. (2) added a `<canvas id="flowArtParticles"
  class="flow-art-particles">` as the first child of `#flowArtWrap`
  (so it sits behind the moved-in `#artRecord`/`#artCassette` by DOM
  order, same trick as the existing z-index-free stacking elsewhere in
  this file), only shown via CSS when `data-art-style` is `record` or
  `cassette`. It renders ~60 soft glowing particles drifting slowly via
  `requestAnimationFrame` (`flowPartsDraw`/`flowPartsStart`/
  `flowPartsStop`, resize handled by `flowPartsResize` mirroring the
  existing `vizResize()` pattern), tinted from `--player-accent`. Reading
  that custom property directly with `getComputedStyle` can hand back
  the literal unsubstituted string `"var(--accent)"` rather than a
  usable color (custom-property computed values don't substitute their
  own nested `var()` references) - worked around with a hidden probe
  `<span style="color:var(--player-accent)">` and reading its computed
  `color`, which the browser must fully resolve. `openFlow()` calls
  `flowPartsStart()` only on the record/cassette branch and
  `flowPartsStop()` otherwise; `closeFlow()` always calls
  `flowPartsStop()`. `updatePlayerAccentColor()` now also calls a new
  `syncFlowPartsColor()` after setting `--player-accent` (success and
  error paths both), so switching tracks while fullscreen is open
  re-tints the particles instead of leaving them on the previous
  track's color. There's currently no in-fullscreen art-style switcher
  in this app (swiping the flow view changes track, not style), so
  "switching styles while already in fullscreen" wasn't a reachable
  case to wire up separately - style changes only take effect on the
  next `openFlow()`.

  Verified in-browser the same way as above (worktree served directly
  with `python3 -m http.server`, `location.href` re-confirmed before
  trusting the page - the shared preview launcher had, per this
  session's earlier discovery, a stray server left over from a
  *different* worktree still bound to the first port tried, so this
  session killed it and rebound a fresh one to confirm `lsof -a -p
  <pid> -d cwd` pointed at this worktree before testing). With the
  Spinning Record style and the "I Tried It" track playing, fullscreen
  showed the disc at roughly double its previous size, centered, with
  no clipping in the label/spindle, and soft pink particles
  (`rgb(193,92,122)`, matching the live `--player-accent`) drifting in
  the corners. Repeated with Cassette Tape: same larger centered
  sizing, reels/shell undistorted, particles visible against the
  busier album-art-derived ambient background. Skipping to the next
  track ("Helicopter Man") while still in fullscreen changed
  `--player-accent` to `rgb(199,87,141)` and the particle tint visibly
  followed. Confirmed the default flat-album-art fullscreen view was
  untouched: still exactly `min(52vh,62vw)` (measured
  `flowArtWrap`'s computed width against `window.innerHeight` -
  423.27px on an 814px-tall viewport, matching 52%), and
  `flowArtWrap.dataset.artStyle` unset with no particle canvas showing.
  Confirmed the animation loop actually stops on exit: patched
  `window.requestAnimationFrame` to count calls, measured a nonzero
  delta while fullscreen was open on the record style, then measured
  again after clicking the exit button - delta dropped to exactly 0 in
  one run (a later re-check showed a small nonzero baseline of ~3
  calls/sec present even with no fullscreen open at all and no art
  style selected, i.e. pre-existing background rAF activity elsewhere
  in the app unrelated to this change - confirmed by measuring the same
  baseline noise both with the record-style particle loop stopped and
  with the default-style fullscreen open, where no particle code runs
  at all). Checked the console throughout: no new errors, only the
  same pre-existing background noise as before (service-worker script
  fetch, a cross-origin YouTube iframe `postMessage` warning, and a
  `web-share` feature warning) - none introduced by this change.

  **Follow-up (2026-09-22, commit `8848318`):** user reported the fullscreen
  view "a little glitchy... the bg is blinking a lot" after trying the
  above. Root cause: `flowPartsDraw()` was calling `createRadialGradient()`
  + `fill()` for all 60 particles on every single animation frame -
  expensive enough on real devices to drop frames, which reads as the
  whole particle layer blinking/strobing rather than drifting smoothly.
  Fixed by pre-rendering one tinted glow sprite once (`buildFlowPartsSprite()`,
  a small offscreen canvas) and reusing it every frame via `drawImage()`
  with `globalAlpha` for the per-particle pulse - the sprite is only
  rebuilt when `--player-accent` actually changes (via `syncFlowPartsColor()`
  now diffing before rebuilding), not every frame. Verified by sampling the
  canvas's alpha channel across 30-60 consecutive animation frames
  (`getImageData` sums) before and after: values change smoothly frame to
  frame with no drops to zero or spikes, consistent with the intended slow
  drift rather than a strobe. Also bumped the *default* (flat album art,
  no record/cassette style) fullscreen size from `min(52vh,62vw)` to
  `min(86vh,86vw)` per the same follow-up ("the fullscreen album art should
  be bigger also. the lp and cassette look fine") - confirmed via
  `getBoundingClientRect()` that it now measures exactly `min(86vh,86vw)`
  for the viewport tested, and visually confirmed no clipping at that size.
  Re-checked record and cassette styles too - unaffected, still
  `min(86vh,86vw)`, particles still render correctly. No new console
  errors (only the same pre-existing sandbox noise).

  **Follow-up 2 (2026-09-22, commit `1c4dae3`):** user reported the
  particle background was *still* blinking after the sprite optimization
  above, and separately asked for the normal player's album-art style
  switcher (Default/Spinning Record/Cassette Tape) to also be reachable
  from fullscreen. On the blinking: rather than keep chasing an
  unreproducible glitch, the user said to just drop the particle layer
  since they didn't find it attractive anyway and already like the
  existing drifting/blurred `.flow-ambient` background (pre-existing,
  built from the track's own blurred album art) - so the entire particle
  system (`flowArtParticles` canvas, `flowPartsStart/Stop/Init/Draw/Resize`,
  the accent-color probe, the sprite cache) was removed outright, along
  with its CSS and the now-unused `syncFlowPartsColor()` hooks in
  `updatePlayerAccentColor()`. The ambient ("bg colors moving") layer the
  user said they like is untouched by this - it was never part of this
  entry's work, just already there.

  For the style switcher: added a new button (top-left of the fullscreen
  chrome, mirrors the exit button's styling) that relocates the shared
  `#artStyleMenu` into a `.flow-art-style-anchor` inside `.flow-chrome`
  while flow mode is open on the art view (`openFlow()`/`closeFlow()`
  now move it in/out, same real-element-relocation pattern already used
  for `vizCanvas`/`artRecord`/`artCassette`), hidden whenever the cymatics
  visualizer is showing instead (`flowArtStyleBtn.hidden = showViz`) since
  there's no art style to pick then. It's a child of `.flow-chrome`, so it
  automatically inherits the same appear-on-pointer-movement /
  fade-after-3.2s-idle behavior as the rest of the fullscreen controls -
  no separate visibility logic needed. New `syncFlowArtStyle()` centralizes
  "which element (default art / real `#artRecord` / real `#artCassette`)
  should currently be inside `flowArtWrap`," called both from `openFlow()`
  on entry and from `setArtStyle()` so picking a *different* style while
  already fullscreen updates the fullscreen visual immediately instead of
  only taking effect next time flow mode opens.

  Verified via a local `python3 -m http.server` served directly from this
  worktree (confirmed via `location.href`): fullscreen now shows the
  ambient drifting background with no particle canvas at all, in any art
  style. The new button opens the style menu correctly positioned under
  itself; selecting Cassette Tape while already viewing the fullscreen
  Spinning Record immediately swapped to the cassette element in place
  (screenshot-confirmed both states); exiting fullscreen afterward
  confirmed `#artStyleMenu` returned to `#visualTabs` (its normal home)
  and `#artCassette` returned to `#artworkWrap` - nothing left stranded
  inside `flowArtWrap`. Confirmed the button stays `hidden` when
  fullscreen opens on the cymatics visualizer instead. No new console
  errors versus the pre-existing sandbox noise.

  **Follow-up 3 (2026-09-22, commit `2803ae9`):** user reported "the lp and
  cassette themselves are now flickering" (distinct from the removed
  particle background - this is the record/cassette elements' own
  rotation), and asked for the fullscreen art-style button to sit in the
  same spot as the normal player's art/viz/lyrics tabs.

  Flicker: likely cause is the record's grooves (a fine
  `repeating-radial-gradient`, 3px/6px bands) and the cassette's SVG reel
  hubs both rotating continuously via `transform`, now rendering far
  larger in fullscreen (`min(86vh,86vw)`, up from `52vh/62vw` everywhere
  else in the app) since the `fullscreen-lp-cassette-visual` sizing work
  above - a rotating fine repeating pattern is a known source of
  shimmer/moiré in browsers, worse the larger it renders (more high-
  frequency content per pixel row, more visible to the eye). Added
  `will-change:transform` + `backface-visibility:hidden` to `.record-disc`
  and `will-change:transform` to `.cs-hub` (the cassette reel hub `<g>`s) -
  the standard fix, promoting each to its own GPU compositor layer so the
  browser rasterizes the pattern once and just transforms that texture per
  frame instead of re-rasterizing it every frame. **Caveat:** this
  sandbox's `requestAnimationFrame` is heavily throttled (measured ~2-3
  fps even during active animation, vs. a real device's 60fps), so
  animation *smoothness* genuinely cannot be verified here - this is a
  grounded fix for the exact symptom described, not a confirmed-fixed
  result. Please check on a real device and report back if it's still
  happening.

  Also chased down what looked like a second, unrelated bug during this
  investigation - a `NotFoundError` on `closeFlow()`'s `insertBefore` call
  appeared in the console during testing - but a cache-busted reload
  (`?cachebust=`) plus a 5-cycle open/switch-style/close stress test
  produced zero errors, while the exact same interaction against a
  non-cache-busted reload reproduced it reliably. Concluded this was a
  stale cached copy of an earlier, already-superseded version of this
  file being served during iterative local testing (this repo has no
  service worker registered on this origin, so it wasn't `sw.js` - most
  likely the static file server or browser tab reusing a prior response
  across same-URL navigations within one session) rather than a real bug
  in the committed code - flagging in case it resurfaces, since it would
  be worth a closer look if so.

  Button position: moved `.flow-art-style-anchor` from the top-left corner
  of `.flow-top` to `position:absolute;left:50%;transform:translateX(-50%)`
  (with `.flow-top` reverted to plain `justify-content:flex-end` for the
  exit button, as it was before this button existed). Verified via
  `getBoundingClientRect()` that the button's center-X now exactly matches
  `#visualTabs`' center-X in the normal player (both `381` in the viewport
  tested) - not just visually close, an exact match.

  **Closed out (2026-09-22):** merged to `main` (commit `a43315a`) at the
  user's request to test live rather than waiting for a from-worktree
  review, since the rotation-shimmer fix above couldn't be verified in
  the dev sandbox. User confirmed on real hardware afterward: "works."

  **Follow-up (2026-09-22, commit `0a521e8`):** user reported "album style
  button doesn't work on cymatics fullscreen." Root cause: `openFlow()`
  sets `flowArtStyleBtn.hidden = true` on the cymatics/lyrics view (no art
  style to pick while looking at the visualizer), but the shared
  `.flow-exit,.flow-art-style-btn{display:flex}` rule ties with the
  browser's default `[hidden]{display:none}` on specificity and wins on
  source order - so the button stayed visible there anyway. Clicking it
  opened the style menu but did nothing, since `syncFlowArtStyle()`
  already correctly no-ops while `flowArtWrap` itself is hidden - it read
  as broken rather than simply absent. Added
  `.flow-art-style-btn[hidden]{display:none}`. Verified via a real browser
  check: computed `display` is now `none` on the cymatics view (was
  `flex`), and unaffected (`flex`, still hidden-attribute `false`) on the
  art view - switched between both to confirm neither broke the other.

### fullscreen-player-controls: Fullscreen mode should expose all player controls
- **Status:** merged
- **Priority:** medium
- **Description:** Fullscreen mode should show all the player controls -
  shuffle, loop, album art style switcher, etc. - not just a subset.
- **Touches:** `index.html` - `#flow-layer` markup (~line 1826-1848, the
  fullscreen "flow mode" chrome), its element refs (~line 2548), the
  `toggleShuffle()`/`cycleRepeat()` UI-sync lines (~line 4551-4577), and
  the new click listeners next to the existing mini-bar ones (~line
  6437-6440).
- **Branch:** `agent/fullscreen-player-controls`
- **Notes:** Synced from Geethub issue #97. Related to
  `desktop-player-fullscreen-toggle` (draft, desktop-specific panel-sliding
  behavior) but distinct - this is about which controls are present/visible
  in fullscreen generally, not desktop panel layout. Worth reviewing
  together since both touch fullscreen player UI.

  Root cause: fullscreen ("flow mode", `#flow-layer`, entered via the
  album-art `fsBtn` "Enter flow mode" button) is a separate DOM overlay
  from the normal player, not a promoted/reused copy of it - similar in
  spirit to the mini-bar, which already keeps its own
  `miniShuffleBtn`/`miniRepeatBtn` duplicate controls. When flow mode was
  originally built, its `.controls-row` only got `flowPrevBtn`/
  `flowPlayBtn`/`flowNextBtn` markup - `shuffleBtn` and `repeatBtn` were
  never duplicated for it, so shuffle and loop were simply absent from the
  fullscreen chrome (not hidden by CSS/z-index/overflow - the markup for
  them didn't exist at all). Checked against `player-controller-centering`
  (merged) since that bug had a similar "controls vanish" symptom, but that
  one was a `min-height:0`/grid-stacking issue in the desktop split-pane
  layout - unrelated here; flow mode's own layout (`#flow-layer` flex
  column + `.flow-chrome` absolute overlay) has no such stacking problem,
  it was purely missing markup. The seek bar, like button, prev/play/next,
  and exit button were all already present and working in flow mode; the
  "album art style switcher" mentioned in the synced issue text (switching
  between the default/record/cassette art styles, or between art/
  visualizer/lyrics) is intentionally out of scope for this pass - flow
  mode still opens showing whatever mode/style was active in the normal
  player (art or visualizer; lyrics gets its own separate `#lyricsFsLayer`
  fullscreen via the same `fsBtn`), it just can't be changed without
  exiting - left as a possible follow-up since adding a live switcher would
  mean either duplicating the `#artStyleMenu` overlay into flow's
  positioning context or re-parenting it, more surface area than this
  ready-item's core "controls are simply missing" bug warranted.

  Fix: added `flowShuffleBtn`/`flowRepeatBtn` (with the same
  `repeat-badge`/`flowRepeatOneBadge` "1" indicator the normal and mini
  players use) into `#flow-layer .controls-row`, on either side of
  prev/play/next - same position shuffle/repeat sit in the normal player's
  row. Reused the existing `ctl-btn`/`ctl-btn small`/`repeat-badge` CSS
  classes verbatim, so no new styling was needed and the short-viewport
  `@media (max-height:480px)` rules that already shrink `.ctl-btn` apply
  here too. Wired both buttons to the existing `toggleShuffle()`/
  `cycleRepeat()` functions (same handlers the normal and mini buttons
  call) and added them to the two functions' UI-sync lines, so shuffle/
  repeat state stays in lockstep across all three surfaces (normal,
  mini-bar, flow) no matter which one triggered the change.

  Verified by serving this worktree's `index.html` directly with
  `python3 -m http.server` from inside the worktree (confirmed via
  `location.href` in the browser, not the shared preview launcher) and
  loading the real "I Tried It" test playlist:
  - 375x812 (mobile): opened flow mode from the album-art fullscreen
    button; shuffle, prev, play, next, and repeat were all visible and
    tappable in the chrome; tapped shuffle then repeat (both lit up
    pink/active, matching the normal player's `is-active` styling) then
    play, which switched to the pause icon and the seek bar/time (0:01 of
    5:56) started advancing - confirming actual playback control, not
    just a UI toggle.
  - 1280x800 (desktop, split 3-pane layout): entered flow mode; all five
    transport controls plus the seek bar, like button, and exit (X) button
    rendered correctly with no clipping.
  - 1280x720 (short desktop height, the height the sibling
    `player-controller-centering` lane flagged as a risk): same result -
    all five controls, seek bar, and title/artist rendered fully on
    screen, nothing cut off by `#app`/`#flow-layer` overflow. (Separately
    confirmed flow mode's existing 3.2s no-interaction auto-hide -
    `armFlowChromeTimer()`/`.chrome-hidden` - is intentional immersive-mode
    UX, not a bug: the chrome reappears immediately on pointer movement or
    a click, at every viewport tested.) Toggling shuffle/repeat via the
    new flow buttons was confirmed via direct DOM state (`is-active` class
    flipped on both `flowShuffleBtn`/`flowRepeatBtn` and, in sync, on the
    normal `shuffleBtn`/`repeatBtn`).
  - Console: two pre-existing `"An unknown error occurred when fetching
    the script"` errors appear on load in this sandboxed test environment
    (looks like the YouTube iframe API script being blocked/unreachable,
    not related to this change - the same errors appear on a fresh reload
    with no fullscreen interaction at all) plus a harmless
    `Unrecognized feature: 'web-share'` warning. No new errors introduced
    by this change; no errors reference the added elements.

  Not merged - left on `agent/fullscreen-player-controls` for review per
  the task's instructions.

### queue-playlist-row-buttons: Collapse queue's playlist-section row buttons into a 3-dot menu
- **Status:** merged
- **Priority:** medium
- **Description:** The playlist section at the bottom of the queue menu has
  so many buttons per track that the title becomes unreadable. Each track
  row there should collapse down to a single 3-dot button that opens the
  other functions, matching the pattern used elsewhere.
- **Touches:** queue panel's playlist section, track row markup.
- **Branch:** agent/queue-playlist-row-buttons
- **Notes:** Synced from Geethub issue #98. The row (built in `renderTrackList`,
  the `#trackList` renderer for the queue panel's `#playlistListWrap` section)
  had five separate inline buttons crammed next to the title: like, play
  next, add to queue, add to playlist, and (for custom playlists) remove
  from playlist - on top of the `.track-menu-btn` kebab that already existed
  for "Refresh link". Reused that existing kebab/`trackCtxMenu` overflow-menu
  pattern (same one `toggleLibCtxMenu`/`libCtxMenu` uses for library cards)
  instead of inventing a new component: `openTrackCtxMenuFor` (previously
  hardcoded to just "Refresh link") now builds the item list from the
  track/playlist looked up by `plId`/`trackIdx`, and a new
  `handleTrackCtxAction(action, plId, trackIdx)` dispatches clicks the same
  way `handleLibCtxAction` does for the library menu. `renderTrackList` now
  only builds the kebab button per row; the other inline buttons and their
  handlers were deleted. Tracks with no resolved `videoId` still get no
  kebab (unchanged - long-press on the row itself still opens the menu via
  `attachLongPress`, same as before).

  First pass put all five actions in the menu (Like, Play next, Add to
  queue, Add to playlist, Remove from playlist). Refined per follow-up
  feedback: dropped "Add to queue" and "Remove from playlist" entirely -
  queue removal already has its own direct X button in the Now/Next/Later
  queue list (`.remove` → `queueRemoveAt`, in `renderQueuePanel`), reused
  as-is rather than duplicating it in this menu, and "Remove from playlist"
  wasn't wanted here (`removeTrackFromCustomPlaylist` is left defined but
  now unused by this menu). The menu is now just Like/Unlike, Play next, Add
  to playlist, a separator, then Refresh link. "Play next" also changed
  semantics: `queuePlayNext` (only call site was this menu) now strips any
  existing occurrence of that `(plId, trackIndex)` pair further down
  `state.queue` before reinserting at `state.queuePos + 1`, so picking "Play
  next" on a track already queued moves it up instead of adding a duplicate
  entry.

  Verified by serving this worktree's `index.html` with a plain
  `python3 -m http.server` on a dedicated, unusual port (127.0.0.1, ports
  47391 then 58217 for the second pass) - the shared/default port 8934
  turned out to be contested by other concurrently-running EBBLESS worktree
  sessions on this machine (confirmed via `AGENTS.md`'s session ledger
  showing 3 active lanes), which repeatedly and silently swapped the browser
  tab to a different session's server mid-test, and even a fresh tab
  navigated straight to 8934 got hijacked within a couple tool calls;
  switching to an uncommon port stopped it. Confirmed via `curl` and
  `location.href`/script-content checks (`grep -c openTrackCtxMenuFor`, and
  confirming no `addqueue`/`removeplaylist` strings remained) that the tab
  was loading this worktree's edited file before testing. Seeded custom
  playlists directly into `localStorage` (`ebbless:playlist:<id>` /
  `ebbless:library`) with a resolved-and-unresolved mix of tracks to test
  without depending on live network imports. Confirmed: track titles are
  readable with just the single 3-dot button per row; the menu shows exactly
  Like/Unlike, Play next, Add to playlist, Refresh link on both a
  non-custom and a custom playlist (no Add to queue, no Remove from
  playlist, on either); clicking Like/Unlike toggled the track in and out of
  Liked Songs; Play next on a track already further down the queue moved it
  to immediately-next with no duplicate (verified twice in a row - second
  click just re-confirmed position, still no duplicate); the existing
  Now/Next/Later queue list's own X button still removes a track from the
  queue exactly as before (untouched code path); the unmatched track still
  shows no kebab. Checked the browser console throughout - no new errors
  (only pre-existing, unrelated 404s/script-fetch failures from the
  sandboxed preview environment's network restrictions on external YouTube/
  artwork requests).

  Third pass (per further follow-up feedback): added a direct "x" remove
  button on each row and dropped the "N plays" count display entirely.
  Confirmed first that "remove" in this list means remove-from-playlist, not
  remove-from-queue - `#trackList` renders `state.playlist.tracks` (the
  playlist's full tracklist), not the queue, so a given row may not even be
  queued right now; the queue's own removal (`queueRemoveAt`, the `.remove`
  button in `renderQueuePanel`'s Now/Next/Later rows) is separate and was
  left untouched. Wired the new button to the existing
  `removeTrackFromCustomPlaylist(i)` - the same function the original inline
  "Remove from playlist" button and the first-pass menu item both used - so
  no new removal logic was written. It's built with the same SVG markup as
  `.q-row .remove` and a new `.track-row .remove` CSS rule that mirrors
  `.q-row .remove`'s sizing/colors (including the touch-target bump in the
  mobile media query), so it matches that existing pattern exactly. Shown
  only when `pl.type === 'custom'` (matching `removeTrackFromCustomPlaylist`'s
  own guard - non-custom/imported playlists don't support removing a single
  track), and shown on unmatched/missing rows too since those have no kebab
  at all and are exactly the ones worth pruning from a custom playlist. The
  `.plays` div and its `renderTrackList` code were deleted outright;
  `t.plays` itself (used for the "Most/Least played" sort options elsewhere)
  is untouched.

  Verified with a fresh `python3 -m http.server` on yet another dedicated
  port (127.0.0.1:61829, same port-contention workaround as before) and
  `curl`-confirmed the served file had the new remove-button code and zero
  `class="plays"` markup before testing in the browser. Seeded a custom
  playlist (4 tracks: 2 plain, 1 already-liked-eligible, 1 unmatched) and a
  non-custom playlist (1 track) directly into `localStorage`. Confirmed: no
  `.plays` element anywhere in `#trackList`; every row in the custom
  playlist - matched and unmatched alike - has a working `.remove` button
  that removes exactly that track and re-renders the list (tested on both a
  matched and the unmatched row); the non-custom playlist's row has no
  remove button (only the kebab); the kebab menu is unchanged (Like/Unlike,
  Play next, Add to playlist, Refresh link) on both playlist types; titles
  still fully readable. No new console errors (same pre-existing sandboxed
  404/script-fetch noise as before).

### player-hud-remove-playlist-label: Remove playlist title/track number from main player HUD
- **Status:** merged
- **Priority:** medium
- **Description:** Remove the playlist name and track number (currently
  sitting between the artist name and the progress bar) from the main
  player HUD.
- **Touches:** player view HUD layout.
- **Branch:** agent/player-hud-remove-playlist-label
- **Notes:** Synced from Geethub issue #99. Found the element at
  `#playlistCtx`/`#ctxText` (`.playlist-ctx` div, rendering
  `"PlaylistName · N of M"`) in `index.html`, sitting between `.track-meta`
  (title/artist) and `.transport-full` (seek bar) in the player view markup.
  Removed the markup, the `updatePlaylistCtx()` function that populated it
  (and its lone call site in `highlightActiveRow()`), the `playlistCtx`/
  `ctxText` `$()` lookups, and the now-dead `.playlist-ctx` CSS rules
  (including the mobile `display:none!important` override). Commit
  `3216abb`. Verified by serving this worktree's own `index.html` directly
  via `python3 -m http.server 8935` run from
  `/Users/malcolm/Documents/CLAUDE-CODE/ebbless-worktrees/player-hud-remove-playlist-label`
  (not the shared/main-checkout dev server, which a `preview_start` by name
  turned out to launch from the main `EBBLESS` checkout instead of this
  worktree - caught via `preview_list`'s reported `cwd` and stopped before
  using it) - confirmed via `curl` that the served HTML had zero matches for
  `playlist-ctx`/`playlistCtx`/`ctxText` before loading it in the browser.
  Loaded the standard test playlist, opened the player view, and confirmed
  the playlist name/track-number line is gone from the HUD while the title,
  artist, seek bar, and transport controls all render and work normally.
  Checked the browser console: no errors reference the removed IDs/selectors
  (only pre-existing, unrelated YouTube-iframe/proxy errors were present).

### library-playlist-footer-overlap: Footer player blocks last entry when viewing a playlist on mobile
- **Status:** merged
- **Priority:** medium
- **Description:** On mobile, opening a playlist from the library, the
  footer player bar covers/blocks the bottom-most track entry in the list.
- **Touches:** library playlist-detail view, mobile footer player spacing.
- **Branch:** agent/library-playlist-footer-overlap
- **Notes:** Synced from Geethub issue #100. Related to `player-mobile-spacing`
  (merged - that fixed spacing within the player view itself) but this is a
  different surface (the library's playlist-detail list being covered),
  kept separate.

  Fixed in commit `f65c457`: root cause was `#mini-bar` (footer player)
  sharing the same `bottom` offset as `#libpl-panel` on mobile but with a
  higher z-index, so it floated over the panel's own bottom edge. Added
  `#libplBody{padding-bottom:78px}` in the mobile media query so the
  scrollable playlist-detail track list clears the mini-bar. Verified on a
  375x812 viewport with an 8-track playlist and playback active: last
  track now fully visible above the mini-bar, no new console errors.
  Pushed to `agent/library-playlist-footer-overlap` - awaiting your local
  review before merge.

### discovery-radio-continuation: Discovery should keep playing a radio around a song after it ends
- **Status:** merged
- **Priority:** medium
- **Description:** When playing a single song with Discovery on, once it
  finishes the app should keep playing a radio built around that song
  (rather than stopping). Loading a song while something's already playing
  should build a queue around it.
- **Touches:** Discovery/radio playback logic, queue building.
- **Branch:** agent/discovery-radio-continuation
- **Notes:** Synced from Geethub issue #101. Found the actual bug wasn't in
  the radio-continuation logic itself - that already existed and already
  worked generically for any queue. `maybeExtendDiscoverQueue()` (called
  from `loadIndex()`) proactively tops any queue back up once it's within
  `DISCOVER_LOOKAHEAD` tracks of the end via `extendQueueWithDiscover()`,
  and `playNext()`/`finishQueueAtEnd()` fall back to the same extension at
  the real end of the queue - this is exactly the "keep playing similar
  songs when this queue ends" toggle already shipped and on by default
  (`isDiscoverOn()` defaults to `true`). It works today for any playlist,
  including a one-track one.

  What was actually broken: pasting a single song (a Spotify/Apple
  Music/SoundCloud track or a YouTube video link) never played anything at
  all. `beginImport()` special-cased `isSingleTrackType()` results (`track`,
  `sc_track`, `am_track`, `yt_video`) straight into
  `openSingleTrackDestinationPicker()` - a "save it somewhere" prompt - in
  both the cached-link branch and the freshly-resolved branch, and returned
  without ever calling `loadPlaylistIntoPlayer`/`buildQueueFrom`/`loadIndex`.
  So there was never a queue for Discover to extend or continue in the
  first place; a single song's "radio" had nothing to build around, and
  "loading a song while something's already playing" was a no-op for
  playback (only the picker opened on top of whatever was already going).

  Fixed (commit `414c8eb`): both branches now run the exact same
  `loadPlaylistIntoPlayer` -> `buildQueueFrom(0)` -> `loadIndex(state.queuePos,
  true)` -> `setView('player')` sequence already used for every other
  playlist type, immediately before still opening the destination picker
  (so the "save this to Liked Songs / a playlist" option is untouched).
  This replaces whatever was queued/playing with a fresh one-track queue
  anchored on the new song - satisfying "loading a song while something's
  playing builds a queue around it" - and, because that one-track queue now
  actually exists, the pre-existing Discover machinery picks it up with
  zero new code: `loadIndex`'s own lookahead extends it right away, and the
  existing end-of-queue fallback continues it when the track actually
  finishes. No new recommendation/resolution logic was written or needed.

  Verified without network egress or real audio, both called out as
  possibly unavailable in this sandbox and confirmed unavailable: pasting a
  real YouTube link failed with "youtube redirected to an interstitial
  (bot-check)" from the backend worker, and the Browser preview pane in
  this environment turned out to be hard-scoped to the main EBBLESS
  checkout (not this worktree) - a plain static server started inside the
  worktree could be curled but the pane refused to navigate to it, and
  opening the worktree's `index.html` via a `file://` URL rendered as a
  static, non-interactive snapshot. So this was **not** verified end-to-end
  in a live browser. Instead verified two ways: (1) `node --check` on the
  page's extracted inline scripts confirms no syntax errors; (2) extracted
  the real, unmodified source of `beginImport`, `buildQueueFrom`,
  `maybeExtendDiscoverQueue`, `extendQueueWithDiscover`, `playNext`, and
  `finishQueueAtEnd` verbatim from `index.html` and ran them in a Node `vm`
  sandbox against stubbed DOM/network/YouTube-iframe calls (localStorage,
  `fetchDiscoverCandidates`, `loadIndex`'s actual playback), exercising:
  loading a single song while a 3-track playlist is playing (queue is
  replaced, song plays, save picker still offered, nothing saved to the
  library as its own playlist), Discover proactively extending that
  one-track queue right after it starts, and walking the queue to its end
  and past it (auto-advance) continuing into the Discover-added tracks
  instead of stopping. All assertions passed. What remains genuinely
  unverified is real audio: whether a YouTube/Spotify/SoundCloud track
  actually resolves and plays through the iframe/native players in a real
  browser, and whether the live `/similar` and `/ytmix` backend endpoints
  return usable candidates - none of that touches the code changed here,
  which only decides *whether playback and a queue get started at all*,
  not how a track is resolved or streamed.

### queue-close-return-view: Closing the queue should return to the view you were on
- **Status:** merged
- **Priority:** medium
- **Description:** On mobile, closing the queue panel should return you to
  whichever view you were on just before opening it (player or library),
  instead of always landing somewhere fixed.
- **Touches:** queue panel open/close navigation state, mobile.
- **Branch:** agent/queue-close-return-view
- **Notes:** Synced from Geethub issue #102.

  Fixed in commit `a38b1e2`: added `state.preQueueView` (mirrors the
  existing `preSettingsView` pattern) - `openQueuePanel()` records the
  current view before opening, `closeQueuePanel(restoreView = true)`
  restores it. `setView()`'s own auto-close-queue call now passes
  `restoreView:false` so deliberately switching views while the queue is
  open isn't clobbered by the restore. Verified on a 375x812 viewport from
  both starting views (Player and Library) plus a guard check that
  switching views while the queue is open is preserved, not reverted. No
  new console errors. Note: couldn't reproduce the original bug via the
  toggle-queue button itself (it already preserved view correctly) but the
  fix closes the gap for any other path that changes view while the queue
  is open. Pushed to `agent/queue-close-return-view` - awaiting your local
  review before merge.

### save-discovery-playlist-to-library: Save modified/discovery-generated playlists to library
- **Status:** merged
- **Priority:** medium
- **Description:** Let the user save a modified playlist, or a radio station
  generated by Discovery, as a new playlist in their library.
- **Touches:** playlist save/create flow, Discovery radio generation.
- **Branch:** agent/save-discovery-playlist-to-library
- **Notes:** Synced from Geethub issue #103. Related to `currents-playlist-algorithm`
  and `blend-playlist` (both draft, auto-playlist generation) but distinct -
  this is about saving/persisting generated or edited results, not defining
  a new auto-playlist's selection rules.

### background-app-switch-playlist-loading: Playlist loading should continue while app is backgrounded on mobile
- **Status:** merged
- **Priority:** medium
- **Description:** On mobile, if a playlist is still loading and the user
  switches to another app, loading currently stops. It should continue in
  the background instead.
- **Touches:** `beginImport()` playlist-load flow, mobile backgrounding
  behavior (same general area as `mobile-background-resume`, merged).
- **Branch:** none - done directly against `main` (commit `a6e6d30`).
- **Notes:** Synced from Geethub issue #104. Previously flagged as a
  judgment call overlapping `background-playlist-loading`. **Update
  (2026-09-22):** found already implemented directly on `main` -
  "Recover an in-progress playlist import after the app gets
  backgrounded". Backlog status corrected from `draft` to `merged`.

### world-radio-addon: World radio - pick a region on a map, hear music from there
- **Status:** archived
- **Priority:** medium
- **Description:** Add a mode where the user picks a spot on a world map and
  hears music from that region in a continuous, ad-free radio format. Should
  use simple, lightweight, mostly-existing techniques rather than heavy new
  infrastructure; UI should be an intuitive, simple map-tap interaction.
- **Touches:** new feature area - likely a new view/mode, a map UI, and a
  region-to-playlist/source mapping strategy (needs scoping).
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #105. Larger, open-ended feature -
  will likely need scoping/design before a lane can implement it directly.

### tutorial-song-preview-only: Tutorial music should play only its first second on app load
- **Status:** merged
- **Priority:** medium
- **Description:** When the app loads, it currently plays the whole tutorial
  song; it should instead just play the first second and then stop.
- **Touches:** splash/tutorial audio trigger (`#onbMusic`), same area as
  `splash-tutorial-music-preload` (merged).
- **Branch:** `agent/tutorial-song-preview-only`
- **Notes:** Synced from Geethub issue #106. `splash-tutorial-music-preload`
  added playing the first beat of tutorial music on splash load; this
  report says the full song now plays instead of stopping after a moment -
  likely a follow-up fix/regression on that same feature rather than a
  duplicate ask, so kept as its own entry.

  Fixed and pushed, then refined further per follow-up direction in chat
  (commits `fad0c8b`, `642f141`) in `startApp()` (~line 6718-6751). Current
  behavior: the splash's `#onbMusic` preview skips the track's first 0.5s,
  plays at full volume for a beat, then fades out over 2.5s (3.5s total)
  instead of running the whole track, with no delay before sound starts.
  Safe against the real tutorial (`runIntro()`, which calls `startApp()` at
  its own end after finishing its own play/fade/volume handling on the same
  element) - by the time these timers fire, tutorial playback is already
  over, so it can only ever cut off the splash's own autoplay snippet.
  Verified via a worktree-local static server + real click gesture on
  "Enter"/"Tutorial": `play()` fires immediately at `currentTime = 0.5`,
  volume fades to 0 and the element pauses/resets at ~3.5s.

### discover-artist-this-is-playlist: Discover should pull from the "This Is [Artist]" Spotify playlist
- **Status:** merged
- **Priority:** medium
- **Description:** The Discover feature should source from Spotify's
  official "This Is [artist name]" playlists for the relevant artist(s).
- **Touches:** Discovery source-fetching logic.
- **Branch:** agent/discover-artist-this-is-playlist
- **Notes:** Synced from Geethub issue #107.

  Implemented as an additional source folded into the existing Discover
  cascade (`fetchDiscoverCandidates` in `index.html`), alongside the
  Last.fm/ListenBrainz `similar` pool and the YouTube-mix fallback - not a
  replacement.

  **Worker (`worker/src/index.js`):** new `GET /thisis?artist=` route
  (`handleThisIsPlaylist`) resolves an artist name to the Spotify playlist
  id of their official "This Is <Artist>" playlist, when Spotify's own
  `spotify`-owned account curates one for them (most independent/niche
  artists don't have one). This is the one Spotify lookup in this codebase
  that genuinely needs the real Spotify Web API (Client Credentials Flow)
  rather than a page scrape: unlike a track/album/playlist, fetchable by id
  via the existing `/embed/` page-scrape trick with no auth, there's no
  public unauthenticated way to *search* Spotify by name. Verified directly
  against the live site: open.spotify.com's search and artist pages are now
  both client-rendered SPAs with no server-embedded `__NEXT_DATA__` (only
  the `/embed/` pages still have it), and reverse-engineering the web
  player's private anonymous-token endpoint to call Spotify's internal
  partner API was deliberately ruled out - that's exactly the kind of
  undocumented, token-scraping approach this codebase already moved away
  from once (see the `/spotifyart` comment on why that endpoint moved off
  the Spotify Web API to iTunes' keyless search instead), and it's also the
  kind of credential-adjacent scraping this environment's own tooling
  correctly refused to let me test live.

  So `/thisis` is intentionally optional and gated on
  `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` Worker secrets (the same pair
  `/spotifyart` used before Spotify tightened new developer-app creation to
  Premium accounts in Feb 2026 - reviving that mechanism rather than
  inventing a new one, on the chance this deployment's account still has an
  older app's credentials). With no secrets configured - the current,
  default state of the live deployment - `getSpotifyAppToken` resolves to
  `null` and the endpoint always answers `{ playlistId: null }`, which the
  client treats exactly like "no This Is playlist for this artist." Once a
  playlist id is found, its actual tracklist is fetched through the
  **existing** `/playlist?id=` embed-scrape (`handleEmbed`/
  `fetchSpotifyPlaylist`) - no new scraping logic, full reuse. Result cached
  6h at the edge (`THISIS_CACHE_VERSION`), hit or miss alike, same as other
  endpoints in this file.

  **Client (`index.html`):** new `fetchThisIsPlaylist(artist)` calls
  `/thisis`, then (on a hit) `fetchSpotifyPlaylist` for the tracklist, and
  maps it into the same `{title, artist, matchScore, tags}` candidate shape
  the rest of the pipeline expects (`matchScore: 0.6`, `tags: []` - no
  Last.fm tag data, so it's scored on match-score alone via
  `scoreCandidate`'s existing 30% weight, rather than skipping scoring
  entirely). `fetchDiscoverCandidates` now fetches this in parallel with the
  Last.fm `/similar` call and merges any hits into the candidate pool
  (de-duped by title+artist) before scoring - so "This Is" tracks compete on
  the same footing as everything else, including the existing same-artist
  +0.05 / recent-artist -0.15 adjustments already in `scoreCandidate` (most
  "This Is" tracks are by the seed artist, which that recent-artist penalty
  is already there to gently temper without excluding a genuinely strong
  pick). No changes to the Swell/"Current" daily-drop path directly, but it
  shares `fetchDiscoverCandidates` so it benefits automatically.

  **Verified:** `node --check` on the worker file; the inline app script
  parses clean (`new Function(...)` over the extracted `<script>` body, no
  syntax errors). Loaded this worktree's actual `index.html` in a real
  browser against a throwaway local static server (confirmed via a unique
  grep marker served back over HTTP - the file being served really was this
  worktree's, not the main checkout, per the known preview-launcher gotcha),
  imported the team's standard test playlist, and confirmed the app loads,
  resolves, and plays a track normally, and that the Queue panel's Discover
  toggle still renders/toggles correctly - no regressions in the existing
  pipeline.

  **Not verified / caveats:** the worker changes are not deployed (no
  `wrangler login` session available in this environment) and no
  `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` secrets exist on the live
  Worker, so `/thisis` will 404 against the current production backend
  until (a) someone runs `wrangler deploy` from `worker/`, and (b) Spotify
  Client Credentials are actually configured as Worker secrets - until then
  this is a fully inert, zero-risk no-op and Discover behaves exactly as it
  does today. I could not exercise a live "This Is" hit end-to-end (no
  credentials to test against), and couldn't confirm the `/thisis` fetch
  actually fires from the browser automation tooling available here (its
  network-request capture didn't record *any* `fetch()`-initiated calls to
  the existing Worker either, including ones that demonstrably succeeded,
  e.g. the YouTube search that resolved the track that then played
  correctly on-screen) - so that's a tooling gap in this verification pass,
  not a sign the call isn't happening. Whoever configures Spotify
  credentials for this Worker should sanity-check `/thisis?artist=Drake`
  (or similar) directly, and confirm a queue extension actually surfaces a
  "This Is" track for an artist known to have one.

### cymatics-fullscreen-dot-density: Add more dots to cymatics visualizer in fullscreen
- **Status:** merged
- **Priority:** low
- **Description:** In fullscreen, the cymatics visualizer's dots look too
  spread out - consider adding more dots when in fullscreen to fill the
  larger space.
- **Touches:** cymatics visualizer rendering/dot-count logic.
- **Branch:** agent/cymatics-fullscreen-dot-density
- **Notes:** Synced from Geethub issue #108. Distinct from
  `cymatics-heart-centering` (merged - title centering) and
  `cymatics-true-black-contrast` (merged - background color) - this is
  about dot density/spacing in fullscreen specifically.

  Implemented in commit `e3a20f9`. `VIZ_GRAINS` (1600, the normal
  player/library-tile grain count) is unchanged. Added
  `VIZ_GRAINS_FULLSCREEN = VIZ_GRAINS * 2` (3200) and
  `VIZ_GRAINS_MAX = Math.max(...)`; the `vizGx`/`vizGy` Float32Array grain
  buffers are now allocated at `VIZ_GRAINS_MAX` up front (instead of
  `VIZ_GRAINS`) so switching grain count on fullscreen enter/exit is just a
  loop-bound change, not a reallocation. In `vizDraw`, the per-frame grain
  loop now runs `state.flowOpen ? VIZ_GRAINS_FULLSCREEN : VIZ_GRAINS`
  iterations - `state.flowOpen` is the existing flag the app already uses to
  track the fullscreen "flow layer" (openFlow()/closeFlow() in the
  FULLSCREEN / FLOW MODE section). Dot size, brightness, and color logic
  (grain radius `r`, alpha-by-settle, `vizRosicrucianColor()`) were not
  touched.

  Verified by serving this worktree's own `index.html` directly
  (`python3 -m http.server 8791` run from
  `ebbless-worktrees/cymatics-fullscreen-dot-density`, confirmed via
  `curl -sI http://localhost:8791/index.html` and the browser's network log
  showing all `index.html`/`brand/assets/*` requests resolving against that
  port) rather than any shared/other-worktree server. Loaded the standard
  EBBLESS test playlist, opened the cymatics visualizer tab on a track, and
  compared: normal in-player view showed the same pattern/density as before
  the change; entering fullscreen (the expand button) visibly doubled dot
  density with no layout shift or resize glitch, and exiting fullscreen
  returned to the original, unchanged normal-view density. No new console
  errors were introduced by the change (the only console errors seen were
  pre-existing YouTube iframe/embed-API failures unrelated to this diff, and
  all `index.html`/asset requests returned 200). No runaway grain counts -
  3200 grains at 60fps showed no visible frame-rate drop during manual
  testing.

### spinning-record-realism: Make the spinning record feel physical, tactile, and restrained
- **Status:** merged
- **Priority:** medium
- **Description:** Four-part visual polish pass on the spinning-record
  element (distinct from `record-cassette-size`, which only changed its
  size):
  1. Rotation should read as a real object in motion - tiny, subtle
     variation in highlight/rotation rather than a perfectly mechanical
     spin, without visible wobble or jitter.
  2. Add understated physical depth: a slight edge/thickness, restrained
     concentric groove detail, and a natural vinyl sheen that shows as it
     turns - tactile, not visually noisy.
  3. Playback state should feel intentional: smooth hypnotic rotation while
     playing, a full stop when paused, and a subtle settle-into-motion
     transition on load/track-change rather than just continuing the same
     loop.
  4. Stay restrained overall - no equalizer effects, glowing rings,
     exaggerated wobble, fake scratches, or music-reactive scaling. The
     record is the tactile/physical element; cymatics already covers the
     dynamic, music-reactive visual side.
- **Touches:** spinning-record visual/animation logic (whatever renders and
  animates the record element).
- **Branch:** (unclaimed)
- **Notes:** Synced from four Geethub issues (#109-#112) filed together as
  one theme by the same author - folded into a single entry since they all
  describe one cohesive polish pass on the same element rather than four
  separate features. Each issue closed with a comment linking here.

### cymatics-fullscreen-title-position: Cymatics fullscreen title/artist should sit above the progress bar like the regular player
- **Status:** merged
- **Priority:** medium
- **Description:** In cymatics fullscreen view, the song title and artist
  should be positioned at the bottom, directly above the progress/play bar -
  matching where they sit in the regular (non-fullscreen) player - instead
  of wherever they currently render.
- **Touches:** `index.html` `.flow-meta`/`.flow-chrome`/`.flow-bottom`
  (cymatics fullscreen layer, "flow" internally).
- **Branch:** `agent/cymatics-fullscreen-title-position`
- **Notes:** Synced from Geethub issue #113. Distinct from the merged
  `cymatics-heart-centering` (that was about the heart icon pushing the
  title off-center horizontally) - this is about vertical placement relative
  to the progress bar, matching the regular player's layout.

  Fixed and pushed (commit `a6e9131`): moved `.flow-meta` (the title/artist
  block, including the like button) out of the vertically-centered art
  group and into `.flow-chrome > .flow-bottom` as the first child before
  `.flow-seek` and `.controls-row` - mirroring the regular player's DOM
  order (`.track-meta` sits directly above `.transport-full`). Widened
  `#flow-layer .flow-meta` from `min(52vh,62vw)` (art-tile sizing) to
  `min(420px,80vw)` (matching `.flow-seek`'s width) and dropped the
  now-redundant `margin-top:28px` since `.flow-bottom`'s existing
  `gap:18px` handles spacing. The `cymatics-heart-centering` fix
  (`title-row`'s `column-reverse` layout, heart above title, both
  centered) is untouched and still applies in the new location.
  Verified via a worktree-local `python3 -m http.server` (confirmed via
  `location.href`), loaded a real track, entered cymatics fullscreen, and
  screenshotted both desktop and mobile (375x812) viewports: title/artist
  now sit directly above the progress bar and transport controls, heart
  centered above the title. Confirmed DOM order via
  `document.querySelector('.flow-bottom').children` ->
  `["flow-meta","flow-seek","controls-row"]`. No new console/network
  errors against the worktree's own server.

### crossfade-album-art-transition: Crossfade album art should fade into the next track's art
- **Status:** merged
- **Priority:** medium
- **Description:** When songs are crossfading, the currently-shown album art
  should visually fade into the next track's album art, in sync with the
  audio crossfade, instead of switching abruptly (or not visually
  transitioning at all).
- **Touches:** `index.html` `makeArtSwapper()` (~line 2644),
  `runCrossfade()`/`finishCrossfade()` (~line 6156),
  `reflectCurrentTrackUI()`.
- **Branch:** `agent/crossfade-album-art-transition`
- **Notes:** Synced from Geethub issue #114.

  Root cause: the now-playing art (`artA`/`artB` in `.artwork-wrap`, plus
  the cymatics "flow" view's `flowArtA`/`flowArtB`) only swapped inside
  `reflectCurrentTrackUI()`, called from `finishCrossfade()` - i.e. only
  *after* the audio fade (`crossfadePrefs.ms`, default 4s) had already
  finished, so the art popped to the new cover abruptly at the tail end
  instead of transitioning alongside it.

  Fixed and pushed (commit `6c641ac`): `makeArtSwapper()` now accepts an
  optional `durationMs`, applied as `transition-duration` on the art
  `<img>`s for that swap and cleared back to the default CSS speed
  (`--dur-surface`) once it completes. `runCrossfade()` now calls
  `swapPlayerArt(nextTrack, durationMs)` / `swapFlowArt(nextTrack,
  durationMs)` at the *start* of the fade using `crossfadePrefs.ms` - same
  duration and start time as the audio fade. `reflectCurrentTrackUI()`
  gained a `skipArtSwap` option so `finishCrossfade()` doesn't redo the
  swap a second time at default speed once the crossfade lands. Normal
  (non-crossfade) track changes are untouched - still call
  `swapPlayerArt`/`swapFlowArt` with no `durationMs`. Degrades gracefully
  by existing design: the swap only flips `.is-active` inside the new
  image's `onload`, so art that fails to resolve/load in time just leaves
  the current art visible.

  Verified via a worktree-local `python3 -m http.server` (confirmed via
  `location.href`). Real playback/audio wasn't exercisable in this
  sandbox (no live YouTube network access, no queue loaded), so a
  temporary in-page debug hook was used to call the exact in-closure
  function `runCrossfade` calls (`swapPlayerArt(track, durationMs)`)
  directly - confirmed transition-duration applies to both images
  immediately, the swap completes and flips `is-active` correctly,
  duration clears afterward, the untouched normal-swap path still uses
  default duration, and unresolvable art leaves the current art in place.
  The debug hook was removed before committing (confirmed via `grep -c`
  returning 0 in the diff). **Open/unverified:** true end-to-end
  audio+visual sync on a real device with live playback wasn't exercised
  - the logic trace (same start time, same `crossfadePrefs.ms` duration
  feeding both the audio fade's `setInterval` and the art's
  `transition-duration`) strongly implies correct sync, but this specific
  claim wants a real-device check once merged.

### amel-larrieux-wrong-track: "i n i" by Amel Larrieux always plays the wrong track
- **Status:** merged
- **Priority:** medium
- **Description:** The track "i n i" by Amel Larrieux consistently resolves
  to the wrong song - it plays a different track by the same artist rather
  than "i n i" itself. Related in kind to the merged `link-match-accuracy`
  and `stale-track-links` work (wrong/stale resolved links), but this is a
  fresh, specific mismatch report - investigate whether it's a new case the
  general fix doesn't cover, or a stale cache entry.
- **Touches:** `worker/src/index.js` `titleTokens()`/`titleOverlapRatio()`
  (~line 296); `index.html` `RESOLVE_LOGIC_VERSION` bump (~line 2270);
  `worker/src/index.js` `SEARCH_CACHE_VERSION` bump (~line 65).
- **Branch:** `agent/amel-larrieux-wrong-track`
- **Notes:** Synced from Geethub issue #115.

  **Root cause found:** a genuine matching-algorithm bug, not a stale-cache
  case - `titleTokens()` tokenized a source title and then dropped every
  token of length 1 (meant to strip apostrophe-split noise like the "t" in
  "don't"). "i n i" is made entirely of single-character words, so it
  tokenized to an empty array. `titleOverlapRatio()` treats an empty
  source-token list as "nothing to compare against" and returns a full
  match (1.0) for every candidate unconditionally - which silently disabled
  both the title-relevance hard filter and `TITLE_MATCH_WEIGHT` (the
  dominant scoring signal, weighted above every other bonus combined) for
  this title. With the title signal blind, channel/view-count signals alone
  picked the winner among same-artist candidates, and a different, more-
  viewed Amel Larrieux upload ("For Real") consistently outscored the
  correct "I n I" video. Systemic, not specific to this one title: any
  title made entirely of single-character words (rare, but not unique to
  this track) would hit the same empty-token-list path.

  **Changed** (`worker/src/index.js`): `titleTokens()` now falls back to the
  single-character tokens when the length>1 filter would otherwise leave
  nothing at all, instead of returning an empty array. `titleOverlapRatio()`
  now matches the candidate side against the *unfiltered* token set
  (renamed the old filtered helper's body into a new `titleTokensRaw()`),
  so a single-character source token from that fallback (e.g. "i", "n") can
  still be found inside a candidate title that also contains other, longer
  words (an artist name) - which the old filtered candidate-side tokenizer
  would have dropped right back out. Ordinary titles are unaffected: the
  length>1 filter still applies whenever a title has any multi-character
  words at all, exactly as before, so apostrophe-noise stripping (e.g.
  "don't" -> "don"/"stop"/"believin", not "t") is unchanged. Bumped
  `SEARCH_CACHE_VERSION` (worker scoring change) and `RESOLVE_LOGIC_VERSION`
  (client re-resolve trigger, per the `stale-track-links` machinery) so any
  playlist already cached with the wrong "i n i" match - or any other
  title this bug could have hit - gets quietly re-resolved instead of
  serving the stale bad link indefinitely.

  **Verified live**, not just traced: this sandbox had outbound network
  access, so a standalone harness replicating the worker's exact
  fetch/parse/score pipeline (not `wrangler dev`, which wasn't installed
  and would have needed an install step) was run against the real
  `youtube.com/results` search endpoint for "i n i" / "amel larrieux":
  - Pre-fix logic: top result "For Real" by Amel Larrieux (4.9M views) -
    reproduces the reported bug exactly, live.
  - Post-fix logic: correctly matches "I n I" by Amel Larrieux (496K
    views) - the title-relevance hard filter now actually excludes the
    other, unrelated same-artist tracks that share nothing but the artist
    name, leaving only genuine "I n I" uploads in the candidate pool.
  - Regression check: "Lava Lamp" / Thundercat (a normal multi-word title)
    picked the identical top candidate before and after the change. A
    second regression check ("Don't Stop Believin'" / Journey) was cut
    short by an intermittent YouTube bot-check block mid-run (the same
    known-intermittent block `fetchYouTubePage`'s comments describe) after
    its "OLD" pass had already completed cleanly and matched expectations
    (`sourceTokens` correctly excluded the apostrophe-split "t"); the "NEW"
    pass wasn't independently re-run to completion, though the code change
    to that path is a no-op whenever any multi-character token exists,
    which this title's tokens all satisfy. Not verified end-to-end: the
    actual staleness re-resolve trigger for a previously-cached "i n i"
    entry (covered generically by the existing, already-verified
    `stale-track-links` machinery, not re-tested here) and "Blinding
    Lights" / The Weeknd (queued but not reached before the block). No new
    console errors; this is a worker/backend-only logic change with a
    two-line client cache-version bump, no UI touched.

### queue-footer-overlap: Queue slide-up panel bottom row blocked by footer player on mobile
- **Status:** merged
- **Priority:** medium
- **Description:** On mobile, when the queue panel is open, its bottom-most
  entry is blocked/covered by the footer player bar - the same overlap bug
  `library-playlist-footer-overlap` already fixed for the playlist panel,
  now reported on the queue panel specifically.
- **Touches:** queue slide-up panel (`#queue-panel` or equivalent), mobile
  footer player bar z-index/spacing - likely the same fix pattern as
  `library-playlist-footer-overlap` and `player-mobile-spacing`, applied to
  the queue panel's own scroll container.
- **Branch:** agent/queue-footer-overlap
- **Notes:** Synced from Geethub issue #117. Not a duplicate of
  `library-playlist-footer-overlap` (merged) - that one only touched the
  playlist panel; this is the analogous gap on the queue panel, per the
  reporter's own "just like the playlist was" framing.

  Fixed in commit `b6cb431`: identical root cause to
  `library-playlist-footer-overlap` - `#mini-bar` (footer player) shares
  the same `bottom` offset as `#queue-panel` on mobile (both anchor to
  `calc(var(--nav-h) + var(--safe-b))`) but `#mini-bar` has a higher
  z-index (42 vs. `#queue-panel`'s 41), so it floats over the queue
  list's own bottom edge. Added `#queueBody{padding-bottom:78px}` in the
  same mobile media query, right alongside the existing `#libplBody`
  rule, using the same 78px value (mini-bar's ~54px height plus
  breathing room) for consistency.

  Verified in a real browser: served this worktree's `index.html`
  directly via `python3 -m http.server 8791` from inside the worktree
  (confirmed via `location.href` in the browser that the tab was loading
  from `localhost:8791`, not some other checkout - a shared preview-tool
  launcher was deliberately avoided per the task brief). Loaded the
  standard EBBLESS test playlist (32 tracks), started playback so the
  mini-bar appeared, and opened the queue panel at a 375x812 viewport.

  Confirmed the bug reproduces without the fix: with `#queueBody`'s
  padding-bottom temporarily zeroed out via devtools, scrolling the
  queue's `.queue-scroll` container to its max scroll position left the
  last row (`Mushrooms & Roses`) ending 53px below the mini-bar's top
  edge - a real overlap, and visually confirmed by screenshot (the row's
  text rendered underneath the mini-bar's "STATE OF MIND" label).

  With the fix applied, the same scroll-to-bottom test put the last
  row's bottom edge ~21px above the mini-bar's top edge (no overlap),
  confirmed both by `getBoundingClientRect()` measurement and by
  screenshot - "Mushrooms & Roses" renders fully clear of the footer
  player with visible breathing room beneath it.

  One wrinkle hit during verification, noted here in case it recurs:
  the queue panel's `.queue-scroll` container also holds a second,
  normally-`hidden` child (`#playlistListWrap`, used when the queue
  panel pivots to show an underlying playlist's track list). An
  incidental interaction during manual testing unhid it, which
  inflated the scroll container's `scrollHeight` and produced wildly
  wrong `scrollTop`/`getBoundingClientRect()` readings until it was
  re-hidden - a testing artifact, not a product bug, and unrelated to
  this fix, but worth knowing about if the queue panel ever appears to
  scroll further than its visible track list suggests it should.

  Checked the browser console before and after opening the queue panel:
  saw a handful of `502` / "unknown error... fetching the script"
  messages, but these were already present on a bare page load before
  touching the queue at all (looks like unrelated third-party
  track-matching/network noise from the test playlist import flow) - no
  new console errors were introduced by this change.

  Pushed to `agent/queue-footer-overlap` - awaiting your local review
  before merge. Not merged and not deployed, per the task scope.

### back-button-to-player: Back button should return to the player, not out of the app
- **Status:** merged
- **Priority:** medium
- **Description:** Hitting the back button (mobile back gesture/hardware
  back) from within the app should navigate to the player view, rather than
  its current behavior (reported as going back out of "my part" of the
  app - likely exiting the current view/app instead of returning to the
  player).
- **Touches:** mobile back-button/history handling - needs investigation
  into whatever `popstate`/back-navigation wiring (or lack of it) currently
  exists.
- **Branch:** agent/back-button-to-player
- **Notes:** Synced from Geethub issue #118. Distinct from the merged
  `queue-close-return-view` (that one governs closing the queue panel
  specifically, returning to whichever view was open before it) - this is
  about the OS/browser back button generally, and the target is
  specifically the player view, not "whatever was open before."

  Root cause confirmed: the app had zero History API wiring before this -
  no `pushState`/`popstate` anywhere - so back always fell through to the
  browser/OS default (typically exiting the installed PWA), never anything
  app-aware.

  Fix: a single-buffered-history-entry pattern in `index.html`'s VIEW
  ROUTING section. `syncHistoryBuffer()` keeps exactly one extra
  `pushState` entry on the stack whenever the app is "away from rest"
  (`currentView !== 'player'`, or the queue panel open, or the library
  playlist sheet open), and collapses it back with `replaceState` the
  moment the app returns to rest through ordinary in-app navigation (nav
  taps, a panel's own close button/scrim) - so a manually-closed panel
  never leaves an orphaned entry that would eat a future back press for
  nothing. A `popstate` listener checks that same "away from rest" state:
  if true, it closes the queue panel, closes the library playlist sheet,
  and forces the view to Player - all in one back press - and does *not*
  push a fresh buffer entry, so a second back press (now genuinely at
  rest) falls through to the real default and actually exits, rather than
  trapping the user in an inescapable back-press loop. Wired into
  `setView()`, `openQueuePanel()`/`closeQueuePanel()`, and
  `toggleLibraryPlaylistPanel()`'s open path /
  `closeLibraryPlaylistPanel()`.

  This is deliberately a single-level buffer, not a per-action stack:
  pressing back from Library with the playlist sheet open lands on Player
  in one press (closing the sheet along the way) rather than requiring a
  press per layer. Chose this because the original report just says
  "should go to the player" with no mention of wanting intermediate
  states restored - simplicity over a nested trap felt like the safer
  read of a terse, typo-laden report.

  Verified on a 375x812 mobile viewport, served directly via
  `python3 -m http.server` from this worktree (confirmed via
  `location.href`, not the shared preview launcher) - the shared Browser
  pane tool itself turned out to be contended by other concurrent
  Claude Code sessions mid-verification (tabs closing/redirecting to other
  ports out from under this session; a "no back history" quirk in the
  pane's own back-navigation simulator that doesn't track pushState-created
  entries, unrelated to the app), so the real back button/gesture behavior
  was verified with `window.dispatchEvent(new PopStateEvent('popstate'))`
  in-page, which is exactly the event a real back gesture fires against a
  pushState entry, and is more reliable in that sandboxed pane than its own
  simulated Back action. Confirmed: Library -> back -> Player; Settings ->
  back -> Player; Queue panel open -> back -> closes queue, lands on
  Player; Library with the playlist sheet open -> back -> closes the
  sheet and lands on Player; already at Player with nothing open -> back
  -> no-op, no error (lets the browser's real back/exit proceed on the
  actual next press). No new console errors (the two console errors
  present were pre-existing browser-extension noise unrelated to
  index.html/sw.js, also present before this change).

  Open question: the original Geethub #118 report ("when you hit the
  back button from my prt of the app, it should go to the player") never
  says which "part" - I read it as "any view/overlay other than the
  player" and implemented it that way; if the reporter meant something
  narrower (e.g. only the queue), that would need a follow-up.

### record-tap-minigame: Rhythm-tap minigame on the spinning record
- **Status:** merged
- **Priority:** low
- **Description:** A minigame on the spinning record visual: the record
  spins slowly, and tapping/clicking it right when it returns to its
  original position (0 degrees) scores a point and makes it spin slightly
  faster each time. While a run is active, show the current score (growing
  as points go up) alongside the all-time high score. On a miss, the
  current score blinks 3 times then disappears; the high score stays
  visible for an extra 3 blinks before it also disappears.
- **Touches:** spinning-record visual element (new interaction layer on top
  of it), local high-score persistence.
- **Branch:** agent/record-tap-minigame
- **Notes:** Synced from Geethub issue #116. New feature, not overlapping
  `spinning-record-realism` (that's a visual/physicality polish pass with no
  gameplay) - worth sequencing after that one if both are built, so the
  minigame's interaction layer sits on top of the finished visual rather
  than the other way around.

  **Built** (aa10c9c, owner follow-ups 960befd, b0d1dea, b59d03c, and
  the start-rule rework after them). Current behavior:
  - **Where:** only in the fullscreen flow view with the Spinning Record
    style showing. No game in the normal player (or the split-desktop
    panel-slide fullscreen): there a double-tap still goes on to
    fullscreen, single taps do nothing.
  - **Start:** a double-tap (second click within 300ms, same window as
    the art `DOUBLE_TAP_MS`) on the spinning record arms a run at 0: base
    speed, dot at the rim, "0 / Best n" showing. Single taps never start
    a run. Needs playback running (record spinning); reduced motion
    disables it. Fair start: the first 0deg pass after arming is a free
    one (may be tapped, ends nothing if missed); from then on every pass
    must be hit.
  - **Play:** during a run, a single tap within +/-16deg of 0deg (art
    upright; ~133ms each side at base 120deg/s) scores, speeds the platter
    x1.04 (cap 2.2x; eased twice from 10deg/x1.07/3x per owner "slightly easier") and walks the 0deg dot 1% of the disc inward per point
    after the first (3.5% to a 25% clamp; label edge at 31%). Angle is
    sampled at pointerdown and extrapolated past the last frame.
  - **End:** a tap outside the window, a second tap in the same window,
    letting a required pass go by, or pausing: score blinks 3x and goes,
    best holds then blinks 3x more and goes (order confirmed by owner),
    platter eases back to normal pace, dot back to the rim (Best stays
    accent through the blink if this run set a new best). Leaving
    fullscreen (X, swipe-down, switching art style) ends a run silently,
    best kept.
  - **Double-tap during a run** restarts a fresh run at 0; any best the
    pair's first tap wrote is put back.
  - **Taps elsewhere:** tapping the art (any style, viz, lyrics, player
    or fullscreen) never plays/pauses; play/pause is the transport
    buttons (fullscreen has its own `#flowPlayBtn`), Space and media keys.
    Fullscreen art view has no double-tap exit any more (X button and
    swipe-down remain); fullscreen cymatics (`#flowVizWrap`) keeps its
    double-tap exit since the record isn't shown there. Swipe prev/next
    unchanged.
  - **Press pulse:** every pointerdown on the record (any view, game or
    not) plays a 180ms Web Animation on the `.art-record` wrapper, scale 1
    -> 1.05 at 40% -> 1; the rotating `.record-disc` is untouched, no
    layout shift, skipped under reduced motion.
  - **Hit feedback:** every scoring tap pops the score (300ms overshoot
    scale), flashes the fixed target tick, and bursts a thin accent ring
    from where the dot was hit (380ms; a little bigger and brighter every
    5 points, capped at 20). Each hit cancels the previous hit's
    animations so fast streaks don't stack.
  - **New best:** once per run, at the point the score passes the best
    the run started with (only if there was one, i.e. best > 0): a "New
    best" accent flare above the score pill (1.3s), the Best number pulses
    3x, 14 small accent sparks drift off the record edge (~1-1.3s), and
    the splash's entry sound plays: a clone of `#onbMusic`
    (`brand/assets/intro-theme.mp3`, same plain `<audio>` path and 0.5s
    trim as the splash), volume 0.6, held ~0.9s then faded over 1.4s. It
    mixes over the YouTube player without touching it; no app sound
    setting governs the splash sound so none here; a blocked play() is
    swallowed. The sound replays on every further point of that run (each
    one raises the best again; a new play cuts the previous one), per
    owner 2026-10-01; the visual flare stays once per run. SW v46. No
    per-hit tick: the only UI sounds (LP needle sfx) have no setting to
    switch them off.
  - **Effects rules:** Web Animations on transform/opacity only, every
    effect element `pointer-events:none`, nothing awaited, so taps and
    timing are untouched; reduced-motion fallbacks are opacity/color only
    (moot today, since the game is off under reduced motion).
  - **Storage:** best in localStorage `ebbless:recordTapBest` (local only,
    not profile-synced). SW v45.

  Verified on a worktree-local server with a temporary debug hook and
  synthetic pointerdown/click pairs (rAF is throttled in the hidden
  preview pane): normal player single tap in-window does nothing, double
  tap opens fullscreen with no run; in fullscreen single tap with no run
  does nothing, double tap arms "0 / Best 5" without exiting, next-pass hit
  scores 1, double tap mid-run restarts at 0 and reverts a best 5 -> 6
  write, off-window tap blinks out; armed at 340deg the 360deg pass went by
  with the run still on, and the next untapped pass ended it; X during a
  run cancels silently. `#flowPlayBtn` is visible (58px) and wired to
  `userTogglePlayback`, but real playback couldn't be exercised in the
  sandbox. Feedback pass: hits 1-5 from a stored best of 2 fired the
  pop/tick/ring each hit, the best moment only at 3 (one `play()` of the
  `intro-theme.mp3` clone at volume 0.6, none on later hits), no page
  errors; frames frozen mid-animation and checked at desktop and 375px
  (flare sits above the pill, no overlap). Needs real-device check:
  double-tap to arm on touch, feel of the +/-16deg window, pulse and
  burst feel, the new-best sound mixing over YouTube on iOS (an `<audio>`
  start there could interrupt the player), cue tick/dot against real
  label art.

### queue-panel-remove-playlist-section: Remove the "Playlist" section from the queue panel
- **Status:** merged
- **Priority:** medium
- **Description:** The queue panel showed a "Playlist" section below the
  queue itself (the currently loaded playlist's full tracklist, with
  Play/Sort/Add song/Re-match controls) every time a playlist was loaded.
  User reported this as clutter, not needed.
- **Touches:** `index.html` `#queue-panel`'s `.playlist-list-wrap` markup,
  its CSS, and the JS wiring exclusively feeding it (`renderTrackList`,
  `computeViewOrder`, `reorderPlaylistTracks`, `wireTrackRowDrag`,
  `highlightActiveRow`, `removeTrackFromCustomPlaylist`, and the
  `addSongBtn`/`reResolveBtn`/`trackSortSel`/`plPlayBtn` handlers).
- **Branch:** none - done directly against `main` (no other session active
  at the time; small, self-contained removal).
- **Notes:** Asked the user first since this section also held Add Song and
  Sort tracks controls with no other entry point in the app (Re-match
  duplicates the existing "Refresh links" item in the library card's 3-dot
  menu) - user chose to remove the whole section, accepting the loss of
  Add Song/Sort. Kept `state.playlist` itself and the shared track-options
  menu (`trackCtxMenu`/`toggleTrackCtxMenu`), since both are also used by
  the separate `libpl-panel` (library playlist browsing panel) and the
  queue engine's up-next logic - only the exclusively-UI code for this one
  section was removed. Verified via a local `python3 -m http.server`
  served directly from a fresh checkout (confirmed via `location.href`),
  loaded the standard test playlist, and confirmed `.queue-scroll` inside
  `#queue-panel` contains only `#queueBody` with no trace of the removed
  elements in the DOM. Also re-verified the separate `libpl-panel` (opened
  from a library card) still renders and functions normally, confirming
  the shared track-menu code wasn't disturbed. No new console errors -
  only the pre-existing, unrelated YouTube iframe-API script-fetch errors.

### queue-drag-reorder-glitch: Dragging a track up the queue glitches and drifts back down
- **Status:** merged
- **Priority:** medium
- **Description:** Reordering tracks by dragging within the queue panel
  glitches after a track is dragged a few spaces - it stops staying
  gripped to the cursor, and after release it slowly drifts back down the
  list instead of staying where it was dropped.
- **Touches:** queue panel drag-to-reorder (queue's own up-next list, not
  the removed `.playlist-list-wrap` section from
  `queue-panel-remove-playlist-section` above - that removal deleted
  `wireTrackRowDrag` for the playlist tracklist specifically, this is the
  separate queue-reordering drag behavior).
- **Branch:** `agent/queue-drag-reorder-glitch`
- **Notes:** Synced from Geethub issue #119.
  Root cause found in `wireQueueRowGestures()` (the `pointermove` handler
  driving the queue's own drag-to-reorder, around what was index.html
  line ~5194 before this fix). Each time the dragged row crossed the
  0.6*rowH swap threshold, the code did `queueBody.insertBefore(...)` to
  swap DOM siblings, then reset both `startY` and the row's
  `translateY` transform to 0. But the DOM swap itself shifts the row's
  base layout offset by a full `rowH`, not by the smaller `dy` that had
  actually accumulated at the threshold crossing - so every swap injected
  an uncompensated `(rowH - dy)` jump into the row's rendered position.
  Over a multi-row drag those jumps compounded, which is exactly "stops
  staying gripped to the cursor after a few spaces." The final DOM order
  written to `state.queue` (via `queueReorder`) was still numerically
  correct (each swap really did happen), but because the visual position
  had drifted away from the cursor by drop time, the row appeared to
  "slowly drift back down" once the queue panel re-rendered to its
  actual (correct) computed slot instead of the visually-drifted one the
  user thought they'd dropped it at.

  Fix: instead of zeroing `startY`/transform on each swap, carry the
  leftover `dy` across the swap by adjusting `startY` and `dy` by `rowH`,
  so the row's on-screen position stays continuous through the whole
  drag (no jump = stays gripped, and the drop position now visually
  matches the actual reordered slot). Also changed the single
  `if`/`else if` swap check to `while` loops so one fast `pointermove`
  that crosses more than one row's worth of movement swaps through all
  of them in that same event instead of needing a follow-up move to
  "catch up."

  **Verification:** Served this worktree's own `index.html` directly via
  `python3 -m http.server` from inside the worktree (not the shared
  preview-tool launcher, which has previously been reported to silently
  serve the main checkout instead of a worktree's copy) and confirmed
  `location.href` pointed at `http://localhost:<port>/index.html` from
  this worktree before testing. Loaded the standard EBBLESS test Spotify
  playlist (per the project's saved test-playlist convention) to get a
  real 30+ track queue, then drove the queue panel's drag handle with
  real `PointerEvent` sequences (`pointerdown` -> many incremental
  `pointermove` steps -> `pointerup`) dispatched directly on the handle
  element, both dragging a row up ~6 spots and back down ~4.5 spots.
  Logged the row's `getBoundingClientRect().top` vs. the simulated
  pointer Y at every step: the offset between cursor and row stayed
  essentially constant throughout each drag (no jump), and after
  release the row landed at exactly the expected list index with no
  leftover inline transform and no post-drop animation/drift. Checked
  `read_console_messages` before/after - no errors traceable to
  `wireQueueRowGestures`/`queueReorder`/drag handling (the only console
  errors present were pre-existing YouTube/artwork fetch failures from
  the sandboxed test environment having no real network access, unrelated
  to this change).
  **Caveat:** verification drove the drag via synthetic `PointerEvent`s
  through JS rather than the browser tool's native mouse-drag emulation
  (which only supports start/end coordinates, not a realistic multi-step
  move path), so real trackpad/touch "jitter" during a human drag wasn't
  exercised - but the fix addresses the underlying math unconditionally
  (it no longer matters how many pointermove events land or how large
  each step is), so this shouldn't be sensitive to that.

### audio-quality-boost: Boost audio quality
- **Status:** merged
- **Priority:** medium
- **Description:** Reporter wants audio quality boosted generally. No
  further detail given - needs investigation into what's actually
  controllable here (stream bitrate/source quality selection vs. an
  EQ/processing boost) before scoping a fix.
- **Touches:** audio playback pipeline / source resolution - needs
  locating.
- **Branch:** agent/audio-quality-boost
- **Notes:** Synced from Geethub issue #120. Distinct from `volume-equalizer`
  (loudness normalization) and `lp-quality-audio` (vinyl-warmth EQ option)
  - this is a plain "make it sound better/higher quality" ask, not either
  of those specific features. Worth reviewing together since all three
  touch audio processing.

  Investigated the full playback pipeline end to end
  (`createDeckPlayer`/`createSCDeckPlayer` and everything around them in
  `index.html`, plus `worker/src/index.js`'s `/search` and `/soundcloud`
  endpoints) looking for a real, controllable fidelity lever - stream
  bitrate, source-quality tier, codec choice, or client-side processing
  degrading output - per this entry's own scoping note. Conclusion: there
  isn't one available to change. Detail:

  - **YouTube path.** Every deck's `YT.Player` is pinned to
    `LOWEST_QUALITY = 'tiny'` via `vq`/`suggestedQuality`/
    `setPlaybackQuality`, re-forced on every ready/quality-change/load
    (`forceLowestQuality`, ~index.html:6047-6082). This looked like the
    obvious culprit going in - forcing "tiny" sounds like it should mean
    "worst everything." Checked it directly rather than assuming: on the
    IFrame Player's modern adaptive (DASH-style) delivery, video and audio
    are separate representations, and the quality tier
    (`tiny`/`small`/`medium`/...) only selects the video-only
    representation - audio is negotiated independently and served at its
    best available bitrate (AAC ~128kbps / Opus ~160kbps, itag 140/251)
    regardless of the forced video tier. The only YouTube formats that
    couple a genuinely low, fixed audio bitrate to a low video tier are the
    legacy muxed progressive itags (17 @ 144p, ~24kbps mono; 18 @ 360p,
    Google's own metadata literally tags it `AUDIO_QUALITY_LOW`) - and
    those are non-adaptive fallbacks for clients without MediaSource
    Extensions support, which is effectively none of the browsers/webviews
    this app runs in today. So the existing comment above
    `LOWEST_QUALITY` ("saves bandwidth/load time with zero visible/audible
    cost") holds up under scrutiny rather than being an untested
    assumption worth overturning - confirmed against YouTube's own support
    docs, itag references, and multiple independent community threads
    converging on the same "video quality setting doesn't touch audio
    bitrate on modern YouTube" answer. Left unchanged: touching it would
    only spend more (invisible, since this app never shows the video)
    bandwidth for zero fidelity gain.
  - **SoundCloud path.** Native playback (`createSCDeckPlayer`,
    `soundCloudWidgetSrc`, ~index.html:6087-6230) already goes through
    SoundCloud's own embeddable Widget (`w.soundcloud.com/player`) rather
    than a YouTube-matched proxy - the real, already-shipped quality win
    here was the `soundcloud-native-playback` work itself, which fixed the
    much bigger fidelity problem of an independent artist's track
    sometimes having *no* correct YouTube match at all. Checked whether the
    embed Widget exposes any client-selectable quality/bitrate parameter
    (a "hq" stream tier does exist in SoundCloud's API, but it's gated
    behind an authenticated Go+ subscription) - it doesn't, for an
    anonymous embed. Nothing to select here; the widget already serves the
    best tier obtainable without SoundCloud login.
  - **No client-side audio processing anywhere.** Neither pipeline is ever
    routed through the Web Audio API - confirmed by the code itself,
    which explains why in two places (index.html:6337,
    "YouTube's iframe audio can't be tapped by the Web Audio API
    (cross-origin)"; index.html:8402-8404, routing the onboarding music
    element through a fresh `AudioContext` "would silence it outright").
    Crossfade/volume changes go through each player's own native
    `setVolume`, not a `GainNode`. There's no compressor, limiter, or
    resampling step degrading anything to remove.
  - **Worker.** `worker/src/index.js`'s `/search` and `/soundcloud`
    endpoints only ever resolve metadata (title/artist/duration/videoId/
    channel) for the client to hand to the YouTube/SoundCloud embeds -
    neither endpoint touches an actual audio stream URL, itag, or bitrate;
    that choice is made entirely inside the two platforms' own players
    after receiving an id, not by this app. `scoreCandidate()` already
    biases YouTube matching toward "- Topic" channels and official-audio/
    lyric-video uploads over VEVO-style music videos (which can splice in
    spoken intros) - i.e. it already prefers the cleanest available
    recording. That's pre-existing, recently-tuned match-scoring logic
    aimed at correctness (right song, right cut), a different concern from
    this entry's stream-fidelity scope, and not touched further here.

  **No code change made.** Both playback backends (YouTube IFrame Player,
  SoundCloud Widget) are opaque, cross-origin, platform-owned embeds that
  don't expose a client-selectable bitrate/quality knob beyond what's
  already in use - correctly, for SoundCloud, and provably harmlessly for
  the one YouTube "quality" override that exists. Making a cosmetic change
  here (e.g. flipping `LOWEST_QUALITY` to something less extreme) would
  have shipped nothing audible, per the investigation above, while quietly
  regressing the bandwidth/load-time saving that setting exists for -
  exactly the "cosmetic change to look busy" this entry's own instructions
  warned against.

  **What remains unverified:** this conclusion rests on documented YouTube
  IFrame Player / DASH behavior, itag references, and community consensus
  (no single canonical spec doc covers it) rather than a live packet
  capture of this app's own negotiated audio itag - there's no network
  egress to youtube.com/soundcloud.com from this sandbox to confirm
  directly, so real playback was not (and could not be) listened to here.
  If issue #120's reporter can give a concrete example (a specific song
  that sounds bad, and how - muffled, quiet, distorted, cutting out), that
  would likely point at something this investigation couldn't rule out
  from static code alone: a genuinely low-quality source upload winning
  the YouTube match (a matching-correctness issue, not a tier issue),
  buffering/dropouts read as "quality," or a loudness complaint (which is
  `volume-equalizer`'s scope, not this one) - worth a follow-up ask before
  assuming this entry needs more work.

### token-exhaustion-splash-stuck: App stuck on splash when out of tokens
- **Status:** merged
- **Priority:** high
- **Description:** Reporter says every time they run out of (Claude/API)
  tokens, the site doesn't load on desktop or mobile - it just stays on the
  splash screen. Investigate what backend call the app depends on during
  startup that fails silently/hangs when a token budget is exhausted, and
  make the splash fail gracefully (error state or timeout past it) instead
  of hanging forever.
- **Touches:** startup flow (`startApp()`), splash screen, whatever
  backend/worker call it's blocking on during load - needs locating.
- **Branch:** `agent/token-exhaustion-splash-stuck`
- **Notes:** Synced from Geethub issue #122. Distinct from the already-merged
  `app-down-splash-blocked` (that was a `#onbCapture` tap-catcher z-index bug,
  unrelated to token exhaustion) - different root cause, same visible symptom
  (stuck splash), so kept as a separate entry rather than folded in.

  **Root cause found:** it's not a hung network `await` gating the splash -
  every fetch to `BACKEND` (the `spotify-youtube-search` Cloudflare Worker,
  used for Spotify/YouTube/SoundCloud/Apple Music resolves, `/similar`,
  `/lyrics`, etc.) already wraps its `fetch`/`await res.json()` in try/catch
  that degrades gracefully. The actual bug is in `startApp()`
  (`index.html`, was ~line 7138): its bootstrap block -
  `ensureSwellPlaylist()`, `renderLibrary()`, `renderQueuePanel()`,
  `setView()`, `refreshSwellIfStale()`, the stale-playlist re-resolve sweep,
  `seedStarterLibrary()` - ran completely unguarded, *before* the code that
  schedules the splash's dismiss timer (`setTimeout(hideSplash, SPLASH_MS)`
  or the mobile install-invite path). `#splash` is opaque and visible by
  default (the no-FOUC cover), so it only ever goes away once JS explicitly
  hides it. Any synchronous throw in that unguarded block - e.g. from a
  playlist object left corrupted/partial in localStorage by a prior
  `resolvePlaylist()` call that errored out or hit an exhausted API/token
  budget mid-resolve (see its `resolving: true` partial-snapshot writes) -
  aborted `startApp()` outright before it ever reached the splash-dismiss
  code, stranding the visitor on the splash forever with no error shown and
  no retry path.

  **Fix:** wrapped that entire bootstrap block in try/catch (falling back to
  a plain `setView()` on error) so a throw there can only degrade what lands
  on screen (e.g. an empty library instead of a seeded one) and can never
  again prevent the splash-dismiss code from running. Also added an
  independent 12-second hard safety-net `setTimeout` near the very top of
  the script (right after the `BACKEND` constant, so it's scheduled as early
  as possible) that force-hides `#splash` no matter what else happens during
  startup - a last-resort backstop for failure modes outside that one block.
  Both changes are additive/defensive; no existing startup behavior was
  restructured or removed.

  **Verified:** served this worktree's own `index.html` directly via
  `python3 -m http.server` (not the shared preview-tool launcher, per this
  repo's multi-worktree caution) and confirmed `location.href` pointed at
  the worktree copy before testing. Normal path: splash clears and the
  library renders exactly as before, no regressions. Failure path: since a
  live real-world token/quota exhaustion isn't reproducible in this sandbox,
  simulated it by injecting a synchronous throw at the top of the
  previously-unguarded bootstrap block (behind a `localStorage` test flag,
  not shipped) to stand in for a corrupted cache left by an exhausted-quota
  resolve. On the pre-fix code this reproduced the reported bug exactly -
  splash logo stuck on screen indefinitely with an uncaught error in the
  console. On the fixed code the same throw is caught, the splash still
  clears within its normal timing, and the app lands in a usable (if
  degraded - empty library) state instead of hanging.

  **Caveat:** this fix addresses the confirmed, reproducible mechanism (an
  uncaught synchronous error during startup bootstrap leaving the splash-
  dismiss timer unscheduled) plus a general backstop timeout. It was not
  possible to actually exhaust the `spotify-youtube-search` Worker's real
  upstream API quota/tokens in this sandbox to prove that specific trigger
  end-to-end - the fix instead guards against *any* startup-time throw
  (including one caused that way), which covers the reported symptom
  regardless of which upstream call originally exhausted its budget.

### youtube-link-paste-play: Paste a YouTube link to a song and have it play
- **Status:** merged
- **Priority:** medium
- **Description:** Reporter wants to paste a YouTube link to a song and have
  it play. The app already appears to recognize `youtube.com/watch`,
  `youtu.be`, and `/shorts/` links as a `yt_video` type
  (`index.html` ~line 1949-1965, 3300) - needs investigation into whether
  this path is actually reachable from the paste-a-link UI and working
  end-to-end, or whether it's dead/broken code, before scoping a fix.
- **Touches:** link-paste import flow, YouTube link parsing
  (`index.html` ~line 1949-1965), `yt_video` resolution (~line 3300).
- **Branch:** `agent/youtube-link-paste-play`
- **Notes:** Synced from Geethub issue #123.

  Traced the full path by hand: `parseYouTubeLink`/`parseImportLink`
  (index.html ~2051-2149) correctly classify `youtube.com/watch?v=`,
  `youtu.be/`, and `/shorts/` links (with or without tracking params like
  `?si=`) as `yt_video`; the main paste-link form's submit handler
  (~4466-4482) already branches on `parsed.source === 'youtube'` and calls
  `beginImport('yt:'+id, false, 'yt_video')`; `resolvePlaylist`'s
  `yt_video` branch (~2468-2479) calls `fetchYouTubeVideo` -> backend
  `GET /ytvideo?id=` (worker/src/index.js `handleYtVideo`, ~640-685),
  which scrapes the watch page's `ytInitialPlayerResponse` for
  title/artist/thumbnail; `isSingleTrackType` (~4369-4371) already
  includes `yt_video` so it's routed through
  `openSingleTrackDestinationPicker` into a playlist/Liked Songs instead
  of being mishandled as a bare "playlist"; and playback
  (`loadIndex`/`createDeckPlayer`, ~6464+) runs off `track.videoId`
  identically regardless of source. **None of this was dead or broken
  code** - every link in the chain was already wired and reachable.

  The actual defect was in the UI copy, not the logic. Commit `c198a0e`
  ("Add YouTube track duration and bump worker cache version", Sep 13)
  stripped the word "YouTube" out of four places while leaving the
  `yt_video` handling itself untouched: the main `#urlInput` placeholder
  (said "Paste a Spotify, SoundCloud, or Apple Music link"), the main
  import form's "that doesn't look like a link" error, the
  `resolveTracksFromLink` ("+ Add song" flow) error of the same kind, and
  the onboarding-animation caption. Meanwhile the sibling
  "replace track link" picker (`#plReplaceInput`) still said "Spotify,
  YouTube, SoundCloud, or Apple Music" the whole time, and the About-page
  copy was left with a dangling "Either way, playback threads through..."
  that no longer had a first "way" stated (the YouTube-direct clause had
  been deleted out from under it). Net effect: a listener pasting a
  YouTube link got no on-screen indication it was supported, and anyone
  who mistyped a link was told the app only understood three other
  services - even though YouTube worked the whole time.

  **Fix:** restored "YouTube" to the placeholder, both error strings, and
  the onboarding caption; restored the About copy's "or paste a YouTube
  playlist or video link directly" clause so "Either way" has an
  antecedent again. No changes to the classifier, `resolvePlaylist`,
  `beginImport`, or player - scoped purely to the copy that was hiding an
  already-working feature. Diff is 5 one-line copy changes in
  `index.html`.

  **Verified:**
  - `parseYouTubeLink` unit-tested standalone (extracted into a Node
    snippet) against `youtube.com/watch?v=`, `youtu.be/id`,
    `youtu.be/id?si=...`, bare `youtube.com/watch?v=` with no scheme,
    `m.youtube.com`, `music.youtube.com` with a `list=RD...` mix param,
    and `/shorts/id` - all correctly resolve to `{type:'video', id}`.
  - Served this worktree's own `index.html` directly with
    `python3 -m http.server` from inside the worktree (confirmed via
    `location.href` in the browser that the fixed copy, not the main
    checkout's, was loaded - the shared preview-tool launcher was
    avoided per the known cross-worktree risk, and a stray
    `http.server` from an unrelated worktree/session already squatting
    on the first port tried was caught via `lsof -p <pid> | grep cwd`
    before it could produce a false verification).
  - Confirmed the placeholder, import-form error text, and onboarding
    caption all now read "YouTube" in the served page.
  - Pasted `https://youtu.be/dQw4w9WgXcQ?si=abc123` into the live
    `#urlInput` and clicked Load: the classifier fired, `beginImport`
    opened the import overlay, and the request chain reached the real
    backend and a real `https://www.youtube.com/watch?v=...` fetch - this
    sandbox does have network egress that far. The call came back with
    "youtube redirected to an interstitial (likely a transient bot-check)
    instead of serving results," i.e. YouTube's bot detection blocked the
    scrape from this environment's IP, exactly the failure mode
    `handleYtVideo`/`fetchYouTubePage` already anticipate and surface as a
    typed, retryable error (see worker/src/index.js `YouTubeBlockedError`).
    This is independent confirmation the whole pipeline - UI, classifier,
    `beginImport`, `resolvePlaylist`, and the live network call - is
    reachable and correctly wired end to end; it also happens to be the
    likely reason some real users see this "not working" intermittently
    (the `/ytvideo` scrape has no official-API fallback and is inherently
    exposed to YouTube's bot-checks), but that reliability question is a
    separate, pre-existing backend-scraping concern, not a paste-UI wiring
    bug, and is out of scope for this fix.
  - **Not verified:** an actual successful YouTube video resolution and
    playback against a real video with no bot-check in the way (blocked by
    the transient interstitial above, not by anything in this diff).
    Recommend a follow-up manual check on a real device/network - paste a
    `youtu.be` or `youtube.com/watch?v=` link for an actual song and
    confirm title/artist/art populate and the track plays - to rule out
    any YouTube-scrape-specific issue that only a successful response
    would surface (e.g. an edge case in how `handleYtVideo` parses
    `ytInitialPlayerResponse` for a particular video's metadata shape).

### app-icon-transparent-bg: App icon should have a transparent background across all platforms
- **Status:** merged
- **Priority:** medium
- **Description:** The app icon (home screen / PWA / favicon / any other
  platform surface it's used on) should have a transparent background
  instead of whatever solid background it currently renders with.
- **Touches:** app icon assets and manifest (`manifest.json` / PWA icon
  set, favicon), likely under `brand/` or wherever icon source files live.
- **Branch:** agent/app-icon-transparent-bg
- **Notes:** Synced from Geethub issue #132. Found: every rasterized icon
  under `brand/assets/icons/` (`favicon-16.png`, `favicon-32.png`,
  `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) was the transparent
  glyph in `brand/assets/mark.png` flattened onto an opaque `#121212` square
  - confirmed via `sips -g hasAlpha` (all `no`) and by inspecting each PNG.
  `manifest.json` also reused that one opaque `icon-512.png` for both the
  `"any"` and `"maskable"` purposes.
  Fix: regenerated all five files by compositing `mark.png` onto a
  transparent canvas at the same scale/position the glyph already occupied
  in each existing icon (measured each icon's non-background content bbox
  first so size/placement is pixel-for-pixel unchanged, only the background
  went transparent). Kept one opaque variant, `icon-512.png` copied to a new
  `icon-512-maskable.png`, and pointed `manifest.json`'s `"maskable"` entry
  at it, since maskable icons are spec'd to fill their full safe-zone with
  an opaque background (the OS applies its own mask shape on top - a
  transparent maskable icon renders inconsistently across launchers).
  `"any"`-purpose entries (`icon-192.png`, `icon-512.png`) now point at the
  transparent versions, as do the favicon `<link>` tags and
  `apple-touch-icon` in `index.html` (unchanged, same filenames). Also
  updated a stale code comment near the onboarding-outro animation
  (`index.html` ~line 9008) that had asserted the PWA icon "has to" lack an
  alpha channel - that claim was never quite right and is now actively
  wrong for the `"any"` icons, so reworded it to the real reason that code
  path uses `mark-white.png` instead (sizing/padding, not alpha support).
  Note: iOS itself ignores alpha in `apple-touch-icon` and paints a black
  fallback behind it on the home screen - that's platform behavior outside
  this file's control, not a regression here.
  Verified: `sips -g hasAlpha` on all five regenerated files now reports
  `yes` (`icon-512-maskable.png` correctly still `no`, by design). Rendered
  each new icon over a checkerboard via PIL and visually confirmed clean
  transparency with the glyph in its original position/scale (no
  resizing/recropping artifacts). Served the worktree over
  `python3 -m http.server` and loaded it in a real browser tab: fetched
  `manifest.json` and every icon file (all 200, correct `image/png` /
  `application/json` content-types), then decoded each PNG onto a canvas
  and read back the corner pixel - `[0,0,0,0]` (fully transparent) for all
  `"any"`-purpose icons and favicons, `[18,18,18,255]` (opaque `#121212`)
  for `icon-512-maskable.png` as intended.

### desktop-settings-queue-popup: Opening Settings on desktop also pops open the queue window
- **Status:** merged
- **Priority:** medium
- **Description:** On desktop, clicking Settings incorrectly also opens the
  queue panel/window at the same time. Settings should open on its own.
- **Touches:** desktop split-view layout, Settings navigation - likely an
  interaction bug in the same area `desktop-settings-inline` (merged)
  touched (`setView()`, the `>=1150px` split-desktop grid).
- **Branch:** agent/desktop-settings-queue-popup
- **Notes:** Synced from Geethub issue #131. Confirmed a regression from
  `desktop-settings-inline`, but only under one specific precondition: the
  split-desktop "fullscreen player" mode (`desktop-fs`, added later by
  `desktop-player-fullscreen-toggle`), entered via the expand button on the
  Player view, which hides the library/queue panes as fixed off-screen
  drawers (`#view-library`/`#queue-panel` with `transform:translateX(...)`,
  toggled open only via `.desktop-fs-lib-open`/`.desktop-fs-queue-open`).
  Plain split-desktop (not fullscreen) was unaffected - there the queue has
  always been a permanently-visible 3rd grid column by design, and Settings
  already opened cleanly alongside it.

  **Root cause:** all the desktop-fs drawer-positioning CSS rules
  (`body.split-desktop.desktop-fs:not(.view-settings-active) #view-library`
  / `#queue-panel`, around line 998 in `index.html`) are scoped with
  `:not(.view-settings-active)`, on the assumption (per the original
  comment) that fullscreen mode could only ever be *entered* from the
  Player view, which isn't reachable while Settings is open - so the guard
  seemed safe. That assumption missed the reverse path: you can already
  *be* in desktop-fs mode and then click the always-visible Settings nav
  button. Doing so adds `view-settings-active` to `<body>`, which drops all
  those drawer rules - and the earlier, unconditional base split-desktop
  rules (`body.split-desktop #view-library` / `#queue-panel`, which always
  render both as static, visible grid columns) take back over. So both
  panes snapped into view alongside Settings even though their own
  `state.deskFsLibOpen`/`state.deskFsQueueOpen` said closed - the queue
  popping open was the more visible symptom since the library reappearing
  in its usual spot reads as normal.

  **Fix (`setView()` in `index.html`, ~line 2977):** when navigating to
  `'settings'` while `state.deskFsOpen` is true, call the existing
  `closeDesktopFs()` first (cleanly resets `deskFsOpen`/`deskFsLibOpen`/
  `deskFsQueueOpen` and strips the `desktop-fs*` body classes) before the
  rest of `setView()` runs. This makes Settings always land on one
  deterministic layout - the plain split-desktop grid, library and queue
  exactly as visible as they are outside fullscreen - instead of a
  CSS-forced hybrid state that didn't match the JS state. Closing Settings
  afterward returns to the normal (non-fullscreen) player, which is the
  expected outcome of having explicitly exited fullscreen.

  **Verified locally:** served the worktree with `python3 -m http.server`
  and drove it in a real browser at 1400x900 (>=1150px split-desktop).
  Reproduced pre-fix: entered desktop-fs (expand button on Player), left
  the library/queue drawers closed, clicked Settings - both panes snapped
  open (confirmed via screenshot and by inspecting `document.body.className`
  going from `split-desktop desktop-fs` to `split-desktop view-settings-active`,
  i.e. `desktop-fs` silently dropping out while both drawers displayed).
  After the fix: same steps now show `desktop-fs` explicitly removed by
  `closeDesktopFs()` before `view-settings-active` is added, and the
  screenshot matches the already-correct plain-split-desktop Settings view
  (library left, Settings center, queue right, no stray nav buttons). Also
  checked: opening Settings from plain (non-fullscreen) split-desktop is
  unchanged; toggling the queue drawer directly in desktop-fs mode (without
  ever touching Settings) still opens/closes it normally; opening Settings
  from desktop-fs with the queue drawer already open also resolves cleanly
  with no stray open drawer; and Settings navigation at mobile width
  (390x844, well under the 1150px breakpoint, where `deskFsOpen` is never
  true) is untouched.

### breathe-love-deep-soundcloud-pull: "Breathe Love Deep" album still not pulling from its real SoundCloud source, plays random YouTube songs
- **Status:** merged
- **Priority:** high
- **Description:** The "Breathe Love Deep" album is pulling random songs
  from YouTube while still showing the correct "Breathe Love Deep" album
  art and titles, instead of playing the actual tracks from its real
  SoundCloud source (`https://soundcloud.com/mal-griot/sets/breathelovedeep`).
- **Touches:** starter/default library seed (`STARTER_LIBRARY_URLS` /
  `seedStarterLibrary()`), SoundCloud/source resolution
  (`sourceKindForType()`, `resolveTrackArt()`), track-link matching
  pipeline (`link-match-accuracy` area).
- **Branch:** `agent/breathe-love-deep-spotify-pull` (lane was claimed
  under the original slug before the wording below was corrected from
  "spotify" to "soundcloud" - kept as-is rather than re-churning the
  worktree/branch for a naming fix only).
- **Notes:** Reporter clarified (2026-09-22) the original issue title's
  "spotify link" phrasing was a mistake - this album is SoundCloud-sourced,
  not Spotify. Entry title/slug/description corrected accordingly; the
  dispatched agent's brief was already scoped to SoundCloud resolution
  (not Spotify), so no redirection was needed, just this record correction.
  Synced from Geethub issue #130. Likely a regression or
  incomplete fix relative to the already-merged `breathe-love-deep-album`
  entry above (which addressed album categorization and SoundCloud
  sourcing) - needs fresh investigation into why tracks are resolving to
  mismatched YouTube results despite correct display metadata; may
  overlap with `link-match-accuracy` (merged) or `stale-track-links`
  (merged) territory. Flagging as high priority since it's a listener-
  facing playback-correctness bug on the app's own default-seeded release.

  **Root cause (confirmed live):** every SoundCloud source plays through
  the shared resolve pipeline by matching `{title, artist}` to a YouTube
  video via `searchYouTube()` (SoundCloud audio was never streamed
  natively - existing, intentional architecture, see `index.html:2272-2274`
  comment). Two compounding gaps let bad matches through for this album
  specifically: (1) the worker's `/soundcloud` endpoint never extracted
  SoundCloud's own `duration` field, so the duration hard-filter never
  engaged - the exact unfinished follow-up the merged `link-match-accuracy`
  lane had already flagged; (2) every track title on this release is
  stylized as individually letter-spaced (`"h i g h"`, `"b u r n"`,
  `". . . g a s p"`), which defeats the title-token-overlap filter the
  same way the `amel-larrieux-wrong-track` "i n i" case did.

  **Fixed** (commit `43fd288` on `agent/breathe-love-deep-spotify-pull`):
  `worker/src/index.js` - `scTrackToTitleArtist()` now returns `duration`,
  threaded through `handleSoundCloud()`'s payloads; new
  `collapseLetterSpacedTitle()` normalizes letter-spaced titles
  (`"h i g h"` -> `"high"`) for both the search query and the title-overlap
  check in `handleSearch()`, narrowly guarded (3+ tokens, each 0-1
  alphanumeric chars) so ordinary titles are untouched. `ART_CACHE_VERSION`
  and `SEARCH_CACHE_VERSION` bumped so stale cache entries don't keep
  serving pre-fix results. `index.html` - `resolvePlaylist()`'s `sc_track`
  branch and `resolveTracksFromLink()`'s SoundCloud branch now both
  capture/pass `sourceDuration`; `RESOLVE_LOGIC_VERSION` bumped 4->5 so any
  already-cached SoundCloud resolve (including this starter album) gets
  quietly re-resolved with the fix applied. This is a real fix to the
  general SoundCloud-matching pipeline, not scoped to just this album.

  **Verified:** `node --check` on both changed files plus an
  extracted-script syntax check on `index.html` pass. Ran the worker live
  via `wrangler dev --local` (KV in local/simulated mode only) against
  real SoundCloud/YouTube network egress: confirmed `/soundcloud` now
  returns a real `duration` per track, and confirmed
  `collapseLetterSpacedTitle` changes real search behavior for the better
  (a bare `"high"` query now correctly surfaces "Wiz Khalifa - So High"
  instead of an unrelated match). Served this worktree's own `index.html`
  directly (confirmed via `location.href`, caught and corrected a
  cross-session stale-tab mixup mid-session by re-targeting an explicit
  `tabId`).

  **Not fully closed - important caveat:** even with both fixes, several
  tracks (`"h i g h"`, `"b u r n"`, `"m u t e"`) still resolve to unrelated
  "Griot"-culture videos live. Checked the full YouTube candidate pool for
  each query directly: **no legitimate Mal Griot upload appears in the
  results at all** - this isn't a scoring bug, there's nothing correct to
  rank higher. "Griot" collides with an established West African
  oral-historian/musician cultural term with heavy YouTube content, and
  this catalog has little-to-no YouTube presence of its own. No client- or
  server-side matching heuristic can select a correct video that isn't in
  the search results - the only complete fix is to stop routing
  SoundCloud-sourced playback through YouTube search entirely and stream
  SoundCloud audio natively instead (real architecture change, e.g.
  SoundCloud's own stream/embed API - out of scope for this lane's
  "smallest correct fix"). Filed as a new entry below,
  `soundcloud-native-playback`, so this doesn't get lost.

  **Not deployed:** `worker/src/index.js` is the shared, live Cloudflare
  Worker backend (`spotify-youtube-search.malgriot.workers.dev`) that
  production traffic and every other concurrent session hit regardless of
  which worktree serves `index.html`. Deliberately did not run
  `wrangler deploy` - that would push unmerged branch code straight to
  production for all live users. **`wrangler deploy` needs to run after
  this branch merges to `main`** - flagging clearly since the worker half
  of this fix does nothing for real listeners until that happens (your
  call, per usual).

### soundcloud-native-playback: Stream SoundCloud-sourced tracks natively instead of YouTube-search matching
- **Status:** merged
- **Priority:** high
- **Description:** SoundCloud-sourced playlists/albums currently play by
  matching each track's `{title, artist}` to a YouTube video via
  `searchYouTube()` - SoundCloud audio is never streamed natively. For
  artists/releases with little or no real YouTube presence (or whose name
  collides with an unrelated common term), this can produce completely
  wrong matches with no correct candidate available to rank higher, no
  matter how good the matching heuristic gets. Play SoundCloud-sourced
  tracks directly from SoundCloud's own stream/embed API instead of
  routing them through YouTube search.
- **Touches:** the shared resolve pipeline's YouTube-search matching path
  (`index.html` ~line 2272 comment, `resolvePlaylist()`), `worker/src/index.js`
  (`handleSoundCloud`, `handleSearch`), player/embed logic.
- **Branch:** `agent/soundcloud-native-playback`
- **Notes:** Flagged by the `breathe-love-deep-soundcloud-pull` agent as
  the real, complete fix for that bug's residual mismatches (several
  "Breathe Love Deep" tracks have zero legitimate YouTube candidates to
  match against at all, confirmed by checking the full search result pool
  directly - not a scoring/heuristic problem). That lane's fixes
  (SoundCloud duration signal, letter-spaced-title normalization) are
  real, general improvements to the matching pipeline and should still
  land, but this is the only way to fully eliminate wrong-track playback
  for SoundCloud sources with thin YouTube coverage. A genuine
  architecture change, not a quick fix - scope carefully before
  dispatching a lane.

  **Investigated hands-on (not from docs alone):** SoundCloud's public
  oEmbed endpoint (`soundcloud.com/oembed?format=json&url=<permalink>`)
  works with no API key for both tracks and playlists, verified live
  against the real "Breathe Love Deep" set and one of its tracks - it
  returns an `<iframe>` pointing at `w.soundcloud.com/player/`. The
  companion Widget JS API (`w.soundcloud.com/player/api.js`, `SC.Widget`)
  is real and public - confirmed with real audio playback, position
  advancing in real time and duration matching the actual track. No
  stream-URL-extraction/`client_id` scraping was attempted (ToS-risk
  parallel to the Spotify Client Credentials dead-end and the
  already-rejected YouTube innertube approach) - went straight for the
  officially-documented widget-embed path, same spirit as this app's
  existing YouTube iframe approach.

  **Approach:** a SoundCloud track's numeric id becomes its `videoId`
  field with an `sc:` prefix (`isSoundCloudVideoId`/`soundCloudVideoId`)
  so every existing "is this playable" check keeps working unchanged. The
  two-deck crossfade/preload player (`createDeckPlayer`/`loadIntoDeck`)
  now builds either a `YT.Player` or a new `SC.Widget`-backed adapter
  (`makeSCPlayerAdapter`/`createSCDeckPlayer`) per deck depending on
  source, exposing the same method surface, so crossfade, queue,
  media-session metadata, and transport controls keep working for both
  kinds without touching non-SoundCloud sources.

  **Trade-offs for SoundCloud tracks specifically:** lyrics fetch and the
  Discover "YouTube mix" seed fallback are skipped (would just fail
  against a non-YouTube id); the "report a bad match" button is hidden
  (no YouTube match to report anymore); no pre-roll-ad mute-and-wait
  (SoundCloud's embed has no such pre-roll). **Real, honest limitation
  worth your attention:** SoundCloud's widget has no equivalent to
  YouTube's "start muted (always allowed), unmute after" trick - a brand
  new SoundCloud iframe's very first autoplay attempt (including one
  auto-promoted from the preloaded standby deck on a natural
  end-of-track advance, with no fresh click) can get silently blocked by
  browser autoplay policy. Verified directly. The play/pause icon always
  reflects the true state accurately (never a silent false-"playing"),
  and a single tap reliably starts/resumes it, but this is a real rough
  edge - agent recommends re-checking it against the deployed worker
  (production latency) rather than trusting only the slow local
  `wrangler dev` result before calling this fully solved.

  **Two real bugs found and fixed while building this** (would have
  shipped broken otherwise): (1) a stale/orphaned deck-player callback
  (e.g. `prewarmResumeDeck()` racing a fresh import) could fire late
  against a deck since repurposed for a different track/kind, corrupting
  it - fixed with a per-deck generation counter (`deck.gen`) every YT and
  SC callback now checks, which also hardens the pre-existing YT-only
  path against the same race class; (2) re-fetching a SC widget's
  duration immediately after `.load()` could return the *previous*
  track's duration - now also refreshed on the `PLAY` event.

  **Verified:** worker's `/soundcloud` endpoint live via
  `wrangler dev --local` against real SoundCloud network egress
  (confirmed real `scId` per track, matching oEmbed). Full app served
  locally, driven in a real browser against that worker: resolved the
  real "Breathe Love Deep" album, played multiple tracks end-to-end with
  real audio (confirmed via the widget's own position/duration, not just
  UI), confirmed natural end-of-track auto-advance and manual next/prev
  across tracks with correct title/artist/art/duration each time.
  **Not verified:** the deployed production worker (not deployed yet -
  needs `wrangler deploy` after merge) or any browser besides the
  sandbox's Chromium - **recommend a real-device check of the
  first-autoplay-block edge case specifically** before treating this as
  fully closed. Commit `9efc88b`. Also added a "SoundCloud native
  playback" section to `README.md` documenting the approach.

### tutorial-text-overflow-button-animation: Tutorial text overflows screen and hides shuffle/loop buttons; needs press animation
- **Status:** merged
- **Priority:** medium
- **Description:** During the onboarding tutorial, some caption text
  stretches off screen and becomes unreadable, and the shuffle/loop
  caption text boxes visually cover the actual shuffle/loop buttons
  underneath. Add an animation showing those buttons actually being
  pressed so it's clear what's being demonstrated.
- **Touches:** onboarding/tutorial flow (`runIntro()`), caption
  positioning/sizing for the shuffle/loop beat.
- **Branch:** `agent/tutorial-text-overflow-button-animation`
- **Notes:** Synced from Geethub issue #129.

  **Root cause:** `placeCaptionNear()` (the function `setCaption()` uses to
  anchor `#onbCaption` next to whatever beat it's narrating, ~line 8213)
  places the caption below its target by default (`top = r.bottom + gap`),
  but flips to placing it *above* the target whenever the default spot
  would run off the bottom of the viewport
  (`else if (top + 70 > vh - 16)`). `#onbCaption` is positioned by its
  *top* edge (`transform:translate(-50%,0)` in the CSS, ~line 1218) and
  grows downward from there, so an "above" placement has to subtract the
  pill's own rendered height to actually clear the target - the
  `forceAbove` branch right next to it already did this (`r.top - gap -
  40`), but the auto-flip `else if` branch didn't: it just used `r.top -
  gap`, which puts the caption's top edge barely above the target's top
  edge and lets the ~48px-tall pill hang straight down over it. The
  shuffle/repeat buttons sit in `.controls-row` at the bottom of the
  transport row, which is exactly the part of the player view most likely
  to trip this auto-flip on shorter viewports - hence the caption boxes
  for "Shuffle it" / "Loop it" specifically (not any of the beats whose
  targets stay clear of the bottom edge) reliably covering the very
  buttons they were narrating. A byte-identical copy of the same bug
  existed in `capPlaceNear()` (~line 9034), the mirror of this function
  used by the `?introBeat=<name>` debug-capture hook.

  Text overflowing the viewport at narrow widths was **not** a second,
  separate bug - `fitOnbCaptionLine()` (~line 7968) already steps the
  caption's font-size down until its unwrapped width fits a
  viewport-relative budget, and `placeCaptionNear()`'s horizontal clamp
  (`halfCap`/`cx`) already keeps the pill's center far enough from either
  edge. Testing at 320px/375px/390px/desktop widths across every beat
  found no horizontal overflow before or after this change - the
  ticket's "stretches off screen" symptom was the vertical
  covering-the-button bug described above, which reads as "overflow"
  when the pill's edge hangs past the button it's supposed to leave
  clear.

  **Fix (this branch):** in both `placeCaptionNear()` and its
  `capPlaceNear()` mirror, measure the caption pill's actual rendered
  height (`captionEl.getBoundingClientRect().height`, falling back to 49
  if unavailable) right after the beat's text/font-size are set, and
  subtract that from `r.top - gap` in the auto-flip branch, matching what
  `forceAbove` already did (also switched `forceAbove`'s own hardcoded
  `- 40` to the same measured `capH`, so both paths agree and the
  fix isn't just special-cased to shuffle/repeat - any beat whose target
  sits near the bottom edge on a short viewport benefits the same way).
  This repositions the caption, not the button, per the ask - the
  shuffle/repeat buttons themselves are untouched.

  **Press animation:** already implemented and untouched by this fix -
  `tap(shuffleBtn, true)` / `tap(repeatBtn, true)` (repeat gets three
  taps, one per off/all/one state change) trigger the existing
  `.onb-tap` squash-overshoot keyframe plus the `.onb-tap-ring` accent
  ring pulse, the same "just tapped" treatment already used on the Load
  button, art-style options, viz/lyrics tabs, and the like heart. The
  ticket read as if this were missing, but it was just invisible in
  practice: whenever the covering bug above put the opaque caption pill
  (`z-index:10004`, above everything else in the intro) directly over
  the button, the tap/ring animation played *underneath* it and was
  never seen. Confirmed the animation itself is real and legible by
  temporarily slowing its CSS duration to 4s in a live devtools session
  and screenshotting mid-animation (see Verified below) - no code change
  was needed here beyond unblocking the view of it.

  **Verified:** `node --check` on the extracted inline `<script>` passes
  (see the pattern used by other merged lanes above). Ran the app live
  in the Browser pane against a plain `python3 -m http.server` pointed at
  *this worktree* (the project's own `.claude/launch.json` "ebbless"
  config was, for the current multi-session setup, actually serving the
  main checkout's `index.html` at cwd `/Users/malcolm/Documents/CLAUDE-
  CODE/EBBLESS` rather than this worktree - confirmed via `lsof`'s `cwd`
  on the listening process - so verification used a second, throwaway
  server rooted in this worktree instead; nothing about the main checkout
  was touched). Used the existing `?introBeat=shuffle` / `?introBeat=
  repeat` debug-capture hooks to get clean, static screenshots of both
  beats at 320px, 375x400 (short/narrow - the height that actually
  reproduces the original bug, confirmed both before-fix, where the
  caption's measured rect overlapped the button's rect, and after-fix,
  where it no longer does), 375x812 (normal phone), and desktop widths -
  caption sits below the button with a clean gap at normal heights and
  correctly flips above with a matching gap at the short height, on both
  shuffle and repeat, with no horizontal overflow at any width. Also
  screenshotted several other beats (`power-mobile`, `library-panel`,
  `bug`, `viz`, `discovery`) at 320-375px to confirm the shared-function
  fix didn't regress their positioning. Ran the real `?intro` sequence
  live end to end to confirm timing/order of beats through the shuffle/
  repeat/discovery/settings beats is unaffected. Confirmed the tap/ring
  press animation itself renders correctly (ring pulse + icon
  squash-overshoot) via a temporary slowed-duration override in a live
  session, screenshotted mid-pulse. **Not independently re-verified:**
  the `preview` (`runIntro(true)`) parameter's behavior beyond what
  `?intro` already exercises (the two paths use the same code); this is
  no different from the untouched-by-this-fix behavior already covered
  by the code's own comments and doesn't touch anything this change
  modified.

  **Round 2 (live user testing feedback):** after the fix above shipped,
  the user tested it live and asked for three refinements to the same
  positioning code: (1) the accent "tab" (the `::before` bar) should stay
  pointed at the actual target even when the bubble's own position gets
  clamped for on-screen safety, not just drift wherever the bubble's
  center lands; (2) full off-screen clamping - vertical as well as
  horizontal, and based on the bubble's real rendered size rather than an
  assumed budget; (3) stop force-shrinking long captions onto one line -
  let them wrap across a couple of lines at a readable font size instead.

  **Change 1 - decoupled the tab from the bubble's center.** Extracted a
  new shared top-level function, `positionOnbBubble(bubbleEl, r, vw, vh,
  mode, forceAbove, gapOverride)` (defined next to `fitOnbCaptionLine()`,
  ~line 7968), used by all three caption-bubble positioners:
  `placeCaptionNear()` (~8213, mode `'below'`), its `?introBeat=` mirror
  `capPlaceNear()` (~9091, same mode), and `placeMainCaptionNear()`
  (~8356, mode `'above'` - the persistent "Paste a playlist..." label,
  which turned out to have the exact same issues and wasn't previously
  clamped for on-screen safety at all). Having all three go through one
  function was itself a fix: the live/capture pair had already drifted
  out of sync once during round 1 and needed the same bugfix applied
  twice by hand.

  The bubble's own horizontal position (`cx`) is still clamped to stay on
  screen, but the accent tab is now positioned independently via a new
  `--tab-shift` CSS custom property (`left:calc(50% + var(--tab-shift,
  0px))` on `#onbCaption span::before` / `#onbCaptionMain span::before`,
  ~line 1218/1255) - a real speech-bubble-tail technique. `tabShift` is
  computed as `targetCenterX - cx`, clamped to stay inset 18px from the
  bubble's own rounded edges so it never points off the bubble itself
  when the target's center falls entirely outside the bubble's width
  (e.g. shuffle at a 200px-wide viewport, where the button sits far
  enough left that the bubble can't be centered on it and stay on
  screen).

  **Change 2 - full, size-aware off-screen clamping.** `positionOnbBubble`
  now measures the bubble's actual rendered `getBoundingClientRect()`
  (both width and height, both now legitimately variable since captions
  can wrap - see Change 3) instead of relying on the old fixed
  `halfCap`/`70`-px assumptions. Horizontal clamp uses the real width
  (falls back to centering dead-center only if the bubble is wider than
  the viewport has room for). The below/above flip threshold now compares
  against the real measured height instead of a flat `70`. After
  choosing above vs. below, a final safety clamp forces `top` into
  `[8, vh - capH - 8]` regardless of which branch picked it - this is
  the part that actually satisfies "doesn't go off screen either": a
  target hard against the top edge (with `forceAbove`, or `#onbCaptionMain`
  which always sits above), or a tall multi-line bubble near the bottom
  edge, both used to be able to clip past the viewport before this.

  **Change 3 - captions wrap instead of shrinking.** Removed
  `white-space:nowrap` from `#onbCaption span` and `#onbCaptionMain span`
  (~line 1221/1254). Rewrote `fitOnbCaptionLine()` (~line 7968): it used
  to measure the text's natural unwrapped `scrollWidth` and shrink
  `font-size` in a loop (down to as low as 11px) until it fit on one
  line, then lock `max-width` to that exact content width. It now just
  sets `max-width` to a sensible viewport-relative budget (`min(vw*0.86,
  300)`, or `min(vw*0.92, 560)` for the plain-style "Flow with the go"
  outro beat, matching its own CSS max-width) and leaves the font-size at
  the CSS's own readable `clamp(14.5px,3vw,17px)` - wrapping is now the
  CSS's job. The longest real captions in the flow ("Spotify, YouTube,
  SoundCloud, or Apple Music", "Paste a link to a playlist, album, or
  song") now wrap to 2 lines at full readable size instead of shrinking
  to fit one line.

  **A fourth bug found while verifying Change 1+2 together:**
  `#onbCaption`/`#onbCaptionMain` are `position:fixed` with only `left`
  set (no `right`) and `width:auto`. That combination shrink-to-fits
  against the *remaining distance from `left` to the viewport's right
  edge*, not against the element's own content - round 1's more generous
  centering (and this round's real-width-based clamp) let `left` land
  close enough to the right edge, for some targets, that the box would
  narrow itself and force-wrap short text mid-word (observed: "Loop it"
  rendering as "Loop" / "it" on two lines at 340px width, purely because
  `left` happened to be far enough right that the browser computed a
  ~65px "available width" for the box, even though the max-width budget
  allowed ~290px). This was latent before round 1 too, just masked by the
  old, much more conservative `halfCap` margin that never let `left` get
  that close to the edge. Fixed by adding `width:max-content` to both
  `#onbCaption` and `#onbCaptionMain`'s base rules (~line 1218/1263),
  which sizes the box to its actual (possibly max-width-wrapped) content
  regardless of where `left` lands - confirmed "Loop it" renders as one
  line again afterward at the same 340px width that triggered it.

  **Verified (round 2):** `node --check` on the extracted inline
  `<script>` passes. Re-ran the same worktree-rooted throwaway
  `python3 -m http.server` approach from round 1 (main checkout still
  untouched). Confirmed via `getBoundingClientRect()` + screenshots at
  200px, 320px, 340px, 375px, and desktop widths: the tab visually and
  numerically points at the target's true center (`tabAbsoluteX` matches
  `targetCenterX` to sub-pixel precision) both when unclamped (tabShift
  0) and when clamped (e.g. shuffle at 200px: bubble center 63.4 vs.
  target 30.4, tab correctly offset to `-33px` landing on 30.4; the
  "Spotify, YouTube..." caption at 375px: bubble clamped to center 158,
  target (urlInput) center 138.7, tab offset to `-19.3px` landing on
  138.7); no bubble edge (top/left/right/bottom) exceeds its viewport in
  any of these cases, including the `library-panel` beat's "Your
  playlist lives here" caption which used to sit flush against y=0 at
  320px and now clamps to `top:8`; both long real captions wrap to 2
  lines at full readable font size at both a 375px phone width and
  desktop width, confirmed via screenshot and `getBoundingClientRect()`
  height (67px = 2 lines vs. the single-line 47.5px). Ran the live
  `?intro` sequence end to end at 375px and desktop widths with no
  console errors beyond unrelated Google Identity/FedCM network noise
  (no network access to Google's services in this sandbox, unrelated to
  this change). Spot-checked `flow`, `style-record`, and `bug`
  `?introBeat=` captures for regressions from the shared-function
  refactor - none found; the `style-record` beat's caption lightly
  overlapping the track-title text below it is pre-existing (unrelated
  to shuffle/loop, not touched by either round of this fix).

  **Round 3 (two more small asks):**

  **1. Sentence case.** `'swipe the artwork to skip tracks'` was the only
  caption in the whole sequence starting lowercase - every other caption
  (`'Tap Load'`, `'Shuffle it'`, `'Loop it'`, etc.) is capitalized.
  Capitalized both occurrences: the real beat (`await beat(...)`,
  index.html:8768) and its `?introBeat=power-mobile` debug-capture mirror
  (`capCaptionText(...)`, index.html:9318). Trivial text-only change, no
  logic touched.

  **2. Make the flat black EBBLESS screen show first for a first-time
  visitor.** Investigated live rather than trusting the read-through
  alone, per the ask. Confirmed there really are two different "black
  screen with the logo" things: `#splash` (a video-backed, tinted no-FOUC
  cover that fades from black into the cymatics video) and
  `#onbBackdrop`/`#onbMark` (a flat, opaque `background:var(--bg))`
  backdrop with the breathing EBBLESS mark - the thing `sequence()`'s own
  opening beat uses, and the thing the ask actually means by "the black
  screen").

  **What a first-time visitor actually saw, confirmed via
  `getBoundingClientRect()`/class-state checks and screenshots taken as
  close to page-load as this environment allows (as low as ~250ms after
  `navigate`, well before any interaction):** `showSplashChoice()`
  (called for anyone without `ebbless_onboarding_complete` set) hid
  `#onbBackdrop`/`#onbMark` and activated `#splash`'s choice screen
  *synchronously*, in the same tick that ran on page load - before the
  browser's first real paint. So although `#onbBackdrop`/`#onbMark` are
  static markup, opaque, and already breathing from the raw HTML/CSS
  before any JS runs, a first-time visitor **never actually saw them at
  all** - the very first frame ever painted was already the video-tinted
  splash with the Tutorial/Enter buttons fully up. The flat black mark
  only ever appeared *after* tapping "Tutorial" (confirmed
  `sequence()`'s own first beat already holds on it correctly for
  1800ms, per index.html:8579's `await wait(1800)` before beat 1) - never
  before the choice was offered.

  Separately, confirmed the tap-into-Tutorial transition itself
  (`showSplashChoice()`'s `playBtn` click handler) is a single synchronous
  function call - display restores and `runIntro(false)` both run in the
  same tick, so no intermediate frame of the splash video or real app UI
  can be painted in between; verified this cleanly in a live trial (click
  → screenshot → flat black mark, no glitch) once the click was fired
  within a normal few-second window of page load. One earlier trial *did*
  show a garbled frame (real app UI with a corrupted-looking background)
  a few seconds after clicking - traced this to this environment's own
  multi-second-to-tens-of-seconds gaps between tool calls occasionally
  letting the pre-existing 12-second `#splash` hard safety net
  (index.html:2080, added as a last-resort backstop for a stalled
  backend/error, comment at index.html:2067) fire while the choice was
  still legitimately pending - not a real user-facing bug, since a human
  taps within a second or two, well inside that window, and it isn't
  something this task touched. Flagging it in case it's worth hardening
  later (e.g. exempting a live pending choice from that timer), but out
  of scope here.

  **Fix:** `showSplashChoice()` (index.html:9000) used to hide
  `#onbBackdrop`/`#onbMark` and activate `#splash`'s choice screen in the
  same synchronous call. Split that: `#onbSkip`/`#onbCapture` (a
  functionless Skip button and an invisible tap-catcher - neither part of
  the actual "black screen" beat) still hide immediately, but hiding
  `#onbBackdrop`/`#onbMark` and adding `is-active`/`is-choice` to
  `#splash` now happens after a new `BRAND_BEAT_MS = 1300` timeout. Since
  `#onbBackdrop`/`#onbMark` are already visible from the static markup
  and nothing hides them for that first 1300ms, the flat black
  EBBLESS-mark beat is now genuinely the first thing painted - then it
  hands off to `#splash`'s own black `.splash-black` layer (already
  black, so the handoff itself is seamless) before that fades into the
  video as `splash-reveal` already did. Chose 1300ms as a shorter echo of
  `sequence()`'s own 1800ms opening-mark beat - registers as a brand
  moment without feeling like an added wait before the real choice.
  Scoped only to the first-time-visitor path: a returning visitor
  (`onboardingComplete === true`) never calls `showSplashChoice()` at all
  (goes straight through `discardIntroChrome(); startApp();`, per
  index.html:9341) and is completely unaffected - the existing no-FOUC
  guarantee for them is untouched.

  **Verified:** `node --check` on the extracted inline `<script>` passes.
  Live in the Browser pane, worktree-rooted throwaway server again (main
  checkout untouched): (a) first-time visitor (`localStorage.clear()` +
  fresh tab + reload) now shows the flat black EBBLESS mark alone at
  ~244ms post-navigate, `#splash` with no `is-active`/`is-choice` class
  yet; (b) ~1300ms later `#splash` cleanly activates with the Tutorial/
  Enter choice, no visible seam; (c) tapping "Tutorial" (within a normal
  few-second window) transitions cleanly into the flat black
  mark-breathing tutorial-opening beat, confirmed via screenshot and
  `document.body.classList` gaining `onb-active`; (d) tapping "Enter"
  still sets `ebbless_onboarding_complete` and lands correctly in the
  real app; (e) reloading afterward (returning-visitor path) goes
  straight to the app at ~378ms with `#splash` already `is-hidden` and no
  black-screen delay, confirming that path is untouched.

### currents-cover-video-missing: "CuRRentSSsss" playlist cover video is no longer appearing
- **Status:** merged
- **Priority:** medium
- **Description:** The video used as the cover for the "CuRRentSSsss" /
  Currents playlist is no longer showing up.
- **Touches:** Currents playlist cover rendering - likely related to
  `rename-current-playlist` / `currentsss-casing-followup` (both merged).
- **Branch:** `agent/currents-cover-video-missing`
- **Notes:** Synced from Geethub issue #128.

  **The rename/casing hypothesis didn't pan out:** checked both suspect
  commits (`d6dbb39` rename to `CURRENTSSsss`, `3ecabc6` casing fix to
  `CuRRentSSsss`) diff-by-diff, and every literal occurrence of the
  playlist's display name (marquee, card title, migration string, seed/
  generate fallback) was updated together and stays internally consistent
  today - `grep -oE "Cu[Rr]+ent[Ss]+sss|CURRENT[Ss]*|Current"` across
  `index.html` turns up no stray old-casing string. More importantly, the
  video-face branch itself (`renderLibrary()`, `id === SWELL_ID`) has never
  compared against the playlist's *name* at all, only its stable `SWELL_ID`
  (`'swell'`), so a display-text rename can't touch it either way.

  **Actual root cause: the teaser `<video>` can lose its one shot at
  autoplay.** Two compounding issues in `renderLibrary()`'s video-face
  branch (built for Swell/Currents whenever it has no tracks/image yet -
  `brand/assets/swell-thumb.mp4`):
  1. The `<video autoplay muted loop playsinline>` element is created via
     `artDiv.innerHTML = '...'` rather than being present in the initial
     parse. Some engines (Safari in particular) don't reliably promote the
     `muted` *content* attribute to the `muted` *IDL* property for markup
     inserted this way, and autoplay is gated on that property actually
     being `true`.
  2. `startApp()` calls `renderLibrary()` *before* the first `setView()` -
     so the very first time this card (and its video) gets built, it can
     do so while `#view-library` is still hidden (e.g. a returning listener
     who resumes into `player` view, per Geethub #128's report). Chromium
     tolerates this in testing, but several engines only grant an
     autoplaying video its one autoplay attempt at insertion time and never
     retry once the element becomes visible later - so a card built while
     hidden can end up permanently stuck paused on frame 0 with no visible
     video at all.
  - **Fix:** in `renderLibrary()`, after inserting the video-face markup,
    explicitly set `swellVideo.muted = true` and call
    `swellVideo.play().catch(() => {})` instead of relying on the HTML
    attributes alone. In `setView()`, re-kick the same Swell video
    (`muted = true` + `play().catch()`) whenever navigating *into* the
    library view and it's currently paused, so a card that missed its
    first autoplay grant while hidden gets a second, guaranteed attempt
    once it's actually on screen.
  - **Verified:** served this worktree via
    `python3 -m http.server 8793` and drove it in a real (Chromium)
    browser. Reproduced the exact failure mode described in the issue by
    seeding `localStorage` with a resumable non-Swell track (so `startApp`
    calls `setView('player')`, hiding `#view-library`) alongside a fresh,
    trackless Swell/Currents entry; confirmed via
    `video.paused`/`video.currentTime` polling that this is the scenario
    most likely to leave the teaser clip stuck. Reloaded with the fix in
    place under the same seeded state and confirmed both programmatically
    (`paused: false`, `currentTime` advancing/looping across repeated
    checks) and visually (screenshot showing the actual swell-thumb.mp4
    frames, not a black tile) that the cover video now plays reliably on
    first load into a hidden library view, on switching into the Library
    tab, and after 20 rapid back-to-back `renderLibrary()` re-renders (pin/
    unpin-style churn) with no console errors introduced.

### discover-toggle-required: Discover has to be deactivated and reactivated before it works
- **Status:** merged
- **Priority:** medium
- **Description:** The Discover feature doesn't work on its own - the user
  has to turn it off and back on again before it actually functions.
- **Touches:** Discover feature toggle/init logic.
- **Branch:** `agent/discover-toggle-required`
- **Notes:** Synced from Geethub issue #127.

  First ruled out the obvious suspects: `isDiscoverOn()` (~line 4234)
  defaults a never-toggled origin to `true`, the toggle button's markup/
  `renderDiscoverToggle()` correctly show it on from the very first render,
  and the click handler correctly flips state on the first press - confirmed
  live (see verification below) that a completely fresh session, with the
  toggle never touched, successfully fetches and appends Discover tracks the
  first time the queue nears its end. So the toggle/default-value logic
  itself wasn't the defect.

  The real bug was in `extendQueueWithDiscover()` (~line 5234): it guarded
  re-entrancy with a plain boolean (`discoverExtending`), so a second call
  for the same origin while one was already in flight returned instantly
  with no result instead of waiting. Two call sites can legitimately land on
  the same origin close together - the proactive lookahead
  (`maybeExtendDiscoverQueue()`, fired from `loadIndex()` once
  `DISCOVER_LOOKAHEAD` tracks remain) and the "actually hit the end of the
  queue" fallback in `playNext()` (`extendQueueWithDiscover(originPlId).then(
  finishQueueAtEnd)`). When the fallback's call landed while the lookahead's
  fetch was still resolving, the boolean guard made it resolve as a silent
  no-op, so `finishQueueAtEnd()` read `state.queue.length` before the
  original fetch had appended anything, concluded Discover had nothing more
  to offer, and stopped playback via `setPlayingUI(false)` - even though the
  in-flight fetch was seconds from landing and would have appended tracks in
  the background moments later. A listener who then toggled Discover off and
  back on wasn't fixing the toggle itself (it was never off); by the time
  they noticed playback had stopped and re-engaged with the queue, the
  stranded fetch had usually already finished appending tracks silently, so
  the *next* play/skip picked them up and looked like the toggle had fixed
  it.

  Fix: replaced the boolean flag with a shared in-flight promise
  (`discoverExtendPromise`). A second caller for the same origin now gets
  back the *same* promise instead of an instant no-op, so every caller's
  `.then()` (including `playNext()`'s `finishQueueAtEnd`) only runs after
  the real fetch has actually resolved and appended whatever it found -
  no more stale-length reads.

  Verified with a real browser (`python3 -m http.server` from inside this
  worktree, driven live rather than just reasoned about) against the
  project's standard test playlist
  (`https://open.spotify.com/playlist/5qMMDwZ1Wo8q0lpDOmsXnZ`):
  - On a completely fresh profile (cleared `localStorage`, Discover never
    toggled), forced the queue to a near-end position with a seed track
    known to have Last.fm/YouTube-mix data (`Videotape` by Radiohead) and
    confirmed `maybeExtendDiscoverQueue()` fetched and appended real
    candidates end to end with zero prior toggle interaction (queue grew
    32 -> 38 tracks).
  - Reproduced the race directly: fired `extendQueueWithDiscover()` twice
    back-to-back for the same origin while the first call was still
    in-flight. Before the fix this would need re-deriving from a boolean
    (not testable as a promise); after the fix, confirmed both calls
    return `===` the same promise, and the second caller's `.then()` sees
    the fully-updated `state.queue.length` (38, not the stale 32) once the
    fetch resolves - the exact condition that used to make `finishQueueAtEnd`
    stop playback prematurely.
  - Manually toggled Discover off and back on via the Queue panel UI and
    confirmed the button still renders and responds correctly (unaffected
    by this change, since the toggle-state code itself wasn't touched).

  Caveat: this fixes the race between the two extension call sites: it
  doesn't change the pre-existing, expected "best-effort" behavior where
  Discover legitimately finds nothing for an obscure seed track with no
  Last.fm/YouTube-mix data (acknowledged in the code's own comments as a
  known limitation, not a bug).

### queue-drag-reorder-glitch-regression: Dragging a queue track up glitches again
- **Status:** merged
- **Priority:** medium
- **Description:** Dragging a track up in the queue glitches out again -
  same symptom as the already-merged `queue-drag-reorder-glitch` entry
  above.
- **Touches:** queue panel drag-to-reorder (`wireQueueRowGestures()`).
- **Branch:** `agent/queue-drag-reorder-glitch-regression`
- **Notes:** Synced from Geethub issue #126.

  **Not actually a regression of the same root cause** - the original
  fix (`a941d39`, merged `4025f59`) is fully intact; `git log -L`/`-G`
  on `wireQueueRowGestures()` (~line 5365) confirms nothing has touched
  it since. `queue-panel-remove-playlist-section` and `queue-footer-overlap`
  (both merged, both predate the original fix chronologically) touched
  unrelated code - a now-deleted `.track-row` drag handler and a `#queueBody`
  CSS padding tweak - neither disturbed this function.

  **Actual root cause:** the original fix computed `rowH = row.offsetHeight`
  to compensate for the pixel jump each `queueBody.insertBefore(...)` swap
  introduces, but `.q-row + .q-row{margin-top:2px}` (present since the
  file's first commit) means the real row-to-row pitch is
  `offsetHeight + 2px`, not just `offsetHeight` - every swap left a 2px
  uncompensated residual. This existed even during the original fix's own
  verification; it was just too small to notice over the ~4-6 row drags
  tested then. Over a longer real drag the 2px/swap residual compounds
  into the same "loses grip / drifts" symptom, from a smaller cause.

  **Fix** (commit `5ff33f1`): in `wireQueueRowGestures()`'s pointerdown
  handler, instead of `rowH = row.offsetHeight`, measure the real
  row-to-row pitch directly off a neighboring `.q-row`'s
  `getBoundingClientRect().top` diff at drag start - naturally includes
  margin (and any future spacing change) instead of just the content box.
  12 lines changed, nothing else touched.

  **Verified:** served this worktree's own `index.html` via
  `python3 -m http.server` from inside the worktree (confirmed via
  `location.href`, not the shared preview launcher), loaded the standard
  EBBLESS test playlist (31-track queue), and drove the queue drag handle
  with real synthetic `PointerEvent` sequences (`pointerdown` -> many
  incremental `pointermove` steps -> `pointerup`). A 5-up/5-down drag held
  a constant -27px pointer-to-row offset across all 30 steps in both
  directions (vs. drifting -27 to -37 before the fix) and returned the row
  to its exact original slot; a 16-position, 90-step drag produced the
  exact expected final DOM order with no leftover inline
  `transform`/`position` after drop. Screenshot confirms a clean
  post-drag render. Console showed only pre-existing sandbox noise
  (YouTube/Google-signin network errors) plus `setPointerCapture
  NotFoundError`s that are an artifact of the synthetic fake pointerId
  used for testing, not a real app bug.

  **Caveats:** verification used synthetic `PointerEvent`s rather than the
  browser tool's native drag emulation (which can't do multi-step paths) -
  real trackpad/touch jitter wasn't exercised, though the fix is a static
  per-drag measurement taken once at `pointerdown`, so it shouldn't be
  sensitive to event cadence. Did not re-audit every other `.q-row`-spacing
  consumer for the same `offsetHeight`-without-margin assumption - scoped
  to just the one spot that needed it.

### cassette-fullscreen-animation: Cassette fullscreen should stack and orbit background cassettes
- **Status:** merged
- **Priority:** medium
- **Description:** On the cassette art style's fullscreen view: on mobile,
  additional cassettes should stack behind/above the main cassette one
  after another until they reach the top of the screen, then all
  disappear back to one; their outer plastic housing should match the
  album art's color scheme, getting darker toward the final cassette. On
  desktop, the same stacking animation should play first, then the
  stacked cassettes should spread into a circle around the central
  cassette (rotated bottom-toward-center), spin slowly, and one by one
  lift up slightly and slide behind the main cassette out of sight as
  each reaches the top.
- **Touches:** cassette fullscreen visual (`fullscreen-lp-cassette-visual`
  area), cassette CSS/animation.
- **Branch:** agent/cassette-fullscreen-animation
- **Notes:** Synced from Geethub issue #125. A substantial new animation
  build, not a bug fix - scope carefully before dispatching a lane.

  Built on `agent/cassette-fullscreen-animation` as one self-contained
  block in `index.html` (`csStackSync` and friends, right after
  `closeFlow()`), plus a hidden `#csGhostSym` SVG symbol next to
  `#artCassette` and a few `.cs-stack*`/`.cs-ghost` CSS rules after the
  flow-mode cassette rules. The copies are lightweight `<use>` clones of
  that one silhouette (no live reels), housing tinted with
  `color-mix(var(--player-accent) 60% -> 26%, near-black)` so each copy
  toward the back is darker. They live inside the fullscreen host
  (`#flowArtWrap` in flow mode, or the split-desktop desktop-fs
  `.artwork-wrap`) just before the real cassette, so all fullscreen
  chrome and controls still paint over them, and the mobile chrome slide
  carries them along. A dark plate under the real (translucent) shell
  fades in with the copies so they never tint the main cassette and so
  copies that slide behind it are truly out of sight. Path choice matches
  `fsBtn`: `body.split-desktop` (>=1150px) gets the desktop sequence,
  narrower gets mobile. Mobile: copies rise one every 0.7s (1.3s ease-out
  each) until the last one's top meets the top of the screen (3-10 copies,
  sized from the measured gap), hold 2.4s, collapse back into the main
  cassette over 1.6s, rest 9s, loop (~16-21s cycle). Desktop: the same
  stack (min 6 copies), then gather behind the main cassette, spread over
  2.6s into an ellipse sized to the viewport (copies at 42% scale, rotated
  bottom-toward-center, a little fainter toward the bottom under the
  transport), turn at 10deg/s with a 2s ease-in, and as each copy reaches
  the top it lifts ~10% of the cassette height and slides behind the main
  one (0.8s + 1.8s); rest 9s after the last, loop (~57s at 1280x800). One
  rAF, transform/opacity only. It stops and removes everything on flow
  close, desktop-fs close, style change away from cassette, visual mode
  change away from art, settings view, tab hidden, and restarts cleanly on
  resize; prefers-reduced-motion shows nothing extra.

  Verified against this worktree served with `python3 -m http.server`,
  playlist loaded, Cassette Tape style. The preview pane reported
  `document.visibilityState === 'hidden'` for the real page, so (as
  designed) nothing ran there; the animation itself was checked in a
  throwaway copy that forced visibility to 'visible' and exposed the
  controller (deleted, not committed). At 375x812 flow mode: 10 copies,
  last top edge at ~0px, rise/hold/collapse/rest observed live with rAF
  running. At 1280x800 desktop-fs: 6 copies, stack reached the top, ring
  formed with bottoms toward center, copies exited one by one at the top
  and the cycle looped. Teardown checked: closing flow and desktop-fs,
  switching to Record/Default (in and out of flow, record still moves into
  `#flowArtWrap` as before), and switching to lyrics all leave zero
  `.cs-stack`/`.cs-ghost`/`.cs-stack-host` nodes and no rAF; the cassette
  returns to `#artworkWrap`. No console errors from `index.html`. Not
  verified: real iOS/Android devices, reduced-motion mode, and
  `flowPartsStart` (not present on this branch's base).

  Owner feedback round (same branch): (1) Pause behavior - the stack now
  follows the cassette's own play state (`cassetteSetPlaying` calls
  `csStackSetPlaying`, no second source of truth). On pause every copy
  retreats behind the main cassette in 0.5s (ease-in-out, from wherever
  it is: stack, ring or mid-exit), then the loop goes idle with zero
  opacity and no rAF. Opening fullscreen while paused starts idle. On
  resume the cycle restarts from its beginning after a 0.8s rest. A pause
  gets a 150ms grace normally and 2.5s within 5s of a track start
  (`lastTrackStartTs`), so a track change's momentary not-playing report
  doesn't trigger the retreat. (2) Graduated shades by stack order: the
  first copy is the lightest, most opaque tint (74% album tone over a
  mid-grey, opacity 0.96), each later copy darker and more see-through,
  down to the last at 24% over near-black and opacity 0.30. The desktop
  ring uses the same per-copy values. Owner confirmed the ring passing
  under the transport and the simple shells are fine. The dark plate
  under the main shell now stays solid while any copy is visible, so
  faint copies sliding behind it still vanish.

  Verified in a throwaway visibility-forced copy (deleted) in its own
  browser tab, driving frames by hand: at 375x812 the 10-copy stack
  showed the light/opaque to dark/transparent gradient with the last copy
  faintly visible (computed colors checked); a pause mid-stack retreated
  to all-zero opacity, plate 0, loop idle at 0.5s; a play/pause blip
  inside the grace window did not retreat or restart; resume reset
  the cycle with a 0.8s rest. At 1280x800 desktop fullscreen the ring
  showed the same gradient and a pause mid-ring retreated and went idle;
  closing fullscreen removed every node. No new console errors.

### fullscreen-lp-too-small: Fullscreen LP is too small again on mobile and desktop
- **Status:** merged
- **Priority:** medium
- **Description:** The fullscreen LP (spinning record) view is too small
  again. On mobile it should reach the side edges; on desktop it should
  reach the top and bottom edges.
- **Touches:** LP/record fullscreen visual sizing - likely the same area
  `record-cassette-size` and `fullscreen-lp-cassette-visual` (both
  merged) touched.
- **Branch:** `agent/fullscreen-lp-too-small`
- **Notes:** Synced from Geethub issue #124.

  **Two independent causes, not one:** (1) mobile's `#flow-layer .flow-art`
  was capped at `min(86vh,86vw)` since it was enlarged (`01f26de`) - it had
  actually *never* reached the true screen edges on any device, not a new
  regression, just never quite met the "edge to edge" bar. (2) desktop
  split-view fullscreen genuinely regressed: `2802d34` ("Desktop split-view:
  fullscreen slides library/queue off...") replaced the old shared
  `#flow-layer` overlay with an in-pane layout stacking title/seek/controls
  *below* the art instead of overlaying them - a stacked layout can only
  grow the art until it collides with the reserved text space beneath it,
  and no reservation value lets it also reach both edges. Measured actual
  content height needed (~250px): even with a perfectly tight reservation,
  the art topped out around ~70% of pane height, never touching top or
  bottom.

  **Fix** (commit `9027960`): `#flow-layer .flow-art` changed
  `min(86vh,86vw)` -> `min(100vh,100vw)` - a square sized this way
  self-selects the tighter-constrained edge pair (sides on portrait/mobile,
  top/bottom on landscape/desktop-shaped viewports), which also fixes
  desktop fullscreen for the cymatics visualizer since it shares
  `#flow-layer`. `body.split-desktop.desktop-fs .artwork-wrap` rebuilt to
  use the same overlay pattern `#flow-layer` already uses instead of the
  stacked layout: art now sizes to
  `min(100vw, calc(100dvh - var(--topbar-h)))` (true edge-to-edge), with
  `.visual-tabs`/`.track-meta`/`.transport-full` pulled out of flex flow
  and absolutely positioned on top near the top/bottom instead of pushing
  the art around.

  **Verified** (real browser, this worktree served via
  `python3 -m http.server 8791` from inside the worktree, confirmed via
  `location.href`): desktop 1440x900 with a real track loaded, clicked the
  real fullscreen button - `.artwork-wrap` measured exactly viewport height
  (`top:60, bottom:900`) for all three art styles, screenshots confirm
  edge-to-edge fill with title/seek/controls legible as an overlay.
  Desktop panel-slide toggle (library/queue drawers) still works correctly
  and exiting fullscreen restores the original in-pane layout exactly.
  Mobile 375x812: `#flowArtWrap` measured exactly viewport width
  (`left:0, right:375`) for record and cassette styles, flow-mode chrome
  still renders/functions on top. A 1000x700 "small desktop window" (below
  the 1150px split-desktop threshold, so also routes through
  `#flow-layer`) measured exactly viewport height, confirming the same fix
  covers that case too.

  **Follow-up concerns:** the desktop-fs overlay text now sits directly on
  the art near its bottom edge with no scrim/gradient backdrop, relying on
  the art's own darkness for contrast - same approach mobile flow mode
  already uses (not a new risk class, but very bright album art could hurt
  legibility; worth knowing if it comes up again). Deliberately did not
  port `#flow-layer`'s idle-hide-chrome behavior to desktop-fs, which never
  had one - left as-is rather than expanding scope.

### fullscreen-exit-button-consistency: LP, cassette, and cymatics fullscreen should share one exit-fullscreen button style/position
- **Status:** merged
- **Priority:** medium
- **Description:** The fullscreen views for the LP (spinning record),
  cassette, and cymatics album art styles should all use the exact same
  "exit fullscreen" (fullscreen:off) button - same visual style and same
  on-screen position - regardless of which art style is active. Currently
  the button appears inconsistent between the three styles.
- **Touches:** fullscreen chrome/controls shared across `#flow-layer` and
  desktop split-view fullscreen (`.artwork-wrap`), likely the same area
  touched by `fullscreen-lp-cassette-visual` and `fullscreen-lp-too-small`
  (both merged).
- **Branch:** `agent/fullscreen-exit-button-consistency`
- **Notes:** Synced from Geethub issue #133. Issue body had no further
  detail beyond the title.

  **Root cause:** `fsBtn`'s click handler (`index.html` ~7636) sends
  cymatics fullscreen through `openFlow()`/`#flow-layer` on *both* mobile
  and desktop - so cymatics always gets the shared round `.flow-exit`
  button (`#flowExitBtn`, 38x38, top-right, 26px inset). LP/cassette (and
  default) art fullscreen goes through the same `#flow-layer` path on
  mobile/tablet too, so on narrow viewports all three styles were already
  consistent. But on `split-desktop` (>=1150px), LP/cassette/default
  instead call `toggleDesktopFs()`, a structurally different mechanism
  (`body.desktop-fs` class + CSS that slides the library/queue panes off
  and expands `#view-player` in place, built in `fullscreen-lp-too-small`
  to reach edge-to-edge while keeping the topnav's Library/Queue drawer
  toggles reachable). That mode never had its own exit affordance - the
  only way out was clicking the small transport-style `fsBtn` icon again,
  which looks nothing like `.flow-exit`. So the real inconsistency was
  desktop-only: cymatics-desktop-fullscreen had the round exit button,
  LP/cassette-desktop-fullscreen did not.

  **Fix:** went with the "give desktop-fs mode its own `.flow-exit`-style
  button" option rather than routing LP/cassette through `#flow-layer` on
  desktop too - `#flow-layer` has no library/queue drawer mechanism, so
  merging the two would have dropped that feature (the whole reason
  `desktop-fs` exists as a separate overlay per `fullscreen-lp-too-small`'s
  notes). Added `#desktopFsExitBtn` (`index.html` ~1578, styled via the
  existing `.flow-exit` class, same SVG X icon as `#flowExitBtn`) as a
  direct child of `#view-player`, hidden by default and shown only via
  `body.split-desktop.desktop-fs:not(.view-settings-active) #desktopFsExitBtn`
  in the same min-width:1150px block as the other `.desktop-fs*` rules.
  Positioned `position:fixed;top:calc(var(--topbar-h) + 26px);right:26px`
  - same 26px corner inset as `#flowExitBtn` uses, offset by the topbar's
  height since (unlike `#flow-layer`, which covers the whole viewport)
  `desktop-fs` deliberately leaves the topbar visible so its Library/Queue
  toggles stay reachable. `z-index:45` sits above the fixed player (44) but
  below the slide-in library/queue drawers (46), so an open drawer covers
  it the same way it would cover anything else in that corner - confirmed
  this is a graceful, non-broken interaction, not a dead end (the topnav's
  Library/Queue button remains the way to close the drawer again). Wired
  `desktopFsExitBtn.addEventListener('click', closeDesktopFs)` next to the
  existing `toggleDesktopFs`/`closeDesktopFs` functions. Did not touch
  `fsBtn` (enter-fullscreen) itself, `#flow-layer`, or `openFlow()`/
  `closeFlow()` - cymatics-desktop and all three styles on mobile/tablet
  were already consistent and untouched.

  **Verified** (real browser, this worktree served via
  `python3 -m http.server 8793` from inside the worktree, confirmed via
  `location.href`/fetch matching this file's `desktopFsExitBtn` marker
  before trusting the page - per the multi-session warning in this repo's
  `CLAUDE.md`): at mobile width (375x812) all three styles - default,
  record, cassette, and cymatics - open through `#flow-layer` and show the
  identical `#flowExitBtn` at `top:26,right:26` (measured via
  `getBoundingClientRect`, confirmed unaffected by which art style is
  active). At desktop split-view width (1440x900): cymatics fullscreen
  still uses `#flow-layer`/`#flowExitBtn` at `top:26,right:26` of the full
  viewport (covering the topbar, as it always has); record and cassette
  fullscreen now show the new `#desktopFsExitBtn` at
  `top:86,right:26` (86 = 60px topbar height + 26px inset) - the same
  size/style/26px corner inset as `#flowExitBtn`, just shifted down by the
  topbar that `desktop-fs` intentionally keeps visible. Screenshotted all
  six combinations (3 styles x 2 width tiers) confirming the exit button
  reads as the same control within each tier. Clicking `#desktopFsExitBtn`
  (dispatched both as a real click and verified via direct DOM
  `.click()`) correctly calls `closeDesktopFs()` and removes the
  `desktop-fs` class, restoring the normal split-view layout, from both
  the record and cassette states. Also confirmed opening the queue drawer
  while in desktop-fs fullscreen correctly layers over the exit button
  (expected, see z-index note above) without breaking anything, and that
  closing the drawer again restores it. Ran `node --check` against the
  extracted `<script>` contents - passes.

  **Caveat on browser-automation clicks:** in this session the shared
  preview pane repeatedly got its foregrounded tab stolen and even closed
  by other concurrent Claude Code sessions also driving the same pane
  (this repo's `CLAUDE.md` warns `index.html` edits can collide across
  sessions - the same turned out to be true of the shared browser pane
  itself). At one point synthetic pointer clicks stopped registering on
  the affected tab entirely (confirmed via a known-good control click on
  the pre-existing play button also silently no-op'ing), unrelated to this
  change - switched to a fresh tab and cross-checked every interaction
  claim against direct DOM state (`getBoundingClientRect`,
  `document.elementFromPoint`, `body.className`) rather than trusting
  screenshots alone.

### email-signin-prompt-loop: App asks to sign in to email account on every load
- **Status:** merged
- **Priority:** high
- **Description:** Every time the app loads, it prompts the user to sign in
  to their email account. This should not happen on every load - diagnose
  why a sign-in prompt is firing repeatedly (likely a mis-triggered
  auth/notification flow) and make it only prompt when actually necessary,
  not on every single load.
- **Touches:** unknown - likely auth/account or notification-permission flow
  triggered during app init.
- **Branch:** `agent/email-signin-prompt-loop`
- **Notes:** Synced from Geethub issue #136. Root cause: `initGoogleOneTap()`
  called `google.accounts.id.prompt()` unconditionally on every load with no
  memory of a dismissal - browsers that don't reliably persist Google's own
  cookie/FedCM throttle (Safari, hardened Chrome profiles) would see it
  every single time. Fix: added a 24h `localStorage`-backed dismissal
  cooldown (`ebbless:oneTapDismissedAt`), set only when the moment-
  notification callback reports the prompt was not displayed/was skipped/
  was dismissed - a genuine sign-in still works unaffected. Verified:
  dismissal timestamp stays frozen across repeated reloads and the prompt
  does not re-fire within the cooldown; no new JS errors introduced.
  Pushed as commit `286c784`.
- **Notes:** Synced from Geethub issue #136. Issue body had no further
  detail beyond the title. Flagged high priority - a sign-in prompt on
  every load is a bad first-run/every-run experience.

### breathe-love-deep-track-order: "Breathe Love Deep" skips "Gasp", starts on "Deep" instead
- **Status:** merged
- **Priority:** medium
- **Description:** Playing the "Breathe Love Deep" album skips the track
  "Gasp" and starts playback on "Deep" instead, even though the album title
  implies "Gasp" should play first (or at least be included). Fix the
  track order/selection so "Gasp" plays as expected.
- **Touches:** likely the same SoundCloud-sourced album area as
  `breathe-love-deep-album` and `breathe-love-deep-soundcloud-pull` (both
  merged) - track list/order resolution for this album specifically.
- **Branch:** `agent/breathe-love-deep-track-order`
- **Notes:** Synced from Geethub issue #134. Root cause was not a live
  ordering bug - a fresh resolve of the real SoundCloud set (verified
  directly against SoundCloud's API and the deployed worker) is correct:
  10 tracks, Gasp first. The bug reproduces only from a stale cached
  playlist object left over from before the two earlier Breathe Love Deep
  fixes landed. `beginImport()` already self-healed stale caches, but three
  other paths that also serve a cached playlist didn't: `playPlaylistNow()`
  (the actual library play button), the tracklist panel
  (`toggleLibraryPlaylistPanel()`), and `seedStarterLibrary()`. All three
  now run the same `isResolveStale`/`reResolveStaleInBackground` check.
  Verified by injecting a synthetic stale cache and confirming it
  reproduced the exact reported bug, then self-healed within ~5s and
  played correctly on the next attempt. Pushed as commit `3adaf8b`.
- **Notes:** Synced from Geethub issue #134. Related to (but not a
  duplicate of) `breathe-love-deep-album` and
  `breathe-love-deep-soundcloud-pull` - those fixed categorization and
  source-of-truth for this album; this is a distinct track-order/skip bug
  on the same release. Issue body had no further detail beyond the title.

### fullscreen-artwork-centering: Fullscreen artwork/LP/cassette should be centered to the viewport
- **Status:** merged
- **Priority:** medium
- **Description:** In fullscreen mode, the artwork, LP (spinning record),
  and cassette visuals should be centered to the viewport. Currently they
  are not centered.
- **Touches:** fullscreen chrome shared across `#flow-layer` and desktop
  split-view fullscreen (`.artwork-wrap`) - same area touched by
  `fullscreen-lp-cassette-visual`, `fullscreen-lp-too-small`, and
  `fullscreen-exit-button-consistency` (all merged/in that area).
- **Branch:** `agent/fullscreen-artwork-centering`
- **Notes:** Synced from Geethub issue #137. Mobile/tablet `#flow-layer`
  was already correctly centered - the bug was desktop split-view
  fullscreen only (`body.desktop-fs .artwork-wrap`, built by
  `fullscreen-lp-too-small`): the pane starts below the topbar rather than
  true viewport top, so flex-centering within the pane put the art ~30px
  too low at a 900px-tall viewport (barely visible on plain cover art, but
  clearly visible on the letterboxed record/cassette styles). Fix switches
  that rule to `position:fixed` centered directly on the true viewport via
  `top:50%;left:50%;transform:translate(-50%,-50%)`, trading a small
  symmetric size reduction (topbar reserved on both sides) for exact
  centering. Verified via `getBoundingClientRect` at 1440x900 (before:
  center off by 30px vertically; after: exact match), 1150x1400
  (width-constrained case, no topbar overlap), and 375x812 mobile
  (unaffected, as expected). Pushed as commit `06645c6`.

### splash-order-video-logo-buttons: Splash sequence order should be bg video, then logo, then tutorial/enter buttons
- **Status:** merged
- **Priority:** medium
- **Description:** The video-tinted splash screen should present its
  elements in this order: (1) background video, (2) EBBLESS logo, (3) the
  tutorial/enter choice buttons. Currently the order doesn't match this.
- **Touches:** splash sequence (`sequence()`, `showSplashChoice()`,
  `#splash`/`#onbBackdrop`/`#onbMark` per the recent
  `tutorial-text-overflow-button-animation` splash-beat work, commit
  `01f2367`).
- **Branch:** agent/splash-order-video-logo-buttons
- **Notes:** Synced from Geethub issue #139. Issue body had no further
  detail beyond the title. Checked against commit `01f2367` first per the
  entry's own instruction: that commit only changed the *handoff* into
  `showSplashChoice()` (holding the flat black `#onbBackdrop`/`#onbMark`
  brand beat for `BRAND_BEAT_MS` before `#splash` takes over) and two
  caption capitalizations - it never touched the CSS timing for the video
  reveal, logo fade-in, or choice buttons, so this fix doesn't revert or
  duplicate it.
  Root cause: once `showSplashChoice()` adds `is-active is-choice` to
  `#splash`, three CSS animations/transitions race independently -
  `.splash-black`'s reveal (0ms delay, 2600ms), the logo `img`'s fade-in
  (900ms delay, 1800ms duration, done at 2700ms), and `.splash-choice`'s
  fade/slide-in (was 1200ms delay, 500ms duration, done at 1700ms). The
  choice buttons finished fading in at 1700ms - a full second before the
  logo's own fade-in completed at 2700ms - so visitors saw the Tutorial/
  Enter buttons fully legible while the EBBLESS wordmark was still a faint,
  half-formed ghost behind them: buttons registering before the logo did,
  out of the intended order.
  Fix: in the `.splash-choice` CSS rule (~line 1182), changed the
  transition delay from `1200ms` to `2700ms` for both `opacity` and
  `transform`, so the buttons only start fading in once the logo's
  `splash-logo-in` animation has fully finished. Video reveal and logo
  fade-in delays (0ms / 900ms) were already correctly ordered relative to
  each other and untouched.
  Verified live: served the worktree with `python3 -m http.server`,
  opened it in the Browser pane with a cleared `localStorage` (first-time-
  visitor path), and captured screenshots at ~2.5s/3.5s/4.7s/5.7s after
  load. Confirmed the sequence now reads cleanly as (1) flat black brand
  beat, (2) cymatics video alone, (3) video + EBBLESS wordmark, (4) video +
  wordmark + Tutorial/Enter buttons - each element clearly established
  before the next appears, with no overlap-driven reordering.

### fullscreen-esc-exit: Esc key should exit fullscreen
- **Status:** merged
- **Priority:** medium
- **Description:** Pressing the Esc key while in fullscreen (LP, cassette,
  or cymatics) should exit fullscreen, same as clicking the exit-fullscreen
  button.
- **Touches:** fullscreen chrome shared across `#flow-layer` and desktop
  split-view fullscreen (`.artwork-wrap`) - likely wires into the same
  `closeDesktopFs()` / flow-layer exit path as
  `fullscreen-exit-button-consistency` (merged, commit `e23b9a5`).
- **Branch:** agent/fullscreen-esc-exit
- **Notes:** Synced from Geethub issue #138. Issue body had no further
  detail beyond the title. Related to but not a duplicate of
  `fullscreen-exit-button-consistency` - that unified the on-screen button;
  this adds a keyboard shortcut to the same exit path.

  **Fix:** added an `'Escape'` case to the existing desktop keyboard-shortcuts
  `keydown` listener (`index.html` ~7273, the same switch that already
  handles space/arrows/`f`). It closes whichever of the two fullscreen
  overlays is actually open: `closeFlow()` if `state.flowOpen` (the shared
  `#flow-layer` overlay - covers LP, cassette, and default art style on
  mobile/tablet, plus cymatics on both mobile and desktop), else
  `closeDesktopFs()` if `state.deskFsOpen` (the split-desktop panel-slide
  LP/cassette/default fullscreen added by `fullscreen-exit-button-consistency`).
  These two are mutually exclusive, so at most one fires. Lyrics fullscreen
  (`#lyricsFsLayer`/`openLyricsFs()`) is a separate, pre-existing overlay
  that was never part of the LP/cassette/cymatics exit-button unification
  and is out of scope here per the issue title - left untouched, still only
  closable via its own `#lyricsFsExitBtn`.
- **Verified:** real browser (this worktree served via
  `python3 -m http.server 8794`, confirmed via a fetch of `/index.html`
  matching this change's marker text before trusting the page). At mobile
  width (557x814, default `#flow-layer` path): entered fullscreen for
  default art, Spinning Record (LP), Cassette Tape, and cymatics
  (visualizer) - in each case confirmed `#flow-layer.is-open` was `true`,
  pressed Escape, confirmed it flipped to `false` and the player view
  underneath was intact. At desktop split-view width (1440x900): switched
  to Cassette Tape, opened fullscreen (`toggleDesktopFs()` path, confirmed
  `document.body` gained `desktop-fs` and NOT `#flow-layer.is-open`),
  pressed Escape, confirmed `desktop-fs` was removed and the library/queue
  panes slid back in. Also checked for interference with other Escape
  behavior: opened lyrics fullscreen (`#lyricsFsLayer`, deliberately
  out of scope) and pressed Escape - it stayed open as expected (no
  regression, no accidental cross-wiring), then closed it via its own
  button; opened the library item right-click context menu and pressed
  Escape - it still closed via its pre-existing, untouched handler. Ran
  `node --check` against the extracted `<script>` contents - passes.

### playlist-panel-side-desktop: Desktop playlist panel should open left-over-library, not right-over-queue
- **Status:** merged
- **Priority:** medium
- **Description:** On desktop, opening a playlist currently slides its
  panel in on the right side, over the queue. It should instead open on
  the left side, over the library.
- **Touches:** desktop playlist panel/slide-up (same area as
  `playlist-queue-slide-height`, `playlist-art-at-top`, both merged).
- **Branch:** agent/playlist-panel-side-desktop
- **Notes:** Synced from Geethub issue #135. Issue body had no further
  detail beyond the title.
  Geethub #198 folded in: desktop playlist panel currently shows two close buttons - remove the top one. The remaining X should be identical to the queue's X in the window's top-right corner. User wants this done as part of this entry.
  Fix (`eda404f`, CSS only): in the >=1150px split layout `#libpl-panel`
  now shares the library pane's grid cell (col 1) and slides in from the
  left over it; the queue stays uncovered. Mobile slide-up and the
  860-1149px drawer unchanged. #198: only one close X (`#libplCloseBtn`)
  exists in the markup, so nothing was removed - it now sits in the pane's
  top-right at the same 20px inset as the queue header's controls. Needs a
  check whether the "second X" still shows anywhere. Desktop-fullscreen
  (library drawer) case untested.

### fullscreen-vertical-centering-nav-row: Fullscreen art still not vertically centered; top nav row wastes space
- **Status:** merged
- **Priority:** medium
- **Description:** Follow-up to `fullscreen-artwork-centering`: in
  fullscreen the artwork/LP/cassette is still not centered vertically. User
  suspects the top nav header row - the logo and nav buttons don't need the
  entire row to be off limits. Separately, outside fullscreen the top nav
  row has a lot of empty space and feels like it floats above the rest of
  the UI; it should feel like part of the panels below it.
- **Touches:** topbar / header row, `body.desktop-fs .artwork-wrap`,
  `#flow-layer`.
- **Branch:** agent/fullscreen-vertical-centering-nav-row
- **Notes:** Synced from Geethub issue #137 (reopened with the vertical
  centering comment) and #151 (nav row empty space), combined since both
  are about the same header row.

### desktop-mini-player-reopen: Desktop mini-player not working (issue reopened)
- **Status:** dropped
- **Priority:** medium
- **Description:** Geethub issue #64 (`desktop-mini-player`, merged) was
  reopened by the user with no new detail, meaning the floating mini-player
  on tab switch isn't working or isn't meeting the brief (movable, corner of
  screen, full player controls). Reproduce on desktop Chrome and Safari,
  find what's broken, fix.
- **Touches:** mini-player / Picture-in-Picture code from
  `desktop-mini-player`.
- **Branch:**
- **Notes:** Synced from reopened Geethub issue #64. Dropped 2026-09-23:
  user confirmed the mini-player is working ("i see it now").

### flag-wrong-track: Flag button missing on desktop; flag should report "wrong track playing"
- **Status:** merged
- **Priority:** medium
- **Description:** The flag button has disappeared on desktop (mobile not
  yet checked). Its job should be simple and quick: one tap reports the
  current song as the wrong track playing. Keep a log of flagged tracks
  (what was requested vs what was matched/played, source, candidates) so
  the causes of inaccurate matches can be researched.
- **Touches:** player controls; link matching / relink code.
- **Branch:** agent/flag-wrong-track
- **Notes:** Synced from Geethub issues #174 (button gone) and #168 (what it
  should do). No "flag" control exists in current `main` index.html -
  the agent should first confirm what the user means (likely the per-track
  relink/report control) or build it fresh.
  Lane pushed `29ce42a`: flag was hidden for SoundCloud tracks since
  `9efc88b` and missing from desktop fullscreen; now shown everywhere,
  one tap logs + diagnoses (localStorage, Settings > Support copy, and
  `/report`), second tap opens relink and pins the correction. Worker
  changes (`/search` scores, `/report` payload) need a worker deploy.

### wrong-song-kaytranada-glowed-up: Playlist plays wrong song for "Glowed Up" (Kaytranada)
- **Status:** merged
- **Priority:** medium
- **Description:** Loading
  https://open.spotify.com/playlist/18LY7SteZvmFRVoKTInRKS showed the art
  for the first song, "Glowed Up" by Kaytranada, but played a different
  song. Find why the match was wrong and fix the matching.
- **Touches:** link matching (`link-match-accuracy`, `amel-larrieux-wrong-track`
  area).
- **Branch:** agent/wrong-song-kaytranada-glowed-up
- **Notes:** Synced from Geethub issue #159.

### queue-3dot-menu-desktop: Queue track 3-dot menu can't be clicked on desktop
- **Status:** merged
- **Priority:** medium
- **Description:** On desktop, clicking the 3-dot menu button on a queue
  row just plays the track instead of opening the menu.
- **Touches:** queue row click handling.
- **Branch:** agent/queue-3dot-menu-desktop
- **Notes:** Synced from Geethub issue #152. Lane run 2026-09-23 could
  not reproduce: queue rows no longer have a 3-dot button (Playlist section
  removed in 39155e1). The playlist panel's "Track options" button
  (desktop right column) already stops propagation and opens its menu
  correctly in headless tests at every width. Needs an exact repro (which
  panel, browser, window width, click spot). Untested guess: clicks in the
  row's right padding next to the button play the track. 
  Update 2026-09-29: user wants queue rows to have a working 3-dot
  menu on desktop. If the button is gone, add it back (same menu as
  the playlist panel's "Track options") rather than dropping this.

### bld-background-tab-autoadvance: SoundCloud tracks won't advance to the next track in a background tab
- **Status:** merged
- **Priority:** medium
- **Description:** With the Breathe Love Deep album playing, when a song
  ends while the user is on another browser tab, the next track doesn't
  start until they return to EBBLESS.
- **Touches:** SoundCloud native playback / track-end handling
  (`soundcloud-native-playback`).
- **Branch:** agent/bld-background-tab-autoadvance
- **Notes:** Synced from Geethub issue #144. User update 2026-09-23: this
  seems to affect ALL SoundCloud-sourced links, not just Breathe Love Deep.
  Lane pushed `7e36ed3`: root cause was the standby SoundCloud deck
  autoplaying, and SoundCloud only lets one widget play, so it paused the
  active track (resumed only on tab return). Standby deck no longer
  autoplays, volume re-applied after `widget.load()` (resets to 100), plus
  a guard that re-pauses a stray standby play. Also fixes Next on a
  SoundCloud album showing "paused". Not re-tested in a truly hidden tab
  after the fix.

### safari-splash-bg-video: Splash background video doesn't load on Safari
- **Status:** merged
- **Priority:** medium
- **Description:** Opening the app in Safari, the splash showed only the
  color gradient, no background video.
- **Touches:** splash video element (autoplay/muted/playsinline, formats).
- **Branch:** `agent/safari-splash-bg-video`
- **Notes:** Synced from Geethub issue #161.

  Fix on branch (commit `1a41d6f`), root cause not reproduced: assets are
  Apple-encoded H.264 yuv420p with faststart, Pages serves 206, SW doesn't
  touch media. Likely iOS Low Power Mode / Auto-Play "Never" blocking
  muted autoplay with no `play()` retry. Added first-frame `poster` JPEGs
  to splash + library videos and a first-gesture `play()` retry. If it
  still fails with Low Power Mode off, suspect the opaque splash tint
  compositing over the video (separate CSS fix).

### lp-shadow-clipped: LP shadow is cut off by its own image box
- **Status:** merged
- **Priority:** medium
- **Description:** The LP's shadow gets clipped by the image border, which
  reveals a box. Make the edge softer/larger so the shadow never looks cut.
- **Touches:** record art style CSS.
- **Branch:** agent/lp-shadow-clipped
- **Notes:** Synced from Geethub issue #143.

### fullscreen-title-contrast: Fullscreen title unreadable over white-heavy art
- **Status:** merged
- **Priority:** medium
- **Description:** In fullscreen, when album art has a lot of white, the
  white title text disappears. Fix contrast, e.g. a subtle character
  outline/shadow that only really shows when the text would vanish.
- **Touches:** fullscreen title/artist styling.
- **Branch:** agent/fullscreen-title-contrast
- **Notes:** Synced from Geethub issue #153.

### crossfade-art-lp-cassette: Crossfade art fade should also work on LP and cassette
- **Status:** merged
- **Priority:** medium
- **Description:** The art-to-art fade on crossfade works for plain art but
  not the LP or cassette styles. It should.
- **Touches:** follow-up to `crossfade-album-art-transition`.
- **Branch:** agent/crossfade-art-lp-cassette
- **Notes:** Synced from Geethub issue #158.
  Fix (`9bf90e3`): new `crossfadeAltArt()` lays a frozen copy of the
  outgoing LP label / cassette label over the real element, swaps the real
  one to the next track, and fades the copy out over the crossfade length.
  Called from both `runCrossfade` and `startSkipCrossfade`;
  `reflectCurrentTrackUI` skips the label swap when the art swap is skipped
  so the labels don't reset at fade end. Verified by calling the fade
  directly (mid-fade blend, clean end); a real audio crossfade, fullscreen
  LP/cassette, and rapid repeated skips are untested.

### library-title-full-width: Library playlist titles should use full width until hover
- **Status:** merged
- **Priority:** medium
- **Description:** In the library, unhovered playlist rows should let the
  title stretch to the edge of the pane. Only on hover, when the row
  buttons appear, should the title shorten to make room.
- **Touches:** library row CSS (`desktop-playlist-hover-buttons` area).
- **Branch:** agent/library-title-full-width
- **Notes:** Synced from Geethub issue #173.
  Fix (`c21424c`, CSS only): `.row-actions` was only `opacity:0` at rest,
  so it still reserved ~100px. On real-hover devices it's now lifted out
  of flow (absolute, no pointer events) unless the row is hovered,
  keyboard-focused, or has its 3-dot menu open; title goes 119px -> 219px
  at rest on 1440 wide, back to 119px on hover. Touch unchanged. Also shows
  the buttons on keyboard focus. Uses `:has()` (Safari 15.4+, Firefox
  121+); only tested in Chromium. Pre-existing: a pinned row's lit pin is
  invisible at rest (container opacity:0) - noted in a code comment.

### fullscreen-immersive-phase: Make the hidden "press F twice" big fullscreen a real third button phase
- **Status:** merged
- **Priority:** medium
- **Description:** In fullscreen (art/LP/cassette), pressing "f" again
  gives a larger graphic with UI that disappears after a while - the user
  loves it but had to discover it. Make it the fullscreen button's 3rd
  phase. It should cover the whole screen with no browser chrome (like a
  YouTube video). Put the X next to the fullscreen button so one click
  returns to the main screen, and drop the redundant X (the close-fullscreen
  button near the middle already does that job). Replace the little image
  button up top with the same 3-icon menu used in regular mode so users can
  switch to cymatics/lyrics seamlessly.
- **Touches:** fullscreen controls, Fullscreen API, keyboard handler.
- **Branch:** agent/fullscreen-immersive-phase
- **Notes:** Synced from Geethub issues #157, #142 (true full screen, no
  browser), #148 (redundant X), combined since they describe the same mode.

### fullscreen-ui-autohide: Fullscreen LP/cassette/cymatics UI should fade out when idle
- **Status:** merged
- **Priority:** high
- **Description:** On desktop and mobile, in fullscreen LP, cassette or
  cymatics, the UI should fade out after some idle time and fade back in on
  interaction.
- **Touches:** fullscreen chrome. Overlaps `fullscreen-immersive-phase`
  (that mode already auto-hides) - build both on one shared idle timer.
- **Branch:** agent/fullscreen-ui-autohide
- **Notes:** Synced from Geethub issue #147.

### desktop-fullscreen-settings-only: In desktop fullscreen, Settings should open alone
- **Status:** merged
- **Priority:** medium
- **Description:** If fullscreen is active on desktop and the user clicks
  Settings, show just the settings window, not the queue and library too.
- **Touches:** `desktop-settings-inline`, `desktop-settings-queue-popup` area.
- **Branch:** agent/desktop-fullscreen-settings-only
- **Notes:** Synced from Geethub issue #141.
  Fix (`86c9945`): the #131 fix made `setView('settings')` exit desktop
  fullscreen, dropping into the 3-pane grid with library + queue showing.
  Now it also flags `state.settingsFromDeskFs` + `body.settings-solo`
  (CSS hides library/queue/playlist panes, Settings spans the full grid),
  and leaving Settings re-enters fullscreen. Library/queue drawers open
  before Settings come back closed. Browser-back exit and resizing below
  1150px while in Settings are untested.

### desktop-settings-footer-controls: Desktop Settings view should show footer player controls
- **Status:** merged
- **Priority:** high
- **Description:** On desktop, while the Settings menu is active (replacing
  the player pane), show the footer player controls so playback stays
  controllable.
- **Touches:** desktop settings inline view, footer player.
- **Branch:** agent/desktop-settings-footer-controls
- **Notes:** Synced from Geethub issue #146 (title only, no description).

### pause-fade-out: Pausing should fade the music out briefly
- **Status:** merged
- **Priority:** high
- **Description:** When the user pauses, fade the audio down over a short
  time instead of cutting instantly - a longer distance between sound and
  silence. Likely fade back in on resume too.
- **Touches:** play/pause handlers, audio gain.
- **Branch:** agent/pause-fade-out
- **Notes:** Synced from Geethub issue #145. Lane pushed `161536e`:
  550ms eased fade-out then pause, 320ms fade-in gated on real playback,
  mid-fade toggles reverse from current level, pausing mid-crossfade
  cancels the crossfade. Verified on YouTube and SoundCloud.

### crossfade-manual-skip: Crossfade should also apply on next/previous
- **Status:** merged
- **Priority:** medium
- **Description:** With crossfade on, manually skipping to the next or
  previous track should fade into it rather than cutting.
- **Touches:** crossfade engine, next/prev handlers.
- **Branch:** agent/crossfade-manual-skip
- **Notes:** Synced from Geethub issue #160.

### lp-needle-sfx: LP mode needle-lift / needle-drop sound on pause and play
- **Status:** merged
- **Priority:** medium
- **Description:** In LP mode, pausing plays a slight needle-lift sound;
  pressing play plays the needle dropping back on the record. User can
  provide the sound bites.
- **Touches:** play/pause handlers when art style is record. Pairs with
  `pause-fade-out`.
- **Branch:** agent/lp-needle-sfx
- **Notes:** Synced from Geethub issue #162.

### cymatics-infinity-invert: Invert the cymatics infinity button
- **Status:** merged
- **Priority:** medium
- **Description:** On cymatics, the infinity button should work the other
  way round: deactivated does what active does now, and vice versa.
- **Touches:** cymatics infinity toggle.
- **Branch:** agent/cymatics-infinity-invert
- **Notes:** Synced from Geethub issue #155.

### keyboard-shortcuts: Add keyboard shortcuts
- **Status:** merged
- **Priority:** medium
- **Description:** "i" toggles the cymatics infinity loop; "p" and "l" open
  the library; "q" the queue; "s" toggles settings; "shift+s" make a
  suggestion; "shift+b" report a bug.
- **Touches:** global keydown handler (alongside "f" fullscreen and Esc).
- **Branch:** agent/keyboard-shortcuts
- **Notes:** Synced from Geethub issue #156.

### lyrics-mode-load-crash: App stuck on splash when saved visual mode is lyrics
- **Status:** merged
- **Priority:** high
- **Description:** If the saved visual mode is lyrics, load throws
  "Cannot access 'lyricsState' before initialization" and the app never
  gets past the splash. Top-level `applyVisualMode();` (~index.html 8749)
  runs before `let lyricsState` (~8772).
- **Touches:** visual mode init / lyrics state.
- **Branch:** agent/lyrics-mode-load-crash
- **Notes:** Found by the fullscreen-immersive-phase lane (2026-09-30),
  exists on main.

### keyboard-shortcuts-2: More keyboard shortcuts (playlist, shuffle, loop, art, cymatics, lyrics, seek)
- **Status:** merged
- **Priority:** medium
- **Description:** Add to the global keydown handler:
  - "p" and "l" toggle the library open/closed (previously open-only).
  - "shift+l" jumps focus to the load-playlist (paste link) text box.
  - "x" toggles shuffle.
  - "o" cycles through the loop/repeat phases.
  - "t" cycles through the album art phases (art / LP / cassette etc.).
  - "y" toggles cymatics.
  - "u" toggles lyrics.
  - "shift+left" / "shift+right" rewind / fast-forward 10 seconds (plain
    left/right keep prev/next track).
  - "esc" closes an open playlist panel (after existing fullscreen exits).
  - All shortcuts work in fullscreen. Menu ones (library, queue, settings,
    load-playlist box, playlist panel) exit fullscreen to the main view
    first, then open that menu; playback toggles stay in fullscreen.
  - Same for the on-screen library/queue/settings/playlist/load buttons in
    fullscreen: exit to the main view, then open the menu (replaces the old
    desktop-fullscreen drawer-toggle behavior). One shared code path.
- **Touches:** global keydown handler in index.html (~line 9606), next to
  the existing `keyboard-shortcuts` bindings; reuse existing button click
  paths (`toggleShuffle`, `cycleRepeat`, art-style/cymatics/lyrics buttons).
- **Branch:** agent/keyboard-shortcuts-2
- **Merge note (2026-09-30):** Library/Queue/Settings buttons added to the
  flow overlay (library+queue left, settings beside the X) and lyrics
  fullscreen; each clicks the matching #topnav button.
- **Notes:** Added directly by the user in chat (2026-09-30). Extends
  `keyboard-shortcuts` (merged). Also update any in-app shortcut list /
  tutorial copy if one exists. `fullscreen-immersive-phase` also touches the
  keyboard handler ("f" phases) - merge whichever lands first before the
  other rebases.

### relink-soundcloud-suggestions: "Refresh link" should suggest SoundCloud for SoundCloud tracks
- **Status:** merged
- **Priority:** medium
- **Description:** The per-track refresh-link menu only offers YouTube
  candidates. For SoundCloud-sourced tracks it should offer SoundCloud
  candidates too - match the source for accuracy.
- **Touches:** `track-relink-menu`, `#relinkCandidates`.
- **Branch:** agent/relink-soundcloud-suggestions
- **Notes:** Synced from Geethub issue #140.
  Fix (`3806876`): **needs a worker deploy** (`cd worker && npx wrangler
  deploy`) - new `GET /sctracksearch?q=&limit=` (SoundCloud track search,
  same client_id/401-retry as `/playlistsearch`, 6h cache). App: for
  tracks with an `sc:` videoId or in a SoundCloud playlist, "Refresh link"
  queries SoundCloud + YouTube in parallel, SoundCloud first; picking one
  sets `videoId: 'sc:<id>'` (native playback) and skips the shared match
  cache. If the endpoint is missing/down it silently falls back to
  YouTube-only. Tested with mocked responses; real SoundCloud search
  response shape and post-relink audio untested. Follow-up idea: the
  now-playing flag button still doesn't open this menu for SC tracks.
  Follow-up (`cd507d8`): also skip `policy: 'SNIP'` (Go+ 30s previews) in
  `/sctracksearch`. Response mapping reuses `scTrackToTitleArtist`, the
  same mapper already live on `/soundcloud` and `/tracks?ids=`, and the
  relink writes the same `soundCloudVideoId()` id native playback already
  plays, so shape/playback risk is low; still unverified live (sandbox
  network blocks SoundCloud).

### paste-search-result-counts: Paste-bar search results should show track count and duration
- **Status:** merged
- **Priority:** medium
- **Description:** In the list of options that appears when searching in
  the paste bar, each playlist option should show how many tracks it has
  and its total duration.
- **Touches:** `playlist-vibe-search` results UI.
- **Branch:** agent/paste-search-result-counts
- **Notes:** Synced from Geethub issue #172.
  Fix (`37910e3`): **needs a worker deploy** for durations. SoundCloud
  results show "N tracks · X hr Y min" (`durationMs` added from the search
  response; `trackCount` null not 0 when unknown; cache v1->v2). Apple
  Music search carries neither, Spotify isn't a source. Old worker shape
  shows count only. Live responses untested.

### discover-append-to-queue: Discover should auto-append new songs to the end of the queue
- **Status:** merged
- **Priority:** medium
- **Description:** When Discover is active, keep adding new discovered
  songs to the end of the queue. Deactivating Discover removes them.
  Turning on shuffle should pull from both the original queue and the
  discovered tracks.
- **Touches:** Discover / `discovery-radio-continuation`, queue, shuffle.
- **Branch:** agent/discover-append-to-queue
- **Notes:** Synced from Geethub issue #169.
  Fix (`0bd6d3c`, `cea8b5c`): Discover-added queue entries tagged
  `discover: true`; toggling off removes them (except the playing one);
  batches arriving with shuffle on reshuffle the upcoming tail; unshuffle
  restores playlist order + discoveries after. **Behavior change:** the
  resume data now saves the whole queue and restores it on reload (falls
  back to rebuilding if any entry is unplayable). In-flight batch is
  dropped if Discover was switched off meanwhile. Real network/crossfade
  timing untested.

### currents-add-reset-button: Button to add more tracks to or reset CuRRentSSsss
- **Status:** merged
- **Priority:** medium
- **Description:** Add a button on the CuRRentSSsss playlist to pull in
  more tracks, and one to reset it.
- **Touches:** Currents playlist; related to `currents-playlist-algorithm`
  (draft), which defines how tracks are chosen.
- **Branch:** agent/currents-playlist-algorithm
- **Notes:** Synced from Geethub issue #170 (title only).
  Geethub #192 folded in: a button in the CuRRentSSsss menu to reshuffle/reload all tracks with new ones based on the most recent listening.

### playlist-cap-10: Cap user-added playlists at 10
- **Status:** archived
- **Priority:** medium
- **Description:** Users can add up to 10 new playlists. Auto-added ones
  (Liked, CuRRentSSsss, This Is Mal Griot, Breathe Love Deep) don't count.
  EBBLESS DEEP users get unlimited.
- **Touches:** playlist add flow, library. Depends on `ebbless-deep` for the
  unlimited tier.
- **Branch:**
- **Notes:** Synced from Geethub issue #171.

### button-press-feel: Every button should feel great to press
- **Status:** merged
- **Priority:** medium
- **Description:** Give every button a subtle, satisfying press feel
  (micro-animation, maybe haptics on mobile) - a nice touch, never
  distracting.
- **Touches:** global button styles. Builds on the press animation from
  `tutorial-text-overflow-button-animation`.
- **Branch:** agent/button-press-feel
- **Notes:** Synced from Geethub issue #150.

### own-songs-lyrics: Lyrics for every Breathe Love Deep and This Is Mal Griot song
- **Status:** archived
- **Priority:** medium
- **Description:** All songs on Breathe Love Deep and This Is Mal Griot
  should have lyrics. The user wrote them and will supply the text, so
  bundle them in the app rather than searching a lyrics provider. Timed
  lyrics if possible.
- **Touches:** lyrics lookup - add a local override table.
- **Branch:** agent/own-songs-lyrics
- **Notes:** Synced from Geethub issue #154. Needs lyric text from the user
  before an agent can finish it.
  Pushed (commit `3292519`): `OWN_LYRICS` table (just before `fetchLyrics`)
  with 17 empty slots keyed from the real tracklists (Breathe Love Deep:
  gasp, deep, high, vast, burn, fume, mute, mmm, doze, void; This Is Mal
  Griot: I Tried It, Helicopter Man, How It Goes, Free Fall, Toxic Baby,
  Turn Around, The Call of the Jungle). Accepts LRC or plain text; title
  match ignores case/spacing/punctuation/brackets/feat./dash suffixes.
  `OWN_LYRICS_ARTISTS` = Mal Griot, G R II O T, Deep Dawn (user confirmed
  all three are their own artist names). `fetchLyrics`
  returns `{synced, source:'own', lines}` with no network call for a filled
  entry; empty falls through. `maybeLoadLyrics` no longer blocks SoundCloud
  tracks that have a filled entry. Still needs the lyric text.
  Parked back to `draft` by the user (2026-09-29): they'll supply lyrics
  later. The mechanism is done on `agent/own-songs-lyrics`; when lyrics
  arrive, fill the slots on that branch and it's ready to review/merge.

### cassette-beautification: Make the cassette a premium physical object
- **Status:** merged
- **Priority:** medium
- **Description:** Visual polish pass on the Cassette Tape art style
  (sibling of `spinning-record-realism`). Full brief from issue #149:
  1. Physical object, not player UI: floats in EBBLESS with subtle depth,
     shadow, materiality, and space around it.
  2. Premium material: smoky/translucent plastic, subtle reflections,
     realistic depth, restrained imperfections. Contemporary, not retro.
  3. Physical reels: slight rotational variation between the two reels,
     gentle inertia on play/stop, tiny highlight shifts as they turn.
  4. Magnetic tape: visible tape subtly responds to playback as it winds
     between reels. Slow, understated.
  5. Minimal label: remove deck/mixtape graphics and excess labeling; use
     the EBBLESS identity sparingly.
  6. Tape window: subtle reflections, transparency, depth, so the moving
     tape is a small hypnotic detail.
  7. Environment: restrained ambient reflection and grounding shadow, no
     literal tabletop or background scene.
  8. Playback states: clear physical difference between idle, playing,
     paused; stopping has a tiny sense of mechanical inertia.
  9. Current-track influence: extremely subtle label-tone/reflection shift
     from the current track or playlist. Stays recognizable, not a
     visualizer.
  10. No nostalgia filter: no VHS, grain, fake wear, sepia, handwritten
      type, glitches, or excess beige.
- **Touches:** cassette art style (`#artCassette` / `.cs-*` markup, CSS,
  animation, play/pause hooks). Sibling of `spinning-record-realism`;
  overlaps `cassette-fullscreen-animation` (draft) - same visual, sequence
  after this one.
- **Branch:** agent/cassette-beautification
- **Notes:** Synced from Geethub issue #149. Keep sizing from
  `record-cassette-size` and fullscreen behavior from
  `fullscreen-lp-cassette-visual` intact.

  Material/motion pass on `agent/cassette-beautification`, all inside the
  existing `#artCassette` SVG (same viewBox/padding, so sizing and the
  fullscreen move into `#flowArtWrap` are untouched). Shell is now a cool
  smoky translucent gradient with one soft diagonal reflection band, a top
  rim catch-light, and a grounding shadow ellipse outside the new
  `.cs-body` group. `#artCassette[data-state]` (idle / playing / paused,
  set by `cassetteSyncState()` from `cassetteSetPlaying` and
  `cassetteUpdateTrack`) lives on the element itself so it holds in
  fullscreen: playing lifts the body ~2 units off its shadow and brightens
  the sheen/hub gleams; stopping drops it back with a slight overshoot.
  Label pan only runs while playing. Reels mirror the record's rAF model:
  separate eased speeds per reel (take-up side lags on start, coasts a bit
  longer), a tiny per-reel once-per-turn variation, start out of phase, and
  a small damped rock-back when they come to rest; now turn
  counterclockwise to match the tape path. Fixed-light gleams over the hubs
  and a satin gradient on the tape packs give the highlight shift. The tape
  now leaves each pack at its real tangent point (recomputed from progress
  in `cassetteSetProgress`, pack outline rings follow the radius too) and
  a faint dash sheen travels along it at the hubs' tape speed. Window has a
  glass overlay drawn over reels and tape. Label stripped to a small, faint
  EBBLESS wordmark plus the track title (removed the `01 / 01` index,
  divider rule and deck arrow). Track tint: `--player-accent` mixed at 6%
  into the label panel/hub rings and 14% into the glass streak, with plain
  fallbacks. Beige/warm tones replaced with neutrals; no grain/wear/etc.
  Reduced motion: no rotation (as before), no lift/transition, no pan.
  Verified on a worktree-local `python3 -m http.server` with the dev test
  playlist playing for real: idle (no track), playing, paused (hub angle
  sampled per frame: ~500ms coast then a sub-degree rock that lands exactly
  at rest), next-track title/label/tape update, and fullscreen (cassette in
  `#flowArtWrap`, state still `playing`/`paused`) at 375x812, the ~557px
  pane, and 1280x800 split-desktop plus desktop fullscreen. No new console
  errors (only the pre-existing identity-provider / GSI / script-fetch
  ones). Not verified: the synced crossfade ghost on the label (needs
  crossfade on and a track to end; code path unchanged) and
  prefers-reduced-motion in a real browser setting.

### ebbless-deep: EBBLESS DEEP - an optional deeper tier to fund the app
- **Status:** archived
- **Priority:** medium
- **Description:** A deeper layer of EBBLESS, not a conventional premium
  subscription; free EBBLESS stays complete. Includes unlimited playlists
  and queues, and "EBBLESS Echo": subtle environmental audio under the music
  (Rain, Ocean, Forest, Night, City, Fire, Train, Room, Wind, Monsoon) with
  an intensity control. See the issue for the full brief.
- **Touches:** new; payments, feature gating, audio layer.
- **Branch:**
- **Notes:** Synced from Geethub issue #167. Echo overlaps
  `ambient-soundscapes` (draft) - likely the same feature. Needs a
  payments/accounts decision first (`accounts-profiles`).
  Geethub #188 folded in: candidate EBBLESS DEEP visuals from reactbits.dev/backgrounds - aero-shards, crt-warp, shape-waves, light-tunnel, sliced-waves, acid-squares, liquid-ether, floating-lines, pixel-blast, color-bends, evil-eye, line-waves, radar, particles, gradient-blinds, galaxy, dither, faulty-terminal, ripple-grid, dot-field, dot-grid (full URLs with tuned params in the issue).

### artist-tipping: Tipping and direct fan subscriptions for independent artists
- **Status:** archived
- **Priority:** medium
- **Description:** Let listeners pay a small monthly amount directly to
  independent creators for bonus tracks, early releases, behind-the-scenes
  audio. Open question from the user: artist pages vs a separate royalties
  page, and how to do it without breaking platform rules.
- **Touches:** new; needs research/plan before building.
- **Branch:**
- **Notes:** Synced from Geethub issue #166.

### cross-platform-handoff: Hand off playback between phone, desktop, speakers, car
- **Status:** merged
- **Priority:** high
- **Description:** Move playback from phone to desktop, smart speaker, or
  car without the queue disappearing or glitching.
- **Touches:** depends on `accounts-profiles` (cross-device sync).
- **Branch:** agent/cross-platform-handoff
- **Notes:** Synced from Geethub issue #165.
  **Decision (2026-09-30):** cover every target that's feasible (phone <-> desktop via accounts sync; speakers via Cast / Remote Playback API; car via Media Session). Sequenced after `accounts-profiles`.
  **Split (2026-09-30):** part 1 (this lane, started now): speakers (Cast / Remote Playback) + car/lock-screen (Media Session completeness). Part 2, phone <-> desktop session handoff, starts after `accounts-profiles` lands.
  **Part 2 started (2026-09-30):** phone <-> desktop handoff on `agent/handoff-devices`, branched from `agent/accounts-profiles` (merge accounts first).
  **Part 1 built (ff8c79a, `agent/cross-platform-handoff`):** full Media Session (real-size artwork, all actions except ±10s on iOS so prev/next stay, guarded position state); Chromecast via lazy Cast SDK - YouTube tracks to YouTube receiver by id, podcasts to Default Media Receiver, EBBLESS keeps the queue and advances on the device, mirrored controls, "Playing on <device>" bar, local resume at position on stop; AirPlay button for podcast episodes on Safari. Unverified on real hardware: YouTube receiver accepting load-by-id (falls back locally with a toast if not). 
  **Part 2 built (0a47011, `agent/handoff-devices`, contains accounts):** per-device `now` session in the synced profile (queue <=100, index, position, play state; newest per device, <=8 devices, 24h expiry relative to newest); "Continue from <device>?" prompt on open/focus when another device played in the last 30 min; Continue restores queue/index/position; the other device pauses with "Playing on <device>" on its next sync. ~12 KV writes/hour of listening max. Merge note: one trivial CSS conflict with `encourage-liking-songs` (both append a block after `.sw-update-toast` rules) - keep both.

### contextual-awareness: Music that adapts to weather, time of day, movement
- **Status:** merged
- **Priority:** high
- **Description:** Beyond mood playlists: adapt recommendations to local
  weather, time of day, or movement speed (phone sensors).
- **Touches:** Discover / Currents recommendation logic.
- **Branch:** agent/contextual-awareness
- **Notes:** Synced from Geethub issue #164.
  Geethub #187 folded in: track the user's time of day, time zone, weather and location to curate Discover and offer automatic time-based playlists; also asks to incorporate Rosicrucian knowledge about the time of day and day of the week.
  **Decision (2026-09-30):** time-based only for now (time of day, day of week, incl. the Rosicrucian day/hour idea). No location or weather.
  **Built (6923771):** `getTimeContext()` time blocks (weekend nights hotter, small hours = previous night); planetary day + Chaldean hour ruler (06:00/18:00 approximation) as a smaller secondary bias and label ("Hour of Venus · Friday"); soft score bias in `fetchDiscoverCandidates` (full on CuRRentSSsss, half on queue Discover) + time-weighted CuRRentSSsss seeds; library row that plays an on-device 30-track `timemix`. Console helper `ebblessTimeContext()`.

### algorithm-sliders: Sliders to steer recommendations
- **Status:** archived
- **Priority:** medium
- **Description:** UI sliders for the recommendation engine: Familiarity vs
  Discovery, Energy, Instrumental vs Vocal.
- **Touches:** Discover / Currents recommendation logic.
- **Branch:**
- **Notes:** Synced from Geethub issue #163.

### discover-pooled-affinity: Discover should read the crowd taste pool it already writes to
- **Status:** merged
- **Priority:** high
- **Description:** Every finished / liked / skipped Discover track already
  POSTs its tag pairs to the worker's `/pool/signal`, stored in the
  `TASTE_POOL` KV. The worker also exposes `GET /pool/affinity?tags=`, but
  nothing in `index.html` ever calls it - the crowd data is write-only and
  shapes no one's recommendations. Wire it in: in `fetchDiscoverCandidates`,
  fetch `/pool/affinity` for the seed tags (once per extension, in parallel
  with `fetchSimilar`/`fetchThisIsPlaylist`, fail silent to an empty result)
  and blend a pooled boost into `scoreCandidate` next to the local
  `graphBoostFor` / `graphConfidence` blend. The point: a brand-new listener
  with an empty local graph starts from what the crowd already knows, and
  the local graph takes over as it grows. Keep the pooled share modest and
  scaled by how much pooled data came back, so thin/noisy crowd data can't
  swamp Last.fm tag similarity. Check the `/pool/affinity` response shape in
  `worker/src/index.js` (`handlePoolAffinity`) and cache it if it isn't
  already, since it does a KV list + gets per tag.
- **Touches:** index.html Discover scoring (`fetchDiscoverCandidates`,
  `scoreCandidate`, local listening graph section); possibly
  `worker/src/index.js` `handlePoolAffinity` (caching) + worker redeploy.
- **Branch:** agent/discover-pooled-affinity (merged, worker deployed)
- **Notes:** Found while answering "is EBBLESS learning?" (2026-09-23).
  Local per-browser learning works; the pooled half is collected but unused.

### tag-all-tracks-for-learning: Learn from every track, not just Discover picks
- **Status:** merged
- **Priority:** medium
- **Description:** `recordListenSignal` only learns from tracks that carry
  `.tags`, and only Discover-origin tracks get tags (from `/similar`). So
  finishing, liking, or skipping a track from a pasted Spotify / YouTube /
  SoundCloud / Apple Music playlist teaches the taste graph nothing - which
  is most of what people actually play. Fetch Last.fm tags lazily for a
  regular track the first time a signal fires on it (or on play start),
  cache them on the track / in localStorage keyed by title+artist so each
  track is looked up once ever, then run the same `recordListenSignal`
  path. Must stay fire-and-forget: never delay playback, skip, or like on a
  tag lookup. Reuse an existing worker endpoint if one returns track tags
  (`/similar` returns `seedTags`); only add a lighter tags-only endpoint if
  that proves too heavy.
- **Touches:** index.html `recordListenSignal` and its three call sites
  (track end in `onDeckStateChange`, `toggleLikeTrack`, `recordSkipIfEarly`);
  possibly a new worker route.
- **Branch:** agent/tag-all-tracks-for-learning (merged, worker deployed)
- **Notes:** Found while answering "is EBBLESS learning?" (2026-09-23).
  Pairs with `discover-pooled-affinity` (more signals make the pool useful
  faster) - both land near the Discover section of index.html, so run them
  one after the other, not in parallel, to avoid a merge conflict.

### soundcloud-crossfade-cut: Crossfade between two SoundCloud tracks likely cuts instead of fading
- **Status:** merged
- **Priority:** medium
- **Description:** SoundCloud only lets one embedded widget play at a
  time, so when crossfade starts the incoming SoundCloud deck, the outgoing
  one is probably paused instantly - a hard cut instead of a fade. Confirm
  and find a way to overlap them (e.g. stream one via a different method).
- **Touches:** crossfade engine, SoundCloud deck adapter.
- **Branch:**
- **Notes:** Found by the `bld-background-tab-autoadvance` lane
  2026-09-23, not user-reported yet.
  Addressed on branch agent/bld-playback-glitch: confirmed SoundCloud allows only one playing widget, so SC-to-SC crossfade is skipped (play to end, then auto-advance) instead of cutting. True overlap is not possible. Close as merged when that branch ships.

### relink-candidate-list: "Replace link" should show a full results list like the initial paste
- **Status:** merged
- **Priority:** medium
- **Description:** The per-track replace/refresh-link option should show a
  proper list of candidate results, the same way pasting a link does on
  first load, instead of the current limited choices.
- **Touches:** `track-relink-menu`, `#relinkCandidates`, paste-bar results UI.
- **Branch:** agent/relink-candidate-list
- **Notes:** Synced from Geethub issue #176 (title only). Overlaps
  `relink-soundcloud-suggestions` (same menu) - likely best built in the
  same lane.
  Added 2026-09-23: after a refresh/replace, still try to pull the track's
  album art from Spotify; use the new link's thumbnail only if that fails.

### desktop-library-bg-video-fixed: Library background video shouldn't scroll on desktop
- **Status:** merged
- **Priority:** medium
- **Description:** On desktop, the Library's background video scrolls away
  with the list. It should stay fixed in place while the list scrolls over it.
- **Touches:** Library view background video CSS.
- **Branch:** agent/desktop-library-bg-video-fixed
- **Notes:** Synced from Geethub issue #175 (title only).

### touch-landscape-rotate-lock: "Rotate your device" overlay blocks touch devices in landscape
- **Status:** merged
- **Priority:** medium
- **Description:** On a touch device at 1280x800 landscape (e.g. an iPad or
  touchscreen laptop), the full-screen "rotate your device" overlay covers
  the whole app, so it may be unusable there.
- **Touches:** `#rotate-lock`.
- **Branch:** agent/touch-landscape-rotate-lock
- **Notes:** Found by the `queue-3dot-menu-desktop` lane 2026-09-23 in
  headless touch emulation, not user-reported yet.

### pause-fade-cap: Cap the pause fade-out at a short fixed length
- **Status:** merged
- **Priority:** medium
- **Description:** Pausing fades out for too long. Cap the pause fade at a short duration regardless of the crossfade setting.
- **Touches:** pause fade-out logic (follow-up to merged `pause-fade-out`).
- **Branch:** agent/pause-fade-cap
- **Notes:** Synced from Geethub issue #177.

### cymatics-icon-morph: Cymatics button icon should morph between 3 cymatics shapes
- **Status:** merged
- **Priority:** low
- **Description:** The cymatics mode button icon should be a 3-phase cymatics form that fades between shapes, 3 full cycles per minute.
- **Touches:** visual-style buttons (cymatics icon).
- **Branch:** agent/cymatics-icon-morph
- **Notes:** Synced from Geethub issue #178.

### mobile-queue-icon-highlight: Mobile: only the queue icon should be lit while the queue is open
- **Status:** merged
- **Priority:** medium
- **Description:** On mobile, when the queue is open, the queue icon should be the only highlighted nav icon.
- **Touches:** mobile footer nav active states.
- **Branch:** agent/mobile-queue-icon-highlight
- **Notes:** Synced from Geethub issue #179. Fix (`85a75a9`): `setView()`
  keeps `.is-active` on the Library/Player footer button while
  `openQueuePanel()` also lights Queue, so both lit. Added one CSS rule
  dimming the view button while `body.queue-open`; its class is untouched,
  so it relights on close. CSS only, no-op at >=860px (footer nav hidden).

### swipe-track-animation: Mobile: animate swipe-to-change-track
- **Status:** merged
- **Priority:** low
- **Description:** Swiping left/right to change songs should animate. Must feel unique to EBBLESS, flowy, nothing like Spotify/iTunes/macOS, and light on memory even with rapid repeated swipes.
- **Touches:** album-art swipe nav (see merged `album-art-swipe-nav`).
- **Branch:** agent/swipe-track-animation
- **Notes:** Synced from Geethub issue #180.

### footer-title-marquee: Mobile footer player: long titles should scroll like a marquee
- **Status:** merged
- **Priority:** low
- **Description:** In the mobile footer player, titles too long to fit should scroll as a marquee.
- **Touches:** mobile footer player title.
- **Branch:** agent/footer-title-marquee
- **Notes:** Synced from Geethub issue #181.
  Fix (`3764918`): the mini-bar already used `setMarqueeText()`, but it's
  `display:none` while the full player is open, so a track change there
  measured 0px overflow and never re-checked. Added one lazy shared
  ResizeObserver that re-measures marquees when their width changes (also
  covers resize/rotation), reduced-motion opt-out with an ellipsis, and a
  soft edge fade on the mini-bar only. Shared function, so the other
  marquee titles gain the resize re-check + ellipsis too. Real playback,
  swipe gestures, desktop mini-bar, and Safari mask untested.
  Follow-up check: horizontal/vertical touch swipes across the footer
  behave identically on main and this branch (swipe-right to Player is
  pre-existing), marquee keeps running through them, tap still opens the
  player. Desktop: the in-page mini-bar only shows in Settings view and
  marquees only if the title overflows; the Picture-in-Picture mini-player
  is a separate document with its own ellipsis CSS, untouched. Safari:
  ResizeObserver (13.1+) and prefixed `-webkit-mask-image` are supported;
  not run in WebKit (not available in sandbox).

### mobile-fullscreen-art-slide: Mobile fullscreen: art should slide to center when UI appears
- **Status:** merged
- **Priority:** low
- **Description:** In mobile fullscreen, when the screen is tapped and the UI pops up, the record/cassette/album art should slide up to sit centered between the lower player UI and the visual-style buttons at the top.
- **Touches:** mobile fullscreen layout; related to `fullscreen-vertical-centering-nav-row`.
- **Branch:** agent/mobile-fullscreen-art-slide
- **Notes:** Synced from Geethub issue #184.
  Fix (`58ee0e4`): `syncFlowArtSlide()` measures `.flow-top`/`.flow-bottom`
  live and translates (scales only if needed) `#flowArtWrap` to the middle
  of the gap while chrome shows; back to viewport-center when idle. 600ms
  slide, snaps on open, none under reduced motion. Portrait <1150px only;
  cymatics and landscape excluded. Real devices/long wrapping titles untested.

### conversational-vibe-search: Search by typing or speaking a mood/vibe to get a playlist
- **Status:** merged
- **Priority:** medium
- **Description:** Let users type conversationally (like talking to an LLM) or speak a sentence into the search bar describing their mood, vibe or environment, and get back a playlist of existing songs that fit. Needs a free tool or LLM working silently in the background to interpret the request.
- **Touches:** search bar / paste bar, discovery backend (worker). Follow-on to merged `playlist-vibe-search`.
- **Branch:** agent/conversational-vibe-search
- **Notes:** Synced from Geethub issue #185, #186.
  **Built:** worker `/vibe-interpret` (Workers AI llama-3.1-8b-instruct-fast, Last.fm-verified picks, heuristic fallback, `AI` binding in wrangler.toml) + bar sentence detection, mic (Web Speech), results screen. Cover art fix (061c3dc): `/spotifyart` now iTunes + Deezer in parallel, Last.fm fallback. Production worker deployed 2026-09-30 (by owner). No sound verified in sandbox (YouTube blocked) - real-device check.


### clear-playlists-hold-button: "Delete all playlists" should be a press-and-hold button
- **Status:** merged
- **Priority:** low
- **Description:** Replace the delete-all-playlists confirm with a hold-to-confirm button (reference: reactbits.dev/micro/hold-button).
- **Touches:** Settings clear-playlists control (follow-up to merged `clear-playlists-confirm`).
- **Branch:** agent/clear-playlists-hold-button
- **Notes:** Synced from Geethub issue #189. Pushed (commit `9fbd2cb`):
  `#clearLibraryBtn` is now `.btn-danger.btn-hold` ("Hold to clear
  playlists"), 1600ms fill sweep (`CLEAR_HOLD_MS` must match the CSS),
  early release retracts. Pointer + Space/Enter hold, long-press menu
  blocked, reduced-motion fades instead. Same delete logic and toast.
  Removed the old danger confirm modal (`openDangerModal`/`closeDangerModal`);
  `#danger-scrim` kept for the feedback form. Verified short press/early
  release/leave don't delete and full hold does (scripted pointer + keyboard,
  375px width). Mid-sweep visuals and real-device touch/haptics unchecked.

### mobile-resume-pause-regression: Mobile: returning from another app pauses and resets progress
- **Status:** merged
- **Priority:** high
- **Description:** On mobile, switching to another app and back pauses the track and restarts the player progress. Playback and position should survive the app switch.
- **Touches:** visibility/resume handling (see merged `mobile-background-resume`, `instant-resume-caching`).
- **Branch:** agent/mobile-resume-pause-regression
- **Notes:** Synced from Geethub issue #190.

### mobile-library-tap-closes-playlist: Mobile: tapping Library should close an open playlist
- **Status:** merged
- **Priority:** low
- **Description:** On mobile, with a playlist open, tapping the Library nav button should close the playlist and show the library.
- **Touches:** mobile nav / playlist panel.
- **Branch:** agent/mobile-library-tap-closes-playlist
- **Notes:** Synced from Geethub issue #191.

### first-run-paste-guide: First-run pop-up guiding new users to paste a playlist
- **Status:** merged
- **Priority:** medium
- **Description:** If the user has no playlists loaded, show a pop-up that points them in the UI to their first step: paste a playlist.
- **Touches:** empty-library state, paste bar.
- **Branch:** agent/first-run-paste-guide
- **Notes:** Synced from Geethub issue #193.

### discover-mood-matching: Use free BPM/key/energy lookups to improve mood matching
- **Status:** merged
- **Priority:** low
- **Description:** Improve Discover and mood search using free online track-metric sources (Chosic BPM & Key Finder, Musicstax, SongBPM) for BPM, key, time signature and energy.
- **Touches:** Discover backend (worker).
- **Branch:** agent/discover-mood-matching
- **Notes:** Synced from Geethub issue #194.

  Built on branch (commit `9c98c1e`): new worker `POST /metrics` merging
  GetSongBPM (only if `GETSONGBPM_API_KEY` secret set; needs a visible
  backlink per its terms; sole source of key/time sig), ReccoBeats
  (tempo/energy/danceability/valence via Deezer ISRC) and Deezer (BPM).
  Chosic/Musicstax/SongBPM/Tunebat rejected (no API, scraping only).
  Discover nudges candidates by BPM (half/double ok), Camelot key, energy,
  valence; max +/-0.08, no-op without data; 1.8s client timeout. All
  sources unreachable from sandbox - mock-tested only. Needs worker deploy.


### discover-long-track-weighting: Discover should rarely serve very long tracks
- **Status:** merged
- **Priority:** medium
- **Description:** Quiet duration hierarchy for automatic Discover: 0-15 min normal; 15-45 min allowed but increasingly selective; 45-90 min occasional outlier only on a strong match; 90+ min very selective; 2+ hours essentially excluded. Do not ban them (explicit searches still work). Long tracks should never come first; only later in the queue once the listener has been going a while.
- **Touches:** Discover candidate scoring.
- **Branch:** agent/discover-long-track-weighting
- **Notes:** Synced from Geethub issue #196.

### geethub-open-closed-tracking: Geethub: synced ideas shouldn't look "closed" before they ship
- **Status:** merged
- **Priority:** medium
- **Description:** Synced ideas get closed on GitHub before they are built or deployed, so when writing a new issue you can't tell if something is already done. Keep issues open (or clearly labeled) until they actually ship.
- **Touches:** Geethub workflow only (manager auto-close rule + existing `waiting-for-deployment`/`completed` labels) - no app code.
- **Branch:** n/a — workflow/doc change only, no code lane
- **Notes:** Synced from Geethub issue #197.
  Done directly in this file: the intake section now keeps synced issues
  open, labels them `waiting-for-deployment` once built, and closes them
  (labeled `completed`) only when deployed. Resolves the open tension
  flagged in `github-issues-status-tabs`. Applies to newly synced issues
  going forward; already-closed issues were left as they are.


### discover-randomness: Discover should vary its picks each time for the same song
- **Status:** merged
- **Priority:** medium
- **Description:** Discover should not produce the same queue every time from the same seed song. Each run should feel unique.
- **Touches:** Discover candidate selection.
- **Branch:** agent/discover-randomness
- **Notes:** Synced from Geethub issue #199.
  Fix (`99ce3b5`): the pool per seed is fixed (worker caches `/similar`,
  scoring is deterministic) and was walked top-down, so the queue was
  identical every run. Now `discoverSampleOrder()` walks it in a
  score-weighted random order (weight `exp((score-top)/0.15)`), and picks
  already served for the same seed (new `ebbless:discoverRecent` LS key,
  36/seed, 80 seeds) get weight x0.15. All filters unchanged. Mock harness:
  20/20 runs differ, 0 filter violations, top matches still picked
  85-100%. Real-network variety untested; raise the 0.15 temperature if
  it still feels samey.
  Follow-up (`42991dc`): sim on a Last.fm-shaped pool (50 candidates,
  scores 0.88 -> 0.27) showed 0.15 drifting to ~2.6/6 top-15 picks on
  repeat runs of one seed; lowered temperature to 0.1 (~3.5/6, still 20/20
  distinct runs, ~1.4/6 overlap with the previous run). Live data still
  unverified - sandbox network blocks the worker/Last.fm.

### tester-report-no-github: Bug reporting for testers without a GitHub login
- **Status:** merged
- **Priority:** medium
- **Description:** Testers reporting bugs should not need a GitHub account, and should not be able to touch the user's own task list. Needs a separate intake mechanism.
- **Touches:** Settings report-a-bug flow, maybe worker endpoint (see merged `tester-feedback-form`, `settings-bug-report-github-form`).
- **Branch:** agent/tester-report-no-github
- **Notes:** Synced from Geethub issue #200.

### android-ad-popup: An ad popped up during playback on a OnePlus 13R
- **Status:** merged
- **Priority:** high
- **Description:** User saw an ad pop up on a OnePlus 13R (Android). The app promises no ads; find where it came from (likely the embedded YouTube player) and suppress it.
- **Touches:** YouTube player embed / playback on Android.
- **Branch:** `agent/android-ad-popup`
- **Notes:** Synced from Geethub issue #201.

  Fixed on branch (commit `2c70f40`): ad came from the hidden YouTube
  embed (heard, not seen). Ad check only ran at load, so long pre-rolls
  unmuted after the 20s cap and mid-rolls were never caught. New
  `deckShowsAd()` compares player duration to the matched video length;
  `guardActiveDeckAd()` (in `updateSeekUI`) keeps the deck muted during
  ads and pauses seek/lyrics/crossfade, with a 2 min give-up. Ads still
  play silently; the OS media notification may briefly show ad info.

### album-art-consistent-per-album: Tracks from one album show different cover art
- **Status:** merged
- **Priority:** medium
- **Description:** All tracks from the same album should show that album's art. Repro: https://open.spotify.com/album/7utDnqKdc3HiSx54MSaGSc
- **Touches:** album art lookup (Spotify art).
- **Branch:** `agent/album-art-consistent-per-album`
- **Notes:** Synced from Geethub issue #202.

  Fixed on branch (commit `0c59569`, worker only): Spotify album embeds
  dropped `entity.coverArt`; cover now only in `visualIdentity.image`, so
  `/album` returned `image: null` and each track fell back to its own
  YouTube thumbnail. `handleEmbed` now falls back to the largest
  `visualIdentity` rendition. Needs a separate worker deploy. Cached album
  responses persist up to 6h; saved albums need "Refresh links" or re-paste.

### bld-playback-glitch: Breathe Love Deep playback always glitches
- **Status:** merged
- **Priority:** high
- **Description:** Breathe Love Deep playback always glitches. User asks whether uploading it to YouTube instead would help.
- **Touches:** SoundCloud native playback path (see merged `soundcloud-native-playback`, draft `soundcloud-crossfade-cut`).
- **Branch:** agent/bld-playback-glitch
- **Notes:** Synced from Geethub issue #203.

### desktop-grid-extra-row: Desktop panes shrink when an extra grid row appears after load
- **Status:** merged
- **Priority:** medium
- **Description:** On desktop (seen at 1440x900), a few seconds after load
  the layout grows an extra row at the bottom, and the Library, player and
  Queue panes shrink from full height (840px) to about 581px. The panes
  should stay full height.
- **Touches:** desktop split layout grid; `#flow-layer-orig`.
- **Branch:** agent/desktop-grid-extra-row
- **Notes:** Found by the `desktop-library-bg-video-fixed` lane 2026-09-29.
  Grid rows became `60px 581px 259px` with `#flow-layer-orig` landing in
  the third row. Happens with or without that lane's fix. Not user-reported
  yet.

### album-detection: Pasted albums should be treated as albums, not playlists
- **Status:** merged
- **Priority:** medium
- **Description:** When an album is added, categorize it as an album: the
  library's album filter should include it, its thumbnail should be the
  album art only (no 2x2 grid), and track matching should pull from the
  artist's YouTube "Topic" channel (avoid remixes; compare album art to
  the video thumbnail).
- **Touches:** `isAlbumType()`, library filter, playlist thumbnail/grid art,
  YouTube match selection.
- **Branch:** agent/album-detection
- **Notes:** Synced from Geethub issue #204. Related (merged):
  `breathe-love-deep-album` (SoundCloud album categorization),
  `album-art-2x2-grid-bug`, `link-match-accuracy`.

  Fixed on branch (commits `541265c` worker, `ad8d16f` page): YouTube Music
  album links (`OLAK5uy_` lists) and user-pasted SoundCloud album sets were
  saved as playlists, so tiles fell back to the 2x2 grid. New `yt_album`
  type, SC sets use worker `isAlbum`, one shared `libraryEntryForParsedLink()`
  mapping, album tiles never use the grid. Album tracks search with
  `album=` (worker keeps "<Artist> - Topic" uploads, drops unrequested
  remix/live/sped-up) plus new client `pickAlbumArtMatch` cover-vs-thumb
  check (depends on CORS; no-op if images can't be read). Needs a worker
  deploy for matching + SC album detection. RESOLVE_LOGIC_VERSION 7 (all
  playlists re-resolve once), SW v26. `browse/MPREb_` links still rejected.


### lp-needle-sfx-silent: LP needle-lift/drop sound not audible on pause/play
- **Status:** merged
- **Priority:** medium
- **Description:** In LP mode, the needle-lift sound on pause and needle-drop
  on play can't be heard. Find out why and make it audible.
- **Touches:** play/pause handlers for the record art style, `sfx/`.
- **Branch:** agent/lp-needle-sfx-silent
- **Notes:** Synced from Geethub issue #205. Regression/follow-up of
  `lp-needle-sfx` (merged). Possibly masked by `pause-fade-out`.

  Fixed on branch (commit `4db7fb5`): code path was sound (own gain, not
  hit by pause fade), but SFX were too quiet under full-volume music
  (vol drop 0.35->1, lift 0.2->0.5), the first press after load was dropped
  while buffers fetched (now prefetched + unlocked on first gesture), and
  iOS silent switch mutes Web Audio (`navigator.audioSession.type =
  'playback'`, untested on device). SW cache v25->v26. Still only plays
  while the record is visible (by design, `670a0ab`).


### change-art-apply-album: "Change art" should offer "apply to all tracks in this album"
- **Status:** merged
- **Priority:** medium
- **Description:** The change-art page should have a checkbox to apply the
  chosen art to every track in the same album. The option should not be
  shown when changing a playlist's art.
- **Touches:** track art picker / relink menu.
- **Branch:** agent/change-art-apply-album
- **Notes:** Synced from Geethub issue #206. Related:
  `album-art-consistent-per-album`, `playlist-image-reset`.
  **Built (2697f03):** app had no per-track art picker, so added "Change art"
  to the track menu (shared `openArtPicker` with the playlist picker) plus the
  "Apply to all tracks in <album>" checkbox (hidden for playlist art, no
  album, or 1-track album). Album = album-type library entry holding the
  track; applies to every title+artist match library-wide. Per-track
  `originalArt` keeps reset working; relink no longer overwrites hand-picked
  art. At merge, `albumForTrack` switched to `isAlbumEntry(p)` so manual
  album/playlist overrides count. SW v28.

### cassette-fullscreen-second-stack: Cassette fullscreen intro should do a second stack downward
- **Status:** merged
- **Priority:** medium
- **Description:** After the tapes stack upward and slide behind the center
  tape, repeat the same move downward toward the bottom of the screen and
  slide behind the center tape again. Only then start the orbiting tapes.
- **Touches:** cassette fullscreen animation.
- **Branch:** agent/cassette-fullscreen-second-stack
- **Notes:** Synced from Geethub issue #207. Extends
  `cassette-fullscreen-animation` (merged).
  **Built (eb3de82):** mirrored downward stack + slide-back after the upward
  one (0.4s gap), then the ring. Intro ~9-11s longer; check pacing and the
  mobile down stack vs. transport controls on a real device.

### settings-credits: Settings "Credits" button listing every service used, with links
- **Status:** merged
- **Priority:** medium
- **Description:** Add a Credits row to Settings > About that opens a dialog
  listing every outside service/data source EBBLESS uses, each linking to
  its homepage. Doubles as the visible getsongbpm.com backlink GetSongBPM's
  API terms require (replaces the one-line About credit from
  `discover-mood-matching`).
- **Touches:** Settings > About, `#credits-modal` (reuses `#danger-scrim`
  and the feedback modal's card look), `sw.js` cache v27.
- **Branch:** claude/kind-mayer-ebmyoe
- **Notes:** Requested in-session. Lists YouTube, SoundCloud, Spotify, Apple
  Music, GetSongBPM, ReccoBeats, Deezer, Last.fm, ListenBrainz,
  MusicBrainz, Cover Art Archive, LRCLIB, Cloudflare Workers, GitHub Pages,
  Sign in with Google. Update this list when a new service is added.

### currents-12-tracks: CuRRentSSsss playlist should load 12 tracks
- **Status:** merged
- **Priority:** medium
- **Description:** When CuRRentSSsss is built, it should end up with 12
  tracks (currently it tops up to a minimum of 8 via `CURRENTS_MIN_TRACKS`).
- **Touches:** Currents generation (`CURRENTS_MIN_TRACKS` and the slot
  top-up logic near it in `index.html`).
- **Branch:** agent/currents-12-tracks
- **Notes:** Synced from Geethub issue #208 (title only). Related (merged):
  `currents-playlist-algorithm`, `currents-add-reset-button`.
  **Built (c3b0ff1):** `CURRENTS_MIN_TRACKS` 8 -> 12, per-slot top-up 2 -> 3,
  "Add more" keeps its old 8 target (new `CURRENTS_MORE_TRACKS`). Aims for
  at least 12 (can still reach 14 with many saved playlists). Client-only.

### playlist-menu-album-toggle: Playlist menu option to mark something as a playlist or album
- **Status:** merged
- **Priority:** medium
- **Description:** The playlist 3-dot menu should let the user manually
  recategorize an entry as a playlist or an album, for when auto-detection
  gets it wrong. Switching should update the library filter and the tile art
  (album art only for albums, no 2x2 grid).
- **Touches:** playlist menu, `isAlbumType()` / library entry type, library
  filter, playlist thumbnail art.
- **Branch:** agent/playlist-menu-album-toggle
- **Notes:** Synced from Geethub issue #209. Manual override complementing
  the merged `album-detection` auto-categorization.
  **Built (6587e41):** "Mark as album / playlist" in a link-imported
  entry's 3-dot menu; stored as `albumOverride` on the entry, read via new
  `isAlbumEntry()` (library filter, sections, tile art, album-mode matching),
  kept across re-resolve. Not offered on CuRRentSSsss, Liked, `custom`.

### mini-player-polish: Mini-player branding, controls, remembered size/position
- **Status:** merged
- **Priority:** high
- **Description:** Polish the desktop mini-player: show the EBBLESS "E" logo
  instead of "malgriot.github.io"; marquee-scroll long title/artist; keep
  keyboard shortcuts working while the mini-player is focused; hide the
  "view site information" button; remember the user's position, style,
  shape and size for next time, plus a "reset shape" button; react on
  hover; give it every control the main player has; add a queue button
  whose menu drops down or pulls up depending on where the mini-player sits.
- **Touches:** desktop mini-player (Document Picture-in-Picture window) in
  `index.html`.
- **Branch:** agent/mini-player-polish
- **Notes:** Synced from Geethub issue #210. Follow-up to merged
  `desktop-mini-player` (and dropped `desktop-mini-player-reopen`) - new
  asks, not a duplicate. Some items (site-info button, origin label) may be
  browser chrome the page can't control; confirm per item when built.
  **Built (88041a9):** in-window E logo + PiP title/favicon; marquee (setMarqueeText made window-aware); shortcuts forwarded from PiP (Q = mini queue); saved size/style (`ebbless:miniPlayer`), bar/card by aspect; reset button; hover states; full controls; direction-aware queue. Impossible: origin text and site-info button (Chrome chrome); position is Chrome-managed. Needs real desktop Chrome check: window grow/moveBy for queue, placement memory.

### podcast-library-category: Podcast category in the library
- **Status:** merged
- **Priority:** high
- **Description:** Give podcasts their own category/filter in the library,
  alongside playlists and albums.
- **Touches:** library filter + sections, entry type detection.
- **Branch:** agent/podcast-library-category
- **Notes:** Synced from Geethub issue #211 (title only). Builds on merged
  `podcasts` and `playlist-menu-album-toggle`.
  **Built (e8fd1bb):** new `isPodcastEntry()` (`pod_show` type / `pod:` id, fallback: all tracks are episodes); Podcasts filter chip + cycle step (shown only when a podcast exists), Podcasts section, show art, "N episodes" count; "Mark as album" hidden for podcasts.

### settings-reorganize: Reorganize the Settings menu for comfort and logic
- **Status:** merged
- **Priority:** high
- **Description:** Regroup and reorder the Settings menu so related options
  sit together and the most-used ones are easiest to reach.
- **Touches:** Settings view markup/CSS in `index.html`.
- **Branch:** agent/settings-reorganize
- **Notes:** Synced from Geethub issue #212 (title only). Touches the same
  view as many merged Settings entries (install, share, credits, bug report).
  **Built (b54d82b):** Settings regrouped into Playback / App / Feedback & support / About / Library & data (was Danger zone). Same ids and handlers; install row now a row in App; onboarding CSS retargeted to `#settingsAboutBlock`.

### autoadvance-stall-full-progress: Next track sometimes stalls with a full progress bar
- **Status:** merged
- **Priority:** high
- **Description:** Sometimes when a song ends and the player should move to
  the next one, it switches to the next track's art and UI colors but
  doesn't play: it sits paused, with the progress bar already shown as full
  as if that song had finished. The next track should start playing from 0
  with its progress bar reset.
- **Touches:** track-end / auto-advance handling, progress bar state.
- **Branch:** agent/autoadvance-stall-full-progress
- **Notes:** Synced from Geethub issue #213 (bug). Related to merged
  `bld-background-tab-autoadvance`, but a different symptom (advances the UI
  and stalls, stale progress), so not a duplicate. No repro steps given.
  **Built (65adcce):** preloaded next track is rewound to 0 on handoff (`promoteDeckDirect`, `deck.resumeSeeked` protects saved-position resume); progress bar/time/reels reset on every track change (`resetSeekUI`); bar held at 0 until the new track's ad check passes. Needs real-device check of background/locked-phone auto-advance.

### library-filter-inline: Put the All/Playlist/Album/Podcast filter on the button row
- **Status:** merged
- **Priority:** medium
- **Description:** In the library, the All/Playlist/Album/Podcast filter
  button should sit on the same line as the other library buttons below it,
  placed after "New playlist", instead of on its own line.
- **Touches:** library header/toolbar layout.
- **Branch:** agent/library-filter-inline
- **Notes:** Synced from Geethub issue #214. Filter chips come from merged
  `podcast-library-category` / `playlist-menu-album-toggle`.
  **Built (e5345a6):** `#libFilter`/`#libFilterCycle` moved into `.lib-head-actions` after `#newPlaylistBtn`; "+ New playlist" shortens to "+ New" below 370px and in the desktop library column. Margins are tight at 320px.

### cassette-reference-match: Rebuild the cassette to match a real reference cassette
- **Status:** merged
- **Priority:** medium
- **Description:** Upgrade the existing cassette art style to closely match
  a reference photo of a real cassette (dark charcoal textured shell,
  chamfered recessed label, two reels, central tape window, four corner
  screws, detailed lower openings). Keep album art as the label and all
  existing playback behavior. Suggested approach: one optimized static
  shell image + album-art label layer + small CSS/SVG spinning reels tied to
  play/pause (respecting reduced motion). No canvas/WebGL/video.
- **Touches:** cassette art style (miniplayer + fullscreen cassette).
- **Branch:** agent/cassette-reference-match
- **Notes:** Synced from Geethub issue #215 - full brief, reference image
  and app screenshot links are in the issue body. Follow-up to merged
  `cassette-beautification` (new ask, not a duplicate): that pass was
  CSS-drawn; this asks for a reference-accurate, asset-based shell.

  **Built (4aa5daf):** cassette inline SVG redrawn in place (charcoal grain shell, chamfered label with album art, ivory hubs, tape window, lower panel with holes, 4 screws); same 400x256 frame so fullscreen/stack/crossfade/reels unchanged. Reference photo was unreachable from the sandbox - compare against it.

### ytvideo-lookup-broken: Backend YouTube video lookup says "not found" for real videos
- **Status:** merged
- **Priority:** high
- **Description:** The worker's `/ytvideo?id=` route returns
  `{"error":"video not found (private, deleted, or invalid link?)"}` for
  normal public videos (e.g. `lbjZPFBD6JU` Norah Jones "Come Away With Me",
  `-2u7PWUWcJM`, `BqqPgA-yuuc`) on both production and staging; only a
  likely-cached `dQw4w9WgXcQ` still resolves. `/search` still works.
  Likely YouTube now serving a bot-check/consent page to Cloudflare's
  egress IPs for the watch-page scrape (`handleYtVideo` ->
  `fetchYouTubePage`), so `videoDetails` is missing. Find the cause and a
  robust source (e.g. oEmbed for title/author, a different page or
  endpoint for duration/loudness), with graceful fallback.
- **Touches:** worker `handleYtVideo` / `fetchYouTubePage`; client callers
  of `/ytvideo` (pasting a YouTube link - `youtube-link-paste-play`;
  loudness for `volume-equalizer`).
- **Branch:** agent/ytvideo-lookup-broken
- **Build (b1dff89):** intermittent (~30-40% of uncached lookups got a watch page with no `videoDetails`; cause inferred, not captured). `handleYtVideo` now retries the watch page once, then falls back to oEmbed (title/channel/thumb, `loudnessDb: null`, `partial: true`, cached 1h); failure reasons are logged. Client `ensureLoudness` skips caching partial responses. SW v37. Worker deployed to staging + prod 2026-09-30.
- **Notes:** Found 2026-09-30 while checking vibe-search playback. Not
  caused by that change. Confirm what breaks for users on the live app.

### library-search-toggle: Library search should be a magnifying-glass button
- **Status:** merged
- **Priority:** medium
- **Description:** Replace the always-visible "Search your library" box
  with a magnifying-glass icon button aligned with the other library header
  buttons; tapping it toggles the search box open/closed as a drop-down.
- **Touches:** library header, `#libSearch` / `#libSearchClear`.
- **Branch:** agent/library-search-toggle
- **Build (2c76afc):** `#libSearchToggle` in `.lib-head-actions` opens/closes `#libSearchBox`; closing clears the query; Esc on empty closes. "+ New playlist" shortens to "+ New" below 402px (was 370px) so the row fits. SW v36.
- **Notes:** Synced from Geethub issue #218.

### hour-currents: Replace the time-of-day row with Currents growing 7 tracks per hour phase
- **Status:** merged
- **Priority:** medium
- **Description:** Remove the time-of-day / planetary-hour row (button and
  its whole container) and use its mood-of-the-hour selection to feed
  CuRRentSSsss instead: add 7 tracks at each of the 7 Rosicrucian-clock
  phase changes from midnight to midnight, ending the day at 49 tracks
  instead of 12. Every midnight, reset and start again with 7. Don't show
  users what drives the picks.
- **Touches:** `#timeRow*` (from merged `contextual-awareness`), Currents
  generation (`currents-playlist-algorithm`, `currents-12-tracks`).
- **Branch:** agent/hour-currents
- **Decision (2026-09-30, owner):** 7 equal blocks per day (24h / 7, about 3h25m43s each) starting at local midnight, each block's mood taken from the Rosicrucian daily cycles (the seven periods of the day). Not the 24 planetary hours.
- **Build (d0a099d):** time-of-day row and timemix code removed (`getTimeContext()` kept for Queue Discover at half strength). Shared `rosicrucianPeriod()` (color output unchanged). CuRRentSSsss: 7 at midnight, +7 per period to 49, mid-day catch-up, stable on reload (`ebbless:swellBlocks`), appends never interrupt playback; `refreshSwellIfDue()` polls every 60s. Mood per period follows its letter (A-G) via `PERIOD_MOODS`, qualities taken from CYCLES-OF-LIFE-APP `letters.ts`. "Reset with fresh picks" re-rolls today's due drops; "Add more" still adds 8. SW v40.
- **Notes:** Synced from Geethub issue #219 ("hour of the moon playlist").
  The current code treats each planetary hour as one clock hour (24 a day);
  "7 phases a day" needs defining before build.

### vibe-search-named-playlists: Vibe search should compile a named playlist of heard + new songs
- **Status:** merged
- **Priority:** medium
- **Description:** When someone searches a vibe, compile an actual
  playlist for it with a short, unique, intelligent name (one or a few
  words distilled from what they typed), mixing songs they've already heard
  with new discoveries that fit the mood.
- **Touches:** vibe search flow (follow-up to merged
  `conversational-vibe-search`), worker.
- **Branch:** agent/vibe-search-named-playlists
- **Build (0510ddc):** results now blend ~30% songs the listener knows (liked, history, saved playlists; tag-matched to the vibe; every third slot, "you know this") with new finds; 1-3 word distilled, collision-free names (`vibePlaylistName()`); main button "Save & play" saves a real playlist, "Just play N songs" keeps the unsaved play. Worker prompt tightened, `VIBE_CACHE_VERSION` v3. SW v38. Worker deployed 2026-09-30. Blend not yet seen with a real library; playback untested.
- **Notes:** Synced from Geethub issue #220. Check what the shipped
  version already does before building; may be a partial gap only.

### platform-compliance-audit: Spotify attribution + YouTube player compliance audit
- **Status:** merged
- **Priority:** medium
- **Description:** Audit how Spotify metadata, YouTube playback, the visual
  field, Credits, lyrics and album art interact; report must-fix /
  recommended / already-fine against current Spotify and YouTube developer
  terms; then implement: Spotify attribution in Credits linking to the
  current track on Spotify (updates per track, no raw URLs, no big
  branding); a fourth "YouTube" control beside Lyrics / Sync / Album Art
  opening the real, unobscured YouTube embed in a panel/sheet; any needed
  fixes to the hidden-player architecture; license docs for EBBLESS-owned
  ambient audio. Constraints: no Spotify playback, no audio-reactive
  cymatics (visuals only slow on pause), no overlays on the YouTube player,
  no redesign, no Spotify-based trivia.
- **Touches:** player controls row, YouTube embed, Credits modal, docs.
- **Branch:** agent/platform-compliance-audit
- **Build (65269b4):** audit + compliance list in `docs/PLATFORM-AUDIT.md`; license log in `docs/AUDIO-LICENSES.md`. Credits Spotify row links the current track ("Listen to ... on Spotify"; falls back to album/playlist link; worker now returns `spotifyId`). Fourth "YouTube" tab (`#ytPanelBtn`) opens `#yt-modal` showing the real playing YouTube player (16:9, min 200px tall, nothing overlaid); disabled/dimmed (not hidden) when the track has no working YouTube video (no id, SoundCloud/podcast, casting, embed error), closes if the track loses it (owner follow-up). SW v39. Worker deployed to prod 2026-09-30.
- **Owner decision 2026-09-30:** YouTube must-fix 1-5 -> option D, accept the risk for the small beta; keep the hidden player, ad muting and preload as they are. Revisit before any wider launch.
- **Open owner decisions (from audit, nothing changed):** ~~YouTube must-fix 1-5~~ (decided: D) (hidden 1x1 player used for audio, muting through ads, parallel muted autoplay preload, scraping YouTube pages): options A visible player / B drop ad-muting + preload / C YouTube Data API / D accept risk for small beta. Spotify item 6 (Developer Policy III.5 / scraping embed pages): product positioning. Item 8: altered Spotify cover art in record/cassette/blurred styles. Item 7: small "Listen on Spotify" near the title? ~~Sound licenses~~ (resolved: all EBBLESS sounds are original MAL GRIOT work, metadata stripped).
- **Notes:** Synced from Geethub issue #221 (full brief there). Its YouTube
  control supersedes `video-playback-option`. Also sets rules for
  `ebbless-deep`: paid value must be EBBLESS-owned (skins, visuals, themes,
  original ambient audio), never third-party playback; external sounds
  need recorded source + license.

### cassette-rewind-sfx: Cassette rewind sound when restarting a song
- **Status:** merged
- **Priority:** medium
- **Description:** When the Cassette art style is active and the user
  restarts the current song (prev pressed past the restart threshold, or
  any other "back to start of this track" action), play
  `sfx/cassette-rewind.mp3`. Not on skip-next and not when going to the
  previous song.
- **Touches:** mirror the LP needle sfx block (`LP_NEEDLE_*`); prev/restart
  handling; `sw.js` cache list + version bump.
- **Branch:** agent/cassette-rewind-sfx
- **Build (09c0e9b):** plays on every playPrev() restart (current time > 3s, or a one-track repeat wrap) when the cassette is on screen; reuses the needle sfx audio path at volume 0.6; SW v35. Not heard in a real browser yet.
- **Notes:** Requested in-session 2026-09-30. Original MAL GRIOT sound
  (all file metadata stripped).

### currents-reload-reroll: CuRRentSSsss menu re-roll: all songs, max 2 a day, "like first" prompt
- **Status:** merged
- **Priority:** medium
- **Description:** Follow-up to `hour-currents`. Reloading keeps the list
  as built (7 per period). The CuRRentSSsss playlist menu's re-roll
  ("Reset with fresh picks") replaces all of today's songs, limited to 2
  re-rolls per day. Before re-rolling, a prompt tells them to like the
  songs they want to keep or add them to playlists.
- **Touches:** `refreshSwellIfDue()`, `ebbless:swellBlocks`, launch flow,
  CuRRentSSsss "Reset with fresh picks" menu item.
- **Branch:** agent/currents-reload-reroll
- **Build (352a9fc):** "Reset with fresh picks" opens `#reroll-modal` ("Re-roll all of today's CuRRentSSsss?" / like or add to a playlist first; Cancel focused). Re-roll rebuilds every due period, avoids the replaced tracks, keeps a playing track at slot 0. `CURRENTS_REROLLS_PER_DAY = 2` (stored as `rerolls` in `ebbless:swellBlocks`, counts only when picks land); when spent the item reads "No re-rolls left today". Reload never re-rolls. SW v41. Full menu path verified by harness only.
- **Notes:** Owner request 2026-09-30.


### desktop-fs-slide-panels: Browser-fullscreen should slide Library/Queue in place, and close an open playlist with the Library
- **Status:** merged
- **Priority:** medium
- **Description:** Two related problems in the first (in-browser, not
  whole-screen) fullscreen phase on desktop:
  1. Bug: if a playlist panel is open when you enter fullscreen, the
     Library and Queue close but the playlist panel stays open. Whenever
     the Library closes, any open playlist panel should close with it.
  2. In that first fullscreen phase, toggling Queue or Library (button or
     shortcut) should stay in fullscreen and just slide the panel in/out,
     instead of exiting to the main view first.
- **Touches:** desktop fullscreen (`toggleDesktopFs*` / `.desktop-fs-*`
  CSS), the shared "exit fullscreen then open menu" path added by
  `keyboard-shortcuts-2`, playlist panel open/close.
- **Branch:** agent/desktop-fs-slide-panels
- **Build (68f1f48):** New `deskFsPhase1()` (desk-fs open, no flow/lyrics-fs/Settings on top). In phase 1 the Library/Queue nav buttons and p/l/q shortcuts call new `toggleDesktopFsLib()`/`toggleDesktopFsQueue()` (slide drawers, stay in fullscreen); everywhere else keeps the `leaveFullscreen(true)` path. Entering desk-fs and closing the library drawer both call `closeLibraryPlaylistPanel()`; opening a playlist in phase 1 slides the library drawer in first. Manager smoke test could not reach desk-fs without a loaded track (YouTube blocked in the container) - needs a real-browser check.
- **Notes:** Synced from Geethub issues #227 (bug) and #225 (idea), combined
  since both describe phase-1 fullscreen panel behavior. Item 2 partly
  reverses `keyboard-shortcuts-2`'s "menus exit fullscreen first" rule —
  for phase 1 only; the immersive (whole-screen) phase keeps current
  behavior unless told otherwise. Builds on `desktop-player-fullscreen-toggle`.

### shortcuts-zxcv-visuals: Remap visual-mode shortcuts to Z / X / C / V
- **Status:** merged
- **Priority:** medium
- **Description:** Visual-mode shortcuts should sit in a row: Z = Art,
  X = Cymatics, C = Lyrics, V = Video.
- **Touches:** global keydown handler, shortcut help/listing.
- **Branch:** agent/shortcuts-zxcv-visuals
- **Build (8de903c):** Keydown handler: Z = art (first press shows art, then cycles default/record/cassette - old T), X = cymatics, C = lyrics (press again -> art), V = toggle YouTube card (no-op when its tab is disabled), K = shuffle; T/Y/U unbound. `kbSetVisual` closes an open YouTube card first; the card's own keydown lets V close it and Z/X/C through. Ctrl/Cmd combos and typing in inputs untouched. No user-facing shortcut docs exist to update.
- **Notes:** Synced from Geethub issue #222. Conflicts with
  `keyboard-shortcuts-2`: "x" is currently shuffle (and "y"/"u" are
  cymatics/lyrics, "t" cycles art phases). Needs a decision on where
  shuffle moves and whether y/u/t stay as aliases before building. Owner decision 2026-10-01: shuffle moves to K; Z/X/C/V replace T/Y/U (no aliases). V toggles the YouTube video panel (`#ytPanelBtn`, the 4th album-art tab next to Lyrics) per owner.

### cassette-cycle-7-tapes: Cassette cycling animation should use 7 tapes, not 6
- **Status:** merged
- **Priority:** medium
- **Description:** The cassette fullscreen cycling/orbit animation shows 6
  tapes; it should show 7.
- **Touches:** cassette fullscreen stack/orbit animation.
- **Branch:** agent/cassette-cycle-7-tapes
- **Build (1857b8a):** `csStackBuild()` now always uses 7 copies on desktop (was `max(6, gap-derived)`, so 6 on most screens); mobile keeps the gap-sized 3-10 stack.
- **Notes:** Synced from Geethub issue #223. Related to merged
  `cassette-fullscreen-animation` / `cassette-fullscreen-second-stack`.

### library-icon-redesign: Library icon should replace the queue icon, with a more distinct themed design
- **Status:** merged
- **Priority:** medium
- **Description:** The Library button should use a new, more distinct icon
  that still fits the EBBLESS theme, and it should take the place currently
  used by the queue icon.
- **Touches:** nav/header icons (Library, Queue).
- **Branch:** agent/library-icon-redesign
- **Build (7c67070):** New Library glyph: a stack of record sleeves (front sleeve with a vinyl cutout, two offset sleeve edges behind). Queue now uses the old Library list-and-note glyph; the old near-identical Queue path is gone. 8 SVGs swapped: #topnav, #bottom-nav, flow fs-nav, lyrics fs-nav (Library + Queue each). No CSS/JS changes.
- **Notes:** Synced from Geethub issue #224 (title only, no description).
  Unclear what the Queue button gets instead — confirm before building. Owner decision 2026-10-01: Queue button takes the current Library glyph; Library gets a new distinct themed icon; positions unchanged.

### regional-source-alternatives: Regional alternatives where YouTube is blocked (e.g. Russia)
- **Status:** merged
- **Priority:** medium
- **Description:** YouTube is restricted in some countries (e.g. Russia).
  Research and list regional playback alternatives (e.g. Yandex Music, VK)
  so EBBLESS keeps working everywhere, and consider translating track
  metadata for matching.
- **Touches:** playback source resolution / worker search; possibly i18n.
- **Branch:** agent/regional-source-alternatives
- **Build (336d2e7):** `docs/REGIONAL-SOURCES.md` (research only, no app code). Key findings: in Russia YouTube, SoundCloud and Spotify are all blocked and Cloudflare (the worker) is throttled, so a new source alone does not fix it; regional services mostly lack public embed/playback APIs. Recommends: (1) fail clearly when YouTube/worker is unreachable (today `loadIndex` retries forever), (2) fix the worker matcher dropping all non-Latin characters, (3) worker country/client hints, (4) "Open in <regional service>" link-outs, (5) optionally Audius. Ends with 7 owner questions.
- **Notes:** Synced from Geethub issue #226. First deliverable is a
  research list, not code.

### non-latin-match-scoring: Search matching ignores Cyrillic, Chinese, Japanese and Korean characters
- **Status:** merged
- **Priority:** medium
- **Description:** The worker's YouTube match scoring lowercases and strips
  everything outside `[a-z0-9]`, so non-Latin titles/artists (Cyrillic,
  CJK, Arabic, etc.) get no title-relevance check at all and can match the
  wrong upload. Tokenise with Unicode letter/number classes (`\p{L}\p{N}`),
  use character bigrams for CJK (no spaces between words), and add a
  transliterated second pass so a Latin-script query can still match a
  Cyrillic upload and vice versa. Should improve matches for every
  listener, not just those in restricted regions.
- **Touches:** `worker/` match scoring / tokenisers (and any matching
  tokeniser copy in `index.html`).
- **Branch:** agent/non-latin-match-scoring
- **Build (150d6e7):** New `worker/src/match-text.js`: NFKC + Latin/Greek accent folding, Unicode tokens (`\p{L}\p{N}\p{M}`), CJK/Thai/etc. character bigrams, Cyrillic/Greek transliteration with spelling tolerance; title overlap = max(direct, transliterated). Used by search overlap, album Topic-channel check, podcast matching, Spotify-art artist check and lyrics (lrclib) title/artist checks. Pure-ASCII scoring unchanged (tested against the old tokeniser). Non-ASCII requests get a `/u1` cache-key suffix; ASCII caches stay warm. index.html: `yearNormTitle` and `wrongTrackTitleOverlap` made Unicode-aware. `npm test` in worker/ (13 tests). SW v44; worker deployed to production.
- **Notes:** Item 2 of `docs/REGIONAL-SOURCES.md` section 7 (see 6.1 for
  the concrete bug). Follow-up from Geethub issue #226, which stays open
  until this and `regional-source-fallbacks` ship. Needs a worker deploy.

### regional-source-fallbacks: Keep EBBLESS usable where YouTube is blocked
- **Status:** archived
- **Priority:** medium
- **Description:** Act on the research in `docs/REGIONAL-SOURCES.md`
  section 7, in order:
  1. Fail clearly: time out the YouTube IFrame API load (today `loadIndex`
     retries every 300 ms forever when `YT.Player` is undefined), act on
     embed error codes, add timeouts to worker calls, and show a plain
     "not available on your network" message instead of spinning.
  2. Worker-side country/client hints (`request.cf.country`, timezone,
     language) to order fallbacks; hints only, not hard blocks.
  3. "Open in <regional service>" link-outs (Yandex Music, NetEase Cloud
     Music, Apple Music, etc.) built from public search URLs, with no
     scraping or unofficial APIs.
  4. Optionally one extra playable source (Audius first).
- **Touches:** YouTube deck loading / error handling in `index.html`,
  `worker/`, track menu or player UI for link-outs.
- **Branch:**
- **Notes:** Follow-up from Geethub issue #226. The report's 7 open
  questions (section 8) should be answered first, especially: is Russia
  a target market (hosting implications), and are link-outs acceptable.
  Avoid reverse-engineered APIs and anything that helps evade a national
  block. **On hold until after launch** (owner, 2026-10-01): a separate region-specific app may be the better option than retrofitting EBBLESS.

### unplaying-next-track: Next track shows but play/pause flips back without playing
- **Status:** merged
- **Priority:** high
- **Description:** Long-standing bug: the next track's art and title are
  correct, but it won't play. Pressing play (button or space bar) turns the
  icon to pause for about 2 seconds, then it flips back to play. Repeating
  it does the same thing every time; the track never starts. Find why the
  deck rejects or loses the play request in this state and make one press
  reliably start the track.
- **Touches:** play/pause handling, deck promotion/loading, player state sync.
- **Branch:** agent/unplaying-next-track
- **Notes:** Synced from Geethub issue #228 (bug, no repro steps or device
  given). Related to merged `autoadvance-stall-full-progress` (#213) but a
  different symptom (play attempts are swallowed, not a stale full progress
  bar), so not a duplicate. Also see the SoundCloud autoplay-policy note in
  merged `soundcloud-native-playback`.
  **Built (d0f943e):** root cause: the play toggle (`playIndex` same-track
  branch / `fadeInAndPlay`) only called `playVideo()` on the active deck's
  existing player and assumed it was alive. A deck can be dead while showing
  the right art/title (YT.Player whose onReady never fired so the track sits
  in `pendingVideoId` forever, a player that hit `onError`, an iframe killed
  in the background); `playVideo()` no-ops, `runPlayFade` gives up after
  1.5s and flips the icon back, and nothing ever reloads the deck since
  `playIndex` only reloads when there is no player at all. Fix:
  `deckLooksDead` (not ready 8s+ after load, or errored and not
  playing/paused/buffering) rebuilds right on the press, and the fade-in
  give-up path now calls `rebuildActiveDeck` (destroy, fresh placeholder
  div, `createDeckPlayer` for the current track, resume position via
  `pendingResume`) instead of just reverting the UI. Verified locally that a
  press on a stuck deck builds a fresh iframe and shows the loading ring;
  the browser pane can't play YouTube embeds, so real playback after the
  rebuild still needs a real-device check (mobile background/locked, and an
  SC track). A video that is permanently unembeddable still won't play
  (each press retries once, then shows play). SW not bumped (done on main at
  merge).

### miniplayer-return-reload: Returning from the mini-player after a long time reloads the page
- **Status:** merged
- **Priority:** high
- **Description:** (Owner 2026-10-02: remove the 10-minute background reset entirely, all devices.) After the desktop mini-player has been in use for a long
  time, going back to the main EBBLESS tab reloads the whole page instead of
  picking up seamlessly. Returning should land on the same player state,
  track and position with no reload or splash.
- **Touches:** desktop mini-player (Document Picture-in-Picture) and main-tab
  visibility/resume handling.
- **Branch:** agent/miniplayer-return-reload
- **Notes:** Synced from Geethub issue #230 (bug, no repro or device given).
  Likely Chrome discarding/freezing the background tab (Memory Saver) while
  the PiP window keeps playing; check `document.wasDiscarded`, the
  `freeze`/`resume` page lifecycle events, and whether state restore from
  merged `mobile-background-resume` covers this path. Related to merged
  `mini-player-polish`, but a different symptom, so not a duplicate.
  **Built (15df370, 5b8df21):** root cause was the app itself: the
  visibilitychange handler reloaded after 10 min hidden (BACKGROUND_RESET_MS),
  and PiP time counted as hidden. Per owner, the 10-minute reset is now
  removed entirely on all devices. LS_BACKGROUNDED_AT / LS_WAS_PLAYING kept
  for killed-page recovery in startApp, now with no time limit (any reopen
  after the OS kills the page goes to the restored player, no splash; owner confirmed no time limit, 2026-10-02).
  Paused-in-PiP stays paused on return. Needs real-device checks (desktop
  PiP 10+ min, mobile backgrounded 10+ min, mobile after OS kill).

### artist-link-playlist: Paste an artist page link to get a playlist of their catalog
- **Status:** merged
- **Priority:** medium
- **Description:** Pasting a link to an artist's page (Spotify, SoundCloud,
  YouTube, Apple Music and the other supported sources) should build a
  playlist of everything on that artist's page, the same way pasting a
  playlist link works today.
- **Touches:** paste/import link parsing and the per-source playlist
  resolvers (and worker endpoints where a source needs server-side fetch).
- **Branch:** agent/artist-link-playlist
- **Notes:** Synced from Geethub issue #229. Spotify artist pages may hit the
  same API/blocking limits noted in `spotify-art-source`; decide per source
  what "everything" means (top tracks vs full discography) and cap size.
  **Built (81b693f):** new types `artist` (Spotify), `am_artist`, `sc_artist`, `yt_artist` in the link parsers; new worker endpoint `GET /artist?url=` (6h cache). Spotify: top 10 + up to 12 releases via embeds, cap 100. Apple Music: top songs + album/single/live/compilation shelves, cap 100. SoundCloud: uploads via existing web API, cap 200. YouTube: partial, first 8 Releases albums + 30 latest uploads, cap 200. Title-level dedupe. Clear errors for bad/unsupported artist links. Side fix: `soundcloud.com/user/tracks` no longer misread as a track. **Needs a worker deploy.** Not verified from Cloudflare egress or for real YouTube playback.

### beta-hide-feedback-buttons: Hide suggest / bug / copy-log buttons for beta testers
- **Status:** merged
- **Priority:** medium
- **Description:** For the beta, remove the "Suggest an improvement",
  "Report a bug" and "Copy log" buttons from what testers see. Keep the
  owner's own shortcuts to these working.
- **Touches:** Settings/About buttons, beta tester access gating.
- **Branch:** agent/beta-hide-feedback-buttons
- **Notes:** Synced from Geethub issue #231. Testers already have the beta
  feedback and bug-report flow from the beta tester system (523586c), so
  these are redundant for them.
  **Built (9ecbe9c, 7ed30f5):** per owner ("shortcuts" = keyboard shortcuts), the three rows carry `.beta-hidden` and are hidden for everyone during beta; Send feedback stays. Shift+B (bug) and Shift+S (suggest) still work. Copy log has no shortcut, so it is unreachable from the UI while hidden. Owner: no shortcut needed, the log is mainly a debugging aid. Tutorial bug-report step now points at Send feedback.

### youtube-playlist-rss-404: YouTube playlist and album imports appear broken
- **Status:** merged
- **Priority:** high
- **Description:** YouTube playlist RSS feeds, which the worker's
  `/ytplaylist` endpoint depends on, return 404 for every playlist and
  channel tried, including through the live worker. Pasting a YouTube
  playlist or album link likely fails today. Replace the RSS dependency.
- **Touches:** worker `/ytplaylist`, YouTube playlist import path.
- **Branch:** agent/youtube-playlist-rss-404 (based on agent/artist-link-playlist)
- **Notes:** Found by the `artist-link-playlist` lane (2026-10-02), not yet
  confirmed in the live app. That lane's playlist-page reader in the worker
  `/artist` handler could likely replace the RSS fetch.
  **Worker deployed 2026-10-02** (version 89515831, built from main + this branch so the beta email worker code stays live; `/artist` endpoint is live too, unused until artist-link-playlist merges). Live `/ytplaylist` verified returning 100 tracks. Merged to main with artist-link-playlist, SW v55. **Built (9741085):** 404 not reproduced 2026-10-02 (RSS and live worker returned 200; may be intermittent or edge/region dependent). `/ytplaylist` now reads the playlist page first (shared `readYtPlaylistPage`, parsers in `worker/src/yt-page.js`), RSS kept as fallback, same response shape, cache key bumped to `p2`. Cap 100 (was 15 via RSS). Worker tests 19/19. **Needs a worker deploy.** Follow-ups: client fires up to 100 `/spotifyart` calls at once on import (add a concurrency limit); [throttle d26183a merged and live, SW v54]; stale "~15 videos" comment near index.html:5034; `/artist` fails on handles YouTube 303-redirects (e.g. `@daftpunk`).

### artist-link-yt-redirect: Some YouTube artist links fail with "channel not found"
- **Status:** merged
- **Priority:** medium
- **Description:** Pasting some YouTube artist handles (e.g. lowercase
  `@daftpunk`) fails with "channel not found". YouTube answers with a 303
  redirect to the canonical handle, and the worker's `fetchYouTubePage`
  treats any redirect as a bot-check. Follow same-site redirects to the
  canonical channel page instead.
- **Touches:** worker `/artist` YouTube handler, `fetchYouTubePage`.
- **Branch:** agent/artist-link-yt-redirect
- **Notes:** Found by the `artist-link-playlist` lane (2026-10-02).
  **Built (see branch):** `fetchYouTubePage` follows up to 2 redirects that stay on www.youtube.com and are not `/sorry`; consent and bot-check redirects still throw. Verified locally: `@daftpunk` 125 tracks, `@radiohead` 112, bogus handle still errors. Worker-only; merged (22671b0) and deployed 2026-10-02 (version c2bdd6d5).

### start-here-paste-guide: "Start here" bubble and tutorial should cover everything you can paste
- **Status:** merged
- **Priority:** medium
- **Description:** The "start here" help bubble only introduces part of what
  the paste box accepts. Update it (and the tutorial copy that covers
  pasting) to introduce every kind of link/input the app actually supports
  today (e.g. Spotify/YouTube/SoundCloud links, podcasts, albums, etc.;
  derive the real list from the paste-handling code, don't guess).
- **Touches:** "start here" help bubble, tutorial paste caption.
- **Branch:** agent/start-here-paste-guide
- **Notes:** Synced from Geethub issue #232. Follow-up to the merged
  `tutorial-paste-link-copy`.
  **Built (f030567):** bubble lists Spotify/Apple Music/YouTube/SoundCloud links (playlist, album, song, artist), podcasts (Spotify/Apple show or episode, RSS), plus search/vibe; tutorial captions updated to match. Follow-up (a3acacb): empty-library line now "Paste a playlist, album, song, or podcast link to begin." Replace-link placeholder left as is (owner).

### desktop-reload-playlist-slide: Playlist panel slides offscreen for a few frames on desktop reload
- **Status:** merged
- **Priority:** medium
- **Description:** On desktop, reloading the page makes the playlist panel
  visibly slide left offscreen from the center for the first few frames.
  It should appear in its final position with no slide animation on load
  (likely a transition firing before initial layout/state is applied).
- **Touches:** playlist panel CSS transitions / initial layout on desktop.
- **Branch:** agent/desktop-reload-playlist-slide
- **Notes:** Synced from Geethub issue #233 (bug).
  **Built (9f35be2):** cause: until `updateSplitDesktop()` adds `body.split-desktop`, `#libpl-panel` uses the 860px drawer rule (translateX(100%)), then the 1150px grid rule (translateX(-100%)) and the transform transition animates it. Fix: `updateSplitDesktop()` disables transitions on `#libpl-panel`/`#queue-panel` around the class toggle, forces a reflow, restores them. Side effect: resizing across 1150px snaps instead of slides. Needs one manual desktop reload check.

### podcast-skip-15: ±15s skip buttons for podcasts
- **Status:** merged
- **Priority:** medium
- **Description:** When a podcast episode is playing, add two buttons to the
  player: skip back 15s and skip ahead 15s. Keep the existing previous/next
  track buttons. Keyboard shortcuts for skipping should also jump ±15s while
  a podcast is playing. Music playback is unchanged.
- **Touches:** player transport controls, keyboard shortcuts, podcast
  detection (`isPodcastEntry()` / `pod:` ids).
- **Branch:** agent/podcast-skip-15
- **Notes:** Synced from Geethub issue #234. Related: `keyboard-shortcuts-2`
  (seek shortcuts), Media Session ±10s actions from `cross-platform-handoff`.
  **Built (9b02bd6):** -15/+15 buttons beside play (main player, mini bar, flow view), shown only with `body.pod-playing` (set in `reflectCurrentTrackUI` via new `isPodcastTrack()`); handlers reuse `kbSeekBy`. Shift+Left/Right = ±15s on podcasts (10s music, `seekStepS()`); Media Session seek default 15s on podcasts. ≤420px tightens rows; ≤340px mini bar drops skip buttons. Follow-up (c3b2dab, owner decisions): plain Left/Right = ±15s on podcasts, Shift+Left/Right = prev/next episode (music unchanged); PiP mini player gets podcast-only ±15 buttons; iOS registers seekbackward/seekforward per podcast track, cleared to null for music (`syncIosPodSkip`); `pod-playing` cleared when no current track. Untested on real podcast/iOS/PiP.

### lp-game-desktop-fullscreen-layout: LP game layout and album-art menu in desktop fullscreen
- **Status:** merged
- **Priority:** medium
- **Description:** In desktop fullscreen LP mode while the record-tap game
  is running: reposition the LP game UI, stop the album-art tap/button menu
  from activating while the game is active, and place the score counter
  above the title and player controls.
- **Touches:** record-tap minigame, fullscreen LP layout (desktop), album-art menu.
- **Branch:** agent/lp-game-desktop-fullscreen-layout
- **Notes:** Synced from Geethub issue #235 (bug). Follow-up to merged `record-tap-minigame`.
  **Built (0ee815e):** during a run, clicking the art tab (it sits over the cue tick) counts as a record tap instead of opening the art menu; run start closes the menu. Wide-screen rule lifts score + "New best" flare 236px from bottom, above title/controls. Layout verified at 1440x900; menu gating untested in a live run; phone landscape unchecked.

### tester-version-banner: Remind testers after a few days that this is the tester version
- **Status:** merged
- **Priority:** medium
- **Description:** A few days after a tester starts using the app, show a
  banner at the top saying this is the tester version and asking them to
  send feedback (link to the existing Send feedback flow). Dismissible.
- **Touches:** beta tester system, Send feedback flow.
- **Branch:** agent/tester-version-banner
- **Notes:** Synced from Geethub issue #236. Related: merged `feedback-prompt`, `beta-hide-feedback-buttons`.
  **Built (5d54f20):** shows for anyone holding `ebbless:betaToken`, 3 days after vibe-check first-seen (`ebbless_vibe_check`), not in sessions where the vibe check is due. x or Send feedback hides it 7 days. Top bar grows 50px while shown; hidden in splash/tutorial/fullscreen/dialogs. Revised (b4095ff, owner): now a pill inside the header nav, next to the nav / mobile Settings button, "Tester version" label on phones; no top bar growth. Verified locally with faked token; live beta check, iPhone notch, 320px wrap unverified.

### open-music-links-in-ebbless: Share Spotify / Apple Music / YouTube Music links to EBBLESS (Android)
- **Status:** merged
- **Priority:** medium
- **Description:** On Android, make the installed EBBLESS PWA appear in the
  system Share sheet (Web Share Target in manifest.json). Sharing a
  Spotify, Apple Music or YouTube Music link (song, album, playlist,
  artist, podcast) to EBBLESS opens the app and loads it exactly as if
  pasted. Handle the link arriving in the shared text or url field, with
  extra text around it. Scope: Android only; no iOS Shortcut or desktop
  bookmarklet for now.
- **Touches:** manifest.json (share_target), paste/link handling.
- **Branch:** agent/open-music-links-in-ebbless
- **Notes:** Synced from Geethub issue #237. Browsers don't let a PWA claim
  other sites' https links as default handler; share-target is the realistic path.
  **Built (7b2376b):** manifest `share_target` (GET, action ./index.html, params share_title/share_text/share_url). `applyShareTargetFromUrl()` (called from `applySharedImportFromUrl()` in `startApp()`) clears params, extracts first URL, fills `urlInput` and calls `importForm.requestSubmit()` so the paste handler does everything. Tested in local browser (cold start, onboarded, plain text); real Android share sheet, Apple Music/podcast links and offline untested. Installed PWAs need a manifest refresh/reinstall to show in share sheet.

### lp-game-skins: EBBLESS DEEP skins for the LP game
- **Status:** archived
- **Priority:** low
- **Description:** Alternate visual skins for the record-tap game (solar
  system, animations, bat and ball, clock), offered as an EBBLESS DEEP perk.
- **Touches:** record-tap minigame visuals.
- **Branch:**
- **Notes:** Synced from Geethub issue #238. Depends on `ebbless-deep` (draft) for gating.

### settings-feedback-first: Send feedback should be the first item in Settings
- **Status:** merged
- **Priority:** medium
- **Description:** Move the Send feedback row to the top of Settings.
- **Touches:** Settings layout.
- **Branch:** agent/settings-feedback-first
- **Notes:** Synced from Geethub issue #239 (bug).
  **Built (be10352):** whole Feedback & support block moved to top of Settings (its other rows are beta-hidden, so moving only the row would leave an empty heading). `ensureAccountBlock()` now inserts Account below it. Unverified in browser; check the tutorial crossfade step still shows the toggle on small screens.

### strip-topic-artist-names: Artist names still show " - Topic" in places
- **Status:** merged
- **Priority:** medium
- **Description:** Artist names should never display the YouTube channel
  suffix " - Topic". Some import paths already strip it (YouTube album
  imports); find where it still leaks through and strip it everywhere a
  track's artist is set or displayed.
- **Touches:** track artist normalization (see existing `- Topic` strip near index.html:5158, 7716).
- **Branch:** agent/strip-topic-artist-names
- **Notes:** Synced from Geethub issue #240 (bug).
  **Built (6e4965c):** `stripTopicSuffix()` / `stripTopicArtists()` applied in fetchYouTubePlaylist, fetchYouTubeVideo, fetchArtist, getCachedPlaylist (cleans old saved data on load), resolveDiscoverMetadata, device handoff; old album-only inline replaces removed. Matching/search and worker untouched. Side effect: stored `channel` also stripped on non-album YouTube imports. Unverified in browser.

### lockscreen-art-youtube-thumb: Lock screen shows YouTube thumbnail instead of album art for one track
- **Status:** merged
- **Priority:** medium
- **Description:** "Walking on the Moon" by Thundercat shows the YouTube
  thumbnail on the lock screen and notification bar, while the app itself
  shows the correct album art. Only this track noticed so far. Find why the
  media session artwork falls back to the YouTube thumb for it and fix.
- **Touches:** media session artwork (see merged `lockscreen-album-art`).
- **Branch:** agent/lockscreen-art-youtube-thumb
- **Notes:** Synced from Geethub issue #242 (bug). Possible regression or edge case of `lockscreen-album-art`.
  **Built (18d5c13):** `mediaSessionArtwork()` drops img.youtube.com fallback thumbs when `t.art` is set (OS picked the sized YT thumb over unsized resolved art). Untested on a real Android lock screen; broken art URL now shows no lock-screen art instead of the YT thumb.

### add-to-playlist-all-playlists: "Add to playlist" screen should list all your playlists
- **Status:** merged
- **Priority:** medium
- **Description:** The add-to-playlist picker should show every playlist
  in the user's library, not a subset.
- **Touches:** add-to-playlist picker.
- **Branch:** agent/add-to-playlist-all-playlists
- **Notes:** Synced from Geethub issue #243 (bug). Title only, no repro details.
  **Built (46efa84):** new `addablePlaylists()` used by `openAddToPlaylistPicker` and `openSingleTrackDestinationPicker`; was filtering to `type === "custom"` only. Now lists imported playlists too; excludes CuRRentSSsss, SwiiiRrrLL, albums, podcasts, single tracks. Lists grow to 55vh/50vh. Unverified in browser.

### podcast-chapters-captions: Podcast chapters and captions
- **Status:** merged
- **Priority:** medium
- **Description:** Show chapter markers (jump between chapters) and
  captions/transcript for podcasts when the source provides them.
- **Touches:** podcast playback (see `podcasts`, `podcast-skip-15`).
- **Branch:** agent/podcast-chapters-captions
- **Notes:** Synced from Geethub issue #241. Title only.
  **Built:** worker reads each feed item's `<podcast:chapters>` /
  `<podcast:transcript>` (Podcasting 2.0) and inline `<psc:chapters>`
  (Podlove) via new `worker/src/pod-text.js`; new `/podtext` endpoint fetches
  and parses the chapters JSON or VTT/SRT/JSON transcript (hosts send no
  CORS) and returns only parsed `{chapters}` / `{lines}`. Short caption cues
  are joined into readable lines with speaker names on change. Podcast cache
  bumped `pod5` -> `pod6`. App: the lyrics view now shows captions for
  podcast episodes, with chapter titles as small-caps headings in the list
  (tap any line or chapter to jump there); chapter boundaries cut gaps into
  the seek bar. Only feed-audio episodes (not YouTube-fallback shows).
  Verified: worker tests (7 new, 26 pass); local `wrangler dev` against the
  Podcasting 2.0 feed (38 chapters, 844 caption lines); app in the preview
  pointed at the local worker - captions sync and highlight, 37 seek-bar
  gaps, tapping a chapter jumped to 5:38. **Needs a worker deploy** for
  `/podtext` before the app side works live.
  **Follow-up (user ask):** chapter-list button in the art's bottom-left
  corner (podcast episodes with chapters only) toggles a list of chapters
  with start times over the art; tap a row to jump, current chapter
  highlighted, click anywhere outside closes it. Verified in preview: 38
  rows, row tap jumped to 5:38 and highlighted, outside click closed.
  **Follow-ups (2026-10-03, shipped):** chapters parsed from episode show
  notes when there's no chapters file (NoSleep: 592/731 episodes). Captions
  for episodes with no transcript are generated on the listener's device
  (Whisper via transformers.js in a Web Worker; tiny.en ~41 MB default,
  multilingual base ~77 MB offered in the captions view only for non-English
  shows). Audio comes a 2 MB slice at a time through new worker `/podaudio`
  (byte-range passthrough, nothing stored), starting at the playhead. Results
  kept in this device's IndexedDB for 7 days, nothing server-side - free,
  no limits. Verified in preview: ~2 min of audio per ~40 s on a laptop.

### dj-mode: DJ mode - play two songs at once, set markers, and mix
- **Status:** archived
- **Priority:** low
- **Description:** A DJ mode with two decks playing at once, play/sample
  cue markers per track, and manual mixing between them.
- **Touches:** playback engine (crossfade), new UI.
- **Branch:**
- **Notes:** Synced from Geethub issue #244. Title only. Large feature; two simultaneous YouTube players may hit platform limits.

### h-key-home: "h" key returns to home (main player)
- **Status:** merged
- **Priority:** medium
- **Description:** Pressing "h" on desktop should return to the main
  player view from anywhere (library, queue, settings).
- **Touches:** global keydown handler (see merged `keyboard-shortcuts`).
- **Branch:** agent/h-key-home
- **Notes:** Synced from Geethub issue #245. Title only.

### keyboard-shortcuts-settings-page: Keyboard shortcut reference page in Settings
- **Status:** merged
- **Priority:** medium
- **Description:** Add a page/section in Settings listing every keyboard
  shortcut and what it does.
- **Touches:** Settings view; shortcut list from `keyboard-shortcuts`.
- **Branch:** agent/h-key-home
- **Notes:** Synced from Geethub issue #246. Title only. Should include `h-key-home` if that ships first.

### whats-new-list: "What's new" list of features and fixes per version
- **Status:** merged
- **Priority:** medium
- **Description:** Show users a "What's new" list of features and fixes
  for each app version (e.g. after an update, or from Settings).
- **Touches:** Settings / update flow (see `pwa-update-propagation`).
- **Branch:** agent/whats-new-list
- **Notes:** Synced from Geethub issue #247. Title only.

### desktop-library-section-title-size: Desktop library section titles should match 2x2 grid title size
- **Status:** merged
- **Priority:** low
- **Description:** On desktop library, the Playlists / Albums / Podcasts
  section titles should use the same font size as playlist titles in the
  2x2 grid view.
- **Touches:** desktop library CSS.
- **Branch:** agent/desktop-library-section-title-size
- **Notes:** Synced from Geethub issue #248. Title only.

### miniplayer-tab-favicon-leak: Main browser tab shows the "mini-player open" icon instead of the EBBLESS logo
- **Status:** dropped
- **Priority:** medium
- **Description:** When the user is on another browser tab, the EBBLESS tab's
  icon shows the "mini-player open" symbol instead of the EBBLESS logo. The
  main tab should always keep the EBBLESS favicon; any mini-player icon
  belongs only to the Picture-in-Picture window.
- **Touches:** desktop mini-player (Document PiP) title/favicon handling,
  main document `<link rel="icon">`.
- **Branch:**
- **Notes:** Synced from Geethub issue #251. Likely a side effect of
  merged `mini-player-polish` (88041a9, "PiP title/favicon") writing to the
  main document's icon instead of the PiP window's.
  **Investigated 2026-10-03:** no code writes the main tab icon/title (PiP
  writes only to its own window). Likely Chrome's picture-in-picture tab
  indicator, which pages can't control. Confirmed in Chrome: logo stays, PiP indicator
  sits beside it. Dropped as browser behaviour.

### miniplayer-art-fade: Mini-player album art should fade on track change
- **Status:** merged
- **Priority:** medium
- **Description:** In the desktop mini-player, album art should fade into
  the next track's art on track change instead of snapping, matching the
  main player's crossfade art transition.
- **Touches:** desktop mini-player art element; reuse the main player's
  crossfade-art logic.
- **Branch:** agent/miniplayer-art-fade
- **Notes:** Synced from Geethub issue #250. Extends merged
  `crossfade-album-art-transition` / `crossfade-art-lp-cassette` to the
  mini-player; not a duplicate.

### esc-close-video: Esc should close the video window
- **Status:** merged
- **Priority:** medium
- **Description:** Pressing Esc while the YouTube video window/tab is open
  should close it, same as Esc exits fullscreen.
- **Touches:** keyboard shortcut handler, video playback view (from
  `video-playback-option` / `platform-compliance-audit`).
- **Branch:** agent/esc-close-video
- **Notes:** Synced from Geethub issue #249. Related to merged
  `fullscreen-esc-exit`; check Esc priority order (fullscreen first, then
  video, then other panels).

### scrollbar-style: Library/playlist/queue scrollbars should use UI colors and be easy to grab
- **Status:** merged
- **Priority:** medium
- **Description:** Scrollbars in the library, open playlist and queue should
  use the app's accent/UI colors instead of the browser default, and be
  wider/easier to grab and drag smoothly.
- **Touches:** scrollbar CSS for library, playlist panel, queue panel.
- **Branch:** agent/scrollbar-style
- **Notes:** Synced from Geethub issues #252 (colors) and #272 (easier/smoother to grab), folded into one entry. Title only.

### shortcuts-list-collapsed: Keyboard shortcuts list closed until opened with a button
- **Status:** merged
- **Priority:** medium
- **Description:** The keyboard shortcut list in Settings should start
  collapsed and only expand when the user taps a button.
- **Touches:** Settings shortcut section (merged `keyboard-shortcuts-settings-page`).
- **Branch:** agent/shortcuts-list-collapsed
- **Notes:** Synced from Geethub issue #253. Title only.

### whats-new-same-day-merge: "What's new" should merge same-day updates into one version
- **Status:** merged
- **Priority:** medium
- **Description:** When several updates ship on the same day, the What's new
  list should show them as one version entry instead of several.
- **Touches:** What's new list (merged `whats-new-list`).
- **Branch:** agent/whats-new-same-day-merge
- **Notes:** Synced from Geethub issue #254. Title only.

### podcast-captions-delay: Podcast captions lag and should preload before the lyrics window opens
- **Status:** merged
- **Priority:** medium
- **Description:** Podcast captions appear late. Caption generation/loading
  should start as soon as the episode starts, before the lyrics window is
  opened, so they are ready and in sync when it is.
- **Touches:** podcast captions (merged `podcast-chapters-captions`).
- **Branch:** agent/podcast-captions-delay
- **Notes:** Synced from Geethub issues #255 (delay) and #278 (preload before opening), folded into one entry. Commit 1126d93 (background generation on iPhone) may already cover part of this; verify first.

### podcast-chapter-button-missing: Podcast chapter button isn't showing
- **Status:** merged
- **Priority:** medium
- **Description:** The chapters button for podcasts does not appear. Find
  why and make it show for episodes that have chapters.
- **Touches:** podcast chapters UI (merged `podcast-chapters-captions`).
- **Branch:** agent/podcast-chapter-button-missing
- **Notes:** Synced from Geethub issue #256. Title only.

### iphone-screen-off-playback: iPhone stops playing when the screen is turned off
- **Status:** merged
- **Priority:** medium
- **Description:** On iPhone, playback doesn't continue with the screen off.
  Investigate what iOS allows for PWAs/web audio and keep playback going
  where possible (or explain the limit to the user).
- **Touches:** playback / background handling on iOS.
- **Branch:** agent/iphone-screen-off-playback
- **Notes:** Synced from Geethub issue #257. Title only. Likely platform-limited for YouTube embeds.

### paste-recent-searches: Recent searches in the paste list
- **Status:** merged
- **Priority:** medium
- **Description:** The paste/search box should show the user's recent
  searches as quick picks.
- **Touches:** paste bar / search results list.
- **Branch:** agent/paste-recent-searches
- **Notes:** Synced from Geethub issue #258. Title only.

### progress-bar-drag-smooth: Dragging the play progress bar isn't smooth
- **Status:** merged
- **Priority:** medium
- **Description:** Scrubbing the progress bar stutters. Make dragging smooth
  (update the visual immediately, seek on release or throttled).
- **Touches:** player progress bar / seek handling.
- **Branch:** agent/progress-bar-drag-smooth
- **Notes:** Synced from Geethub issue #259. Title only.

### search-artist-profile-suggestion: Artist profile should appear in search suggestions
- **Status:** merged
- **Priority:** medium
- **Description:** When the user searches an artist name, the artist's
  profile (leading to their catalog playlist) should be one of the
  suggestions.
- **Touches:** paste bar search; merged `artist-link-playlist`.
- **Branch:** agent/search-artist-profile-suggestion
- **Notes:** Synced from Geethub issue #260. Title only.

### iphone-ad-buzz: iPhone plays the start of an ad and a rhythmic buzz
- **Status:** merged
- **Priority:** medium
- **Description:** On iPhone, the start of an ad plays, then a rhythmic buzz
  continues. The only way to stop it is opening the video and pressing
  pause then play. Stop the buzz and make sure ad handling works on iOS.
- **Touches:** ad failsafes / player on iOS (related merged `android-ad-popup`, commits 001893c, 65db55c).
- **Branch:** agent/iphone-ad-buzz
- **Notes:** Synced from Geethub issue #261.

### install-prompt-push: Push users to install the app on every open
- **Status:** merged
- **Priority:** medium
- **Description:** Regular users don't see browser apps as apps. Make
  installing a key feature: prompt every time they open the app (not
  installed), possibly as a header banner.
- **Touches:** install prompt / header banner; related `install-button-always-settings`.
- **Branch:** agent/install-prompt-push
- **Notes:** Synced from Geethub issue #262.

### splash-enter-button-contrast: Splash "Enter" button is hard to read
- **Status:** merged
- **Priority:** medium
- **Description:** Change the color of the Enter button on the splash page so
  its label is clearly readable.
- **Touches:** splash buttons.
- **Branch:** agent/splash-enter-button-contrast
- **Notes:** Synced from Geethub issue #263. Title only.

### empty-state-play-nudge: New users with no playlists: make the play button pulse
- **Status:** merged
- **Priority:** medium
- **Description:** On first visit with no playlists loaded, animate (blink/
  pulse) the starter playlist's play button so people intuitively just
  press play.
- **Touches:** library empty/first-run state; merged `first-run-paste-guide`.
- **Branch:** agent/empty-state-play-nudge
- **Notes:** Synced from Geethub issue #264. Title only.

### paste-placeholder-rotation: Paste box hint text should rotate through examples and suggestions
- **Status:** merged
- **Priority:** medium
- **Description:** The grey placeholder in the paste box should cycle every
  few seconds through everything you can paste (a playlist, a song title,
  an artist, etc.). With listening history, it can also suggest things like
  "roaming [location] at [time of day] + [weather]" or a song/artist they
  haven't added but would love.
- **Touches:** paste bar placeholder.
- **Branch:** agent/paste-placeholder-rotation
- **Notes:** Synced from Geethub issue #265.

### currents-thumbs-down: CuRRentSSsss should learn faster, with a thumbs-down
- **Status:** merged
- **Priority:** medium
- **Description:** CuRRentSSsss is suggesting genres the listener doesn't
  like. Weight what they return to (replays), not just what they played,
  and add a thumbs-down button to decline a song quickly.
- **Touches:** Currents selection logic; related draft `algorithm-sliders`.
- **Branch:** agent/currents-thumbs-down
- **Notes:** Synced from Geethub issue #266.

### intro-philosophy-video: Intro video explaining what EBBLESS is about
- **Status:** archived
- **Priority:** low
- **Description:** An intro video, separate from the tutorial, that
  initiates people into the app's design philosophy: it grows with you,
  the listener's responsibility, a feeling of entering a club of
  next-generation listeners.
- **Touches:** splash/onboarding; needs video content from MAL GRIOT.
- **Branch:**
- **Notes:** Synced from Geethub issue #267. Content-dependent.

### install-button-always-settings: Settings should always show an install button
- **Status:** merged
- **Priority:** medium
- **Description:** Always show the install button in Settings, including on
  iPhone (share-sheet instructions). If already installed, show it greyed
  out, and re-enable it if the app gets uninstalled.
- **Touches:** Settings install button (merged `settings-install-button`).
- **Branch:** agent/install-button-always-settings
- **Notes:** Synced from Geethub issue #268.

### miniplayer-idle-fade: Mini-player fades and shrinks when not hovered
- **Status:** merged
- **Priority:** medium
- **Description:** After a few seconds without hover, the desktop
  mini-player should fade and shrink toward transparent; hovering brings
  it back.
- **Touches:** desktop mini-player (merged `mini-player-polish`).
- **Branch:** agent/miniplayer-idle-fade
- **Notes:** Synced from Geethub issue #269. Title only.

### tester-admin-ui: Admin page to view and edit tester info from the sheet
- **Status:** merged
- **Priority:** medium
- **Description:** An easy-to-navigate admin page showing testers' info
  from the Google Sheet (names, etc.), with some customization and the
  ability to make at least minimal edits to the sheet.
- **Touches:** admin-only page; tester sheet backend (worker).
- **Branch:** agent/tester-admin-ui
- **Notes:** Synced from Geethub issue #270. Must be admin-only.

### mobile-horizontal-overflow: Phone screen scrolls left and right
- **Status:** merged
- **Priority:** high
- **Description:** On phone the page isn't fit to 100% width and scrolls
  horizontally. Find the overflowing element and fix it.
- **Touches:** mobile layout CSS.
- **Branch:** agent/mobile-horizontal-overflow
- **Notes:** Synced from Geethub issue #271. Title only.

### google-email-signup-access: Collect the Google email at signup; that email is their access
- **Status:** merged
- **Priority:** high
- **Description:** At beta signup, capture the tester's Google email (fewest taps: a "Sign up with Google" button that fills it automatically, rather than a typed field). Once accepted, that email address is their access: signing in with that Google account on any device or the iPhone home-screen app lets them in, with no link or pasting needed. The invite email link still works as a one-tap shortcut.
- **Touches:** beta signup page (beta/index.html), worker/src/beta.js (/beta/signup, /beta/claim), tools/beta-sheet.gs (Applicants/Testers google email column, token_by_email).
- **Branch:** agent/google-email-signup-access
- **Notes:** MAL GRIOT 2026-10-06, answering the invite-link-one-tap gap (locked iPhone app + non-Google invite email). Motto: least clicks possible.

### ui-simplicity-pass: Make the UI dead simple for anyone
- **Status:** merged
- **Priority:** low
- **Description:** Tester suggestion: the UI should be very, very easy for
  non-technical users. Needs a concrete audit of confusing spots before
  it's buildable.
- **Touches:** general UX.
- **Branch:** agent/ui-simplicity-small, then agent/ui-simplicity-medium
- **Notes:** Synced from Geethub issue #273. Vague; scope with MAL GRIOT before ready.
  Audit 2026-10-06 (ranked, S/M = effort): 1 phone install gate has 3 equal buttons, make Install primary (S). 2 library card three-dot menu hidden on touch, always show it (S). 3 CuRRentSSsss/SwiiiRrrLL cards need plain subtitles + better "0 tracks" empty state (S). 4 raw error text ("backend returned 500") to plain messages (S). 5 empty player shows dashes, add "Nothing playing yet" + Find music (S). 6 player has many unlabeled icons, label top tabs, tuck visualizer buttons (M). 7 wrong-track flag icon confusing, move to menu with plain copy (S). 8 library toolbar on phone: visible filter chips, one View menu, 44px tap targets (M). 9 playlist menu dev wording (Refresh/Replace link, Mark as album) (S). 10 Settings "Pre-roll ad handling" developer note row (S). 11 Settings crossfade/even volume: real switches, plain names (S). 12 no undo on Clear queue / Remove from playlist, browser confirm on delete (M). 13 inconsistent words: tracks/songs, re-roll/fresh picks, flow mode/fullscreen, cymatics/visualizer (S). 14 library search button "Load" vague (S). 15 beta gate "OPEN EBBLESS"/"UNLOCK" wording (S).
  Decision (MAL GRIOT 2026-10-06): do all 15; small ones first (1-5, 7, 9-11, 13-15), then 6, 8, 12. Drop the names "flow mode" (use Fullscreen) and "cymatics" (use Visualizer).
  Small lane merged 2026-10-06. Follow-ups (MAL GRIOT): beta gate "I HAVE AN INVITE"/"LET ME IN" still confusing; drop the paste field, the email acceptance link must do all the work. Change remaining "track" wording to "songs" 100% (release notes, recap). Motto from now on: least clicks possible to everything; easy to understand, easy to do.
  Medium lane (6, 8, 12, songs wording) and invite-link-one-tap (no paste field; email link and Google sign-in by invite email) merged 2026-10-06.

### one-login-two-devices: One login should cover two devices
- **Status:** merged
- **Priority:** medium
- **Description:** A single login (testers and in general) should work on
  two devices at once.
- **Touches:** accounts / tester sign-in (merged `accounts-profiles`).
- **Branch:** agent/one-login-two-devices
- **Notes:** Synced from Geethub issue #274. Title only.

### playlist-thumb-hover-open: Playlist thumbnails just open on hover-click; play button moves into the open playlist
- **Status:** merged
- **Priority:** medium
- **Description:** Remove the hover play button and the "open" button from
  2x2/3x3 playlist thumbnails; clicking just opens the playlist. Add a
  hover play button on the art at the top of the open playlist, and make
  the "play" text button more obvious.
- **Touches:** library thumbnails (merged `desktop-playlist-hover-buttons`), playlist panel header.
- **Branch:** agent/playlist-thumb-hover-open
- **Notes:** Synced from Geethub issue #275.

### desktop-playlist-close-easier: Desktop: easier to close the playlist panel
- **Status:** merged
- **Priority:** medium
- **Description:** Add a tab on the right edge of the playlist window to
  close it, and make the X bigger.
- **Touches:** desktop playlist panel.
- **Branch:** agent/desktop-playlist-close-easier
- **Notes:** Synced from Geethub issue #276.

### logo-hold-to-splash: Holding the E logo goes back to splash, with a progress indicator
- **Status:** merged
- **Priority:** medium
- **Description:** Press-and-hold on the E logo returns to the splash
  screen, with a filling bar or animation showing the hold progress.
  A normal click keeps its current behavior.
- **Touches:** HUD logo (merged `logo-tap-to-player`).
- **Branch:** agent/logo-hold-to-splash
- **Notes:** Synced from Geethub issue #277.

### yt-ad-onset: YouTube ads cut in loud and sudden (tester #20)
- **Status:** merged
- **Priority:** high
- **Description:** Tester #20 (in-app feedback, v75, Android): "The youtube
  ads are loud and really jarring and comes in without notification so its
  like a shock factor."
- **Touches:** `deckAdReason` / `guardActiveDeckAd` (merged `android-ad-popup`).
- **Branch:** agent/yt-ad-onset
- **Notes:** Mid-rolls that keep reporting the content's video id and
  duration are only caught by the 'frozen' clock signal, which waited 2s,
  so up to ~2.25s of ad played at full volume. Measured the IFrame API on
  a visible page: `infoDelivery` currentTime arrives every ~265ms (max gap
  272ms over 76 samples). Frozen threshold is now 900ms when visible, 2s
  when hidden (iframe throttled to ~1s updates). Verified locally: ~2 min
  of visible playback plus a skip, `ebblessAdLog` empty (no false mutes).
  Not verified against a real mid-roll (none served locally) or on Android.
  **Zero-ads gate (owner: "ZERO. not even for a millisecond").** Mid-rolls
  need an 8+ minute video, so a ~3 min song's ad was a pre-roll leaking
  through. Holes found in code: (1) a pre-roll past the 20s wait cap was
  "confirmed muted", then the non-strict guard unmuted on the next tick
  ('no-duration' is strict-only); (2) unmute happened on absence of ad
  signs, so any unrecognized ad state was audible; (3) a preload confirmed
  at the cap mid-ad got unmuted on promotion; (4) the guard is off during
  crossfades. Fix: `gateDeckSound` wraps each YT deck's `unMute`, so every
  path needs strict `deckAdReason` = '' first, which now also requires
  proof of content ('not-moving': PLAYING and the clock stepped forward,
  bounded by wall time, within `adFrozenMs()`). Held decks stay muted and
  `releaseSoundGates` (seek-poll tick) lets sound through once proven; it
  also catches ads on non-active / mid-crossfade decks. Give-up after 2 min
  only for duration/id signals, never for a stalled clock.
  Cost: each track starts ~0.3s muted (measured 289-425ms skip-to-sound
  over 5 skips). Verified locally on Today's Top Hits: 5/5 holds released,
  no stuck tracks, autoplay-blocked load correctly held silent.
  **Could not reproduce an ad locally:** 17 Top Hits tracks through the app
  plus 6 top monetized videos (Shape of You, Despacito, See You Again,
  Uptown Funk, Sugar) in a bare unmuted, user-clicked embed on localhost
  got zero ads, while youtube.com itself served one in the same browser.
  Needs a real-device check on the live site.
  **No-midroll matcher (owner request).** Worker `/search` now keeps only
  YouTube uploads under 8 min (`MIDROLL_MIN_SECONDS`, YouTube's mid-roll
  minimum) unless the source song itself is 8+ min; filter-with-fallback,
  so a song with no short upload still resolves. `SEARCH_CACHE_VERSION`
  v8. Already-saved tracks keep their old match until "Refresh links".
  Same tester also said audio sounds low-fidelity ("pixelated photograph
  from the 80s"): see `audio-quality-boost`. Re-checked desktop today:
  forcing `tiny` still streams opus itag 251 (best). Android not confirmed,
  and the report doesn't say which YouTube video was matched.

### ads-button-extended-mix: "Ads playing?" report button + matcher avoids extended mixes
- **Status:** merged
- **Priority:** high
- **Description:** Owner: a player button that sends `ebblessAdLog`, and
  stop matching extended mixes (tester #20's "Slow Motion" resolved to the
  `[Extended Mix]`).
- **Touches:** player transport (`#adsReportBtn`, shown only while
  `ytPanelAvailable()`), worker `/tester-report` (new `ads-button` source,
  whitelisted `videoId` + `adLog` rows), worker `EXCLUDE_GROUPS`.
- **Branch:** agent/ads-button-extended-mix
- **Notes:** Tap logs a `user-report` row, then POSTs the last 40 ad-log
  rows + matched videoId; 30s cooldown. Read with
  `wrangler kv key list --binding=MATCH_REPORTS --prefix=tester:` (look
  for `"source":"ads-button"`). Extended group: excluded unless the source
  title says "extended"; filter-with-fallback. `SEARCH_CACHE_VERSION` v9.
  Verified locally with fetch stubbed: payload correct, toast, hidden on
  SoundCloud tracks. Worker tests 47/47.

### beta-page-redesign: "Join the beta" page built around one big join button, plus more about the app
- **Status:** merged
- **Priority:** medium
- **Description:** Testers keep asking how to get in. The email link should
  be enough (pasting the link is a last resort; the page already opens on
  click). Center the beta signup page on the "join the beta" button and add
  more on the page: what the app is, what you can do, screenshots, a
  tutorial. Make it look good.
- **Touches:** beta signup page (`beta/`), invite email copy.
- **Branch:** agent/beta-page-redesign
- **Notes:** Synced from Geethub issue #279.

### tutorial-hide-admin-shortcuts: Remove Shift+S and Shift+B from the Settings shortcut list
- **Status:** merged
- **Priority:** medium
- **Description:** Shift+S and Shift+B are admin-only. Take them out of the
  shortcut/tutorial list in Settings so regular users don't see them.
- **Touches:** Settings keyboard shortcuts list (merged `keyboard-shortcuts-settings-page`).
- **Branch:** agent/tutorial-hide-admin-shortcuts
- **Notes:** Synced from Geethub issue #281. Title only.

### beta-acceptance-email-check: Confirm one tester actually got their acceptance email
- **Status:** dropped
- **Priority:** medium
- **Description:** Check whether the tester named in the issue received
  their beta acceptance email; if not, find out why and resend.
- **Touches:** beta signup worker / email sending logs.
- **Branch:**
- **Notes:** Synced from Geethub issue #280 (tester address is in the issue, kept out of this file). Ops check, not a feature. Closed by MAL GRIOT 2026-10-05.

### playlist-art-as-track-art: Playlist cover shows as the album art for many tracks
- **Status:** merged
- **Priority:** medium
- **Description:** In some playlists, lots of tracks show the playlist's
  cover instead of their own album art. Repro:
  https://open.spotify.com/playlist/7mQ2rBHpFQGr06cfL0u2nI
- **Touches:** album art lookup (related: merged `album-art-consistent-per-album`).
- **Branch:** agent/playlist-art-as-track-art
- **Notes:** Synced from Geethub issue #282.

### beta-testimonials-publish: Owner-picked tester quotes shown on the beta page
- **Status:** merged
- **Priority:** medium
- **Description:** Add a publish checkbox (plus an editable public quote) to
  Feedback rows in the admin page. A public, cached worker route serves only
  the published quotes, identified by tester number only (never name/email).
  The beta landing page shows them as "What testers are saying".
- **Touches:** tools/beta-sheet.gs (Feedback columns + public action), worker/src/beta.js (new GET route), beta/admin.js.
- **Branch:** agent/beta-testimonials-publish
- **Notes:** Requested by MAL GRIOT 2026-10-05 alongside `beta-page-redesign`. Needs worker deploy + Apps Script new version to go live.

### tester-week-wrapped: When a tester's 7 days are up: one last song, then fade to a recap + feedback page
- **Status:** merged
- **Priority:** high
- **Description:** After a tester's 7-day feedback window ends (7 days from
  the feedback-request email), opening EBBLESS lets them play one full song,
  then freezes the controls and fades the app out to a page that tells them,
  by name, that their 7 days are up, with the feedback button front and
  center. The page shows a Spotify Wrapped-style recap: most-played tracks,
  favorite songs/albums/playlists/podcasts, how much they listened, most
  used features. Their listening history is kept so if they join a later
  beta it all loads back in automatically.
- **Touches:** index.html (play log, expiry gate, recap screen), worker/src/beta.js (/beta/me returns window end), tools/beta-sheet.gs (me_ returns feedback_request_sent), profile sync.
- **Branch:** agent/tester-week-wrapped
- **Notes:** Requested by MAL GRIOT 2026-10-05. Time-sensitive: testing began 2026-10-02, so the first windows end around 2026-10-10. Track names stay out of the Sheet Analytics tab (it's counts only by design).

### wrapped-join-next-beta: "Join the next beta" button on the 7-days-up recap that reactivates access
- **Status:** merged
- **Priority:** medium
- **Description:** On the "your 7 days are up" recap screen, add a button
  to sign up for the next beta round in one tap (no form; we already know
  who they are). Joining reactivates their access so they can keep
  listening, with their saved history carried over.
- **Touches:** recap screen (merged `tester-week-wrapped`), worker/src/beta.js + tools/beta-sheet.gs (rejoin action against their existing tester row).
- **Branch:** agent/wrapped-join-next-beta
- **Notes:** Idea from MAL GRIOT 2026-10-06. Needs decisions before ready: does rejoining reactivate instantly or go into the review queue like a new signup; does it start a fresh 7-day window; how is a "next beta" round defined in the Sheet.
  Decisions (MAL GRIOT 2026-10-06): rejoining goes into the review queue like a new signup; approval starts a fresh 7-day window; a "next beta" round is defined by a date in the Sheet.

### crossfade-next-muted-gap: With crossfade on, pressing next sometimes plays the new song muted for ~12s
- **Status:** merged
- **Priority:** medium
- **Description:** Bug: with crossfade enabled, hitting next sometimes starts the next track silent for about 12 seconds before audio comes in. Manual skips should fade in promptly (or cut cleanly) every time.
- **Touches:** crossfade / manual skip path (see merged crossfade-manual-skip).
- **Branch:** agent/crossfade-next-muted-gap
- **Notes:** Synced from Geethub issue #294. Likely a regression of crossfade-manual-skip's fade ramp.

### iphone-autoadvance-stall: iPhone doesn't autoplay the next song
- **Status:** merged
- **Priority:** medium
- **Description:** Bug: on iPhone, when a song finishes the next one doesn't start; the user has to open the video tab and press pause/play to get it going. Next track should start on its own.
- **Touches:** track-end / auto-advance handling on iOS Safari/PWA.
- **Branch:** agent/iphone-autoadvance-stall
- **Notes:** Synced from Geethub issue #286. Related to the background auto-advance work in bld-background-tab-autoadvance but iPhone-specific.

### ads-label-desktop-position: "Ads playing?" button sits too close to the bottom of the screen on desktop
- **Status:** shipped
- **Priority:** medium
- **Description:** Bug: on desktop the "Ads playing?" report button is crowded against the bottom edge. Give it proper spacing.
- **Touches:** ads report button (merged ads-button-extended-mix), desktop layout.
- **Branch:**
- **Notes:** Synced from Geethub issue #290.

### previous-track-instant: Previous track should load as instantly as next
- **Status:** approved
- **Priority:** medium
- **Description:** Going back to the previous song should be as instant as skipping forward (keep the previous track warm/preloaded).
- **Touches:** prev/next preload logic.
- **Branch:** agent/previous-track-instant
- **Notes:** Synced from Geethub issue #284.

### library-artists-section: Library: Artists section, and adding an artist adds their albums
- **Status:** merged
- **Priority:** medium
- **Description:** Add an Artists section to the library alongside albums/playlists/podcasts. When you add an artist, all their albums should also appear in the Albums section.
- **Touches:** renderLibrary filters/sections, artist add flow.
- **Branch:** agent/library-artists-section
- **Notes:** Synced from Geethub issue #291 and #293. Folded #293 (artist adds all albums) into this entry since it depends on the Artists section.


### artists-albums-resume-backfill: Artist album fill resumes after app close, and covers artists added before
- **Status:** merged
- **Priority:** medium
- **Description:** Follow-up to library-artists-section. (1) If the app closes before an artist's albums finish loading, resume the remaining albums on the next app load. (2) Artists already in a library before the Artists section shipped should also get their albums added (one-time backfill). Keep iTunes as the album source and the 20-album cap (MAL GRIOT 2026-10-06).
- **Touches:** artist album fill (library-artists-section code), app startup.
- **Branch:** agent/artists-albums-resume-backfill
- **Notes:** Decisions from MAL GRIOT 2026-10-06 on the library-artists-section open questions.

### crossfade-start-and-preload: Crossfaded songs always start from the beginning; next song always preloads
- **Status:** merged
- **Priority:** medium
- **Description:** Follow-up to crossfade-next-muted-gap. (1) Skip crossfade (startSkipCrossfade) and automatic crossfade (runCrossfade) should rewind an already-preloaded deck to 0 like promoteDeckDirect does (#213), so songs always start at the beginning. (2) The next song should always get preloaded, including when a skip fade is cancelled (e.g. user pauses mid-fade).
- **Touches:** startSkipCrossfade, runCrossfade, schedulePreload.
- **Branch:** agent/crossfade-start-and-preload
- **Notes:** Found by the crossfade-next-muted-gap lane; approved by MAL GRIOT 2026-10-06.
### library-collapsible-sections: Library sections collapse/expand with a +/arrow by the title
- **Status:** merged
- **Priority:** medium
- **Description:** Each library section header (Playlists, Albums, Podcasts, Artists) gets a plus or arrow to fold it open/closed. Only in the "All" view, not when a single-type filter is selected.
- **Touches:** renderLibrary section headers.
- **Branch:** agent/library-collapsible-sections
- **Notes:** Synced from Geethub issue #292.

### library-window-title: Library window should be titled "Library" like the queue window
- **Status:** shipped
- **Priority:** medium
- **Description:** Add a "Library" title to the library panel, matching how the queue panel is labeled.
- **Touches:** library panel header.
- **Branch:**
- **Notes:** Synced from Geethub issue #289.

### queue-add-collections: Add whole playlists/albums/podcasts to the queue
- **Status:** merged
- **Priority:** medium
- **Description:** Let users add an entire playlist, album, or podcast to the queue (not just single tracks).
- **Touches:** library item menus, queue.
- **Branch:** agent/queue-add-collections
- **Notes:** Synced from Geethub issue #288. Extends merged library-hold-add-to-queue (tracks only).

### library-now-playing-highlight: Highlight the playing playlist in the library; blinking speaker by the playing song
- **Status:** approved
- **Priority:** medium
- **Description:** When a playlist is playing, highlight it in the library. The playing song gets a slowly blinking speaker icon next to it in the library. Also show the playing playlist's name somewhere in the queue window.
- **Touches:** renderLibrary, queue panel header.
- **Branch:** agent/library-now-playing-highlight
- **Notes:** Synced from Geethub issue #287.

### album-art-mode-tap: Album art style button cycles modes on tap, no dropdown
- **Status:** shipped
- **Priority:** medium
- **Description:** Pressing the album art style button should just switch to the next mode directly instead of opening a menu.
- **Touches:** album art mode button/menu.
- **Branch:**
- **Notes:** Synced from Geethub issue #285.

### playlist-add-multiselect: "Add to playlist" should allow picking multiple playlists with checkboxes
- **Status:** merged
- **Priority:** medium
- **Description:** When adding a loaded song to a playlist, show the playlists with checkboxes so it can go into several at once.
- **Touches:** add-to-playlist picker (see single-song-paste-prompt).
- **Branch:** agent/playlist-add-multiselect
- **Notes:** Synced from Geethub issue #283.

### playback-pauses-when-unfocused: Music pauses in the mini-player and when switching apps
- **Status:** ready
- **Priority:** high
- **Description:** Bug: playback stops whenever EBBLESS loses focus. Desktop: the mini-player pauses for every song (e.g. "ninety-three 'til infinity and beyond (mixed)" by Andre 3000 plays in the app tab, pauses in the mini-player and won't resume). Also pauses when switching to another app, not just another tab. Music should keep playing in the background and in the mini-player.
- **Touches:** visibility/blur handling, mini-player (merged desktop-mini-player, mobile-resume-pause-regression).
- **Branch:**
- **Notes:** Synced from Geethub issues #304, #307 and #308 (folded together: same symptom, likely one regression). Device for #308 not stated.

### miniplayer-window-fixes: Mini-player window sizing, slower fade, bottom snap, no border
- **Status:** in-progress
- **Branch:** agent/miniplayer-fixes
- **Priority:** medium
- **Description:** Mini-player fixes: (1) when it shrinks, the window itself should shrink, not just the player inside it; (2) it fades too soon, wait about a minute of inactivity; (3) resetting the size should anchor to the bottom edge, not snap to the top; (4) remove the window border entirely if the platform allows.
- **Touches:** mini-player (merged miniplayer-idle-fade, mini-player-polish).
- **Branch:**
- **Notes:** Synced from Geethub issue #305.

### silence-restart-at-zero: After sitting silent, the song doesn't restart from the beginning
- **Status:** draft
- **Priority:** medium
- **Description:** Bug: when music has sat paused/silent for a while, it's supposed to restart the track at 0:00 on resume, but it doesn't.
- **Touches:** resume-after-idle logic.
- **Branch:**
- **Notes:** Synced from Geethub issue #295. Title only.

### fullscreen-controls-collide-title: Desktop fullscreen: player controls overlap the title and artist
- **Status:** draft
- **Priority:** medium
- **Description:** Bug: in desktop fullscreen the player controls get pushed up and collide with the song title and artist. Keep them clearly separated.
- **Touches:** desktop fullscreen layout (merged fullscreen-player-controls).
- **Branch:**
- **Notes:** Synced from Geethub issue #297.

### lp-game-hide-art-selector: Desktop LP game: album art selector should fade away while playing
- **Status:** in-progress
- **Branch:** agent/lp-selector-fade
- **Priority:** medium
- **Description:** Bug: on desktop, the album art style selector stays visible during the LP game. It should fade out while the game is active.
- **Touches:** LP game (merged lp-game-desktop-fullscreen-layout).
- **Branch:**
- **Notes:** Synced from Geethub issue #296.

### library-section-header-clickable: Library section titles: whole word toggles, no arrows
- **Status:** in-progress
- **Priority:** medium
- **Description:** Bug: on desktop the dropdown arrow wraps to a different line than the library section title. Make the whole title clickable to fold/unfold the section and remove the arrows. Restore section titles to the same size as mobile.
- **Touches:** library section headers (library-collapsible-sections).
- **Branch:** agent/lib-section-headers
- **Notes:** Synced from Geethub issue #300. Follow-up to library-collapsible-sections. Desktop section titles are currently oversized; restore them to mobile proportions.

### artist-bio-panel: Tap an artist's name to see their bio in the library
- **Status:** ready
- **Priority:** medium
- **Description:** Clicking an artist's name on the player opens their artist page in the library window: bio, fun facts/trivia, tour dates, website and social links (links open in the player section), pulled from verified sources.
- **Touches:** player artist name, library artist view.
- **Branch:**
- **Notes:** Synced from Geethub issues #299 and #298 (bio half of #298 folded here).

### artist-singles-features-albums: Artist albums should include singles and features
- **Status:** draft
- **Priority:** medium
- **Description:** When an artist is loaded, besides their albums, add an album collecting their singles and one collecting songs where they're the featured artist.
- **Touches:** artist album fill (merged library-artists-section).
- **Branch:**
- **Notes:** Synced from Geethub issue #298 (albums half; base "add all albums" already merged).

### cassette-animation-vibrance: Cassette animation: brightest tapes first, as vibrant as the art
- **Status:** draft
- **Priority:** medium
- **Description:** In the third desktop cassette animation the tapes go from most vibrant to dullest; keep the animation but reverse it (most vibrant first, least vibrant last). Make the tapes as vibrant as the album art. On mobile, the third animation should be the other two animations combined.
- **Touches:** cassette fullscreen animations.
- **Branch:**
- **Notes:** Synced from Geethub issue #306.

### cymatics-more-patterns: More cymatics patterns (49, including a spiral)
- **Status:** draft
- **Priority:** medium
- **Description:** Expand the cymatics visualizer to 49 patterns, including at least one spiral.
- **Touches:** cymatics visualizer.
- **Branch:**
- **Notes:** Synced from Geethub issue #303.

### visualizer-rotate-button: Button that makes the visualizer rotate
- **Status:** draft
- **Priority:** medium
- **Description:** Add a button that sets the visualizer slowly rotating.
- **Touches:** visualizer controls.
- **Branch:**
- **Notes:** Synced from Geethub issue #302. Title only.

### audiosurf-game: Audiosurf-style game in EBBLESS (future)
- **Status:** draft
- **Priority:** low
- **Description:** Longer-term idea: bring an Audiosurf-style ride-the-song game into EBBLESS, playable with the user's own tracks.
- **Touches:** new feature.
- **Branch:**
- **Notes:** Synced from Geethub issue #301. Big scope; candidate for archived until after MVP.
