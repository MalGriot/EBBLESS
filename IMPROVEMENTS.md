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
     manager's judgment of urgency/impact, always weighting bug fixes ahead
     of new features at the same tier (per Geethub issue #48).
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
- **Status:** draft
- **Priority:** medium
- **Description:** Restructure the onboarding tutorial into chapters. Each
  chapter's animation loops in place until the user taps "next" to advance;
  music plays in per-chapter clips, only starting when that chapter begins
  (on "next"), rather than running continuously start to finish.
- **Touches:** `runIntro()` and the tutorial beat sequence in `index.html`.
- **Branch:** (unclaimed)
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
- **Status:** draft
- **Priority:** medium
- **Description:** The tutorial's first frame should ensure everything
  (assets/animations) is loaded before playback starts - reporter says
  pacing is currently glitchy, sometimes too fast, sometimes out of sync.
- **Touches:** `runIntro()` startup / asset preload.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #62.

### tutorial-crossfade-demo: Tutorial should visually animate the crossfade slider
- **Status:** draft
- **Priority:** low
- **Description:** In the tutorial's crossfade beat, after the crossfade
  toggle is switched on, animate the crossfade slider visually moving from
  0 to 10 seconds, then settling to 5 seconds.
- **Touches:** tutorial crossfade beat (near the caption-timing fix in
  `tutorial-caption-timing`, merged).
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #63.

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
- **Status:** draft
- **Priority:** medium
- **Description:** The Settings "Report a bug" button currently opens a
  mailto link (per `bug-report-button`, merged). Reporter wants it to lead
  to an actual bug-report form on GitHub instead (e.g. the same
  `improvement-idea.yml`-style issue template flow already used for
  suggestions).
- **Touches:** Settings screen bug-report button/link.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #27. Judgment call: replace the
  mailto entirely, or offer both? Flagging for your call rather than
  guessing.

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
- **Status:** draft
- **Priority:** medium
- **Description:** The current lyric line should glow in a color. Passed
  lines should keep glowing in that same color but at progressively lower
  vibrance, fading all the way back to the first lyric line (a trailing-glow
  effect). If the user manually selects/clicks a lyric line, the glow/trail
  state should stay consistent with wherever they clicked.
- **Touches:** lyrics view rendering.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #51.

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
- **Status:** draft
- **Priority:** medium
- **Description:** Swiping left or right on the album art in the player
  should skip to the next/previous track respectively.
- **Touches:** player view, album art touch handlers.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #72.

### album-art-doubletap: Double-tap album art / cymatics to toggle fullscreen (or like?)
- **Status:** draft
- **Priority:** low
- **Description:** Double-tapping the album art (or cymatics view) should
  toggle fullscreen. Reporter raised an open question themselves: might it
  be more intuitive for double-tap to instead heart/like the track (the
  common gesture convention)? Needs your call before implementation.
- **Touches:** player view / cymatics view touch handlers.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #73. **Needs your decision:**
  fullscreen-toggle vs. like-track for the double-tap gesture.

### video-playback-option: Add a video-playback button next to lyrics
- **Status:** draft
- **Priority:** medium
- **Description:** Add an option to play the actual YouTube video (not just
  audio) for the current track, via a new button placed next to the existing
  lyrics button.
- **Touches:** player view controls, YouTube embed/player logic.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #45.

### desktop-mini-player: Floating desktop mini-player when tab loses focus
- **Status:** draft
- **Priority:** medium
- **Description:** When the user switches away from the EBBLESS browser tab
  on desktop, show a small, movable/draggable mini-player in a corner of the
  screen with full playback controls.
- **Touches:** desktop layout, likely a `document.hasFocus()`/`visibilitychange`
  trigger plus a new floating-widget component. Picture-in-Picture Web API
  may be relevant here (real OS-level floating window) - worth researching
  as an alternative to a plain in-page floating div.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #64. Bigger lift than most entries in
  this batch - likely its own lane.

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
- **Status:** draft
- **Priority:** medium
- **Description:** On desktop, clicking Settings currently navigates to a
  separate screen. Instead it should pop up in the player pane's spot,
  replacing the player view there, so the header nav doesn't change.
- **Touches:** desktop split-view layout, Settings navigation.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #78. Same general area as
  `player-controller-centering` (merged) - the desktop split-pane layout -
  worth the same care around `min-height`/z-index quirks found there.

### desktop-player-fullscreen-toggle: Desktop player fullscreen should slide panels off, nav buttons become toggles
- **Status:** draft
- **Priority:** medium
- **Description:** On desktop, with the player centered, its fullscreen
  button should slide the library/playlist panel off to the left and the
  queue panel off to the right, opening the player to the full screen width.
  The header nav's Queue and Library buttons should become toggles that
  show/hide those panels directly (rather than just navigating).
- **Touches:** desktop split-view layout, header nav buttons.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #79. Related to `desktop-settings-inline`
  and `player-controller-centering` (merged) - same desktop-layout area,
  worth planning together.

### audio-ducking: Auto-dip EBBLESS volume when other audio plays (desktop)
- **Status:** draft
- **Priority:** low
- **Description:** On desktop, if audio starts playing from another source
  (another tab/app), EBBLESS should detect it and automatically lower its
  own volume.
- **Touches:** playback volume control; likely no reliable cross-app/tab
  audio-detection API exists in browsers - needs research into feasibility
  (e.g. only detectable for other tabs in the same browser via the Web Audio
  API, not system-wide).
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #80. Flagging a feasibility risk -
  true system-wide audio detection isn't available to web apps; may only be
  partially achievable.

### library-hold-add-to-queue: Hold a library track to add to queue / play next
- **Status:** draft
- **Priority:** medium
- **Description:** Holding down on a track in the library should bring up a
  menu with "add to queue" and "play next" options. "Play next" should play
  right after the currently-playing song, with the rest of the queue
  continuing unchanged after that.
- **Touches:** library track rows, queue management.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #52.

### playlist-image-reset: Add "reset to original art" in playlist image picker
- **Status:** draft
- **Priority:** low
- **Description:** The playlist hold-menu's "change image" screen should
  offer a "reset to original" option. If the playlist never had original
  art, this should just clear whatever custom image was assigned in
  EBBLESS.
- **Touches:** playlist image-change UI.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #56.

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
- **Status:** draft
- **Priority:** medium
- **Description:** Add the ability to share a specific song or playlist - it
  should generate a nice link + message that, when opened, leads the
  recipient to install/open EBBLESS and play that song or playlist.
- **Touches:** new share feature, likely needs a share-link resolution route
  on the backend/worker plus a Web Share API integration client-side.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #58. Related to `settings-share-app`
  above (sharing the app itself) - different scope, kept separate.

### single-song-paste-prompt: Prompt for target playlist when pasting a single song
- **Status:** draft
- **Priority:** medium
- **Description:** If the pasted link resolves to a single song (not a
  playlist/album), prompt the user for which playlist it should be added
  to - with a quick option to just add it to Liked Songs.
- **Touches:** `beginImport()` / paste-a-link flow.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #65.

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
- **Status:** draft
- **Priority:** medium
- **Description:** The Currents playlist should be built from: one new/
  unplayed song per saved playlist, three suggested songs from the Liked
  Songs playlist, and one song based on the most recently played track -
  selection should weigh genre, year, and vibe, not just matching artist or
  album.
- **Touches:** Currents/recommendation generation logic.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #36. Related to `blend-playlist`
  below (a second, broader auto-playlist) and `discovery-pipeline-metadata`
  - all touch recommendation logic, worth reviewing together for shared
  helpers.

### blend-playlist: Add an auto-updating "Blend" playlist across all saved playlists
- **Status:** draft
- **Priority:** medium
- **Description:** Add a playlist that pulls tracks from all of the user's
  saved playlists, refreshing with a different set of songs every day.
- **Touches:** new auto-playlist generation logic (parallel to Currents).
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #60.

### encourage-liking-songs: Nudge users to like more songs
- **Status:** draft
- **Priority:** low
- **Description:** Add UX nudges that encourage users to like more songs, to
  build a richer per-user dataset - goal is a personal algorithm that
  surfaces both known favorites and undiscovered music the user will likely
  love, not just generic popularity.
- **Touches:** UI prompts around the like button; unclear exact mechanism -
  needs design thought before implementation.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #40. Vague/directional - needs a
  concrete design decision (what nudge, when, how often) before it's
  actionable as a lane.

### accounts-profiles: Add accounts and cross-device profile sync
- **Status:** draft
- **Priority:** low
- **Description:** Add accounts/profiles so the experience (library,
  playlists, likes) is consistent between mobile and desktop, survives a
  device switch, and builds a long-term per-person dataset for
  personalization.
- **Touches:** major feature - needs backend auth, a database/storage layer
  beyond the current per-device `localStorage` model, and a data-migration
  story for existing users' local data.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #75. Largest-scope item in this
  batch by far - architectural decision, not a quick lane. Recommend
  discussing approach before queuing.

### instant-resume-caching: Cache current track for instant resume across app switches
- **Status:** draft
- **Priority:** medium
- **Description:** Switching away from and back to the app currently takes
  too long to resume the currently-loaded song - it should be cached so
  playback resumes instantly. Also ensure lock-screen and notification-drop
  -down playback controls stay fully responsive.
- **Touches:** playback state caching, `mobile-background-resume` (merged)
  - related but distinct: that fixed the splash re-appearing on resume, this
  is about resume *speed* and lock-screen control responsiveness.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #41.

### loading-progress-indicator: Add a loading screen/progress indicator while a track loads
- **Status:** draft
- **Priority:** medium
- **Description:** While a track is loading, show a loading indicator -
  reporter suggests reusing the play button's existing filling-ring
  animation style as a progress indicator.
- **Touches:** player view, track-load state.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #42.

### play-first-loaded-track: Play first resolved track immediately during playlist sync
- **Status:** draft
- **Priority:** medium
- **Description:** When a playlist is pasted, the first track to finish
  resolving should start playing immediately rather than waiting for the
  whole playlist. Skip should be disabled until the whole playlist has
  loaded (then re-enabled) - or, alternatively, show a "play now" prompt on
  the loading screen instead of auto-playing.
- **Touches:** `beginImport()` playlist-load flow, playback start trigger.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #82. Reporter offered two options
  (auto-play immediately vs. a "play now" prompt) - leaning toward the
  prompt per their own follow-up ("Actually, it should be a prompt"), but
  flagging both for your call.

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
- **Status:** draft
- **Priority:** low
- **Description:** Add a volume equalizer so loudness is consistent across
  different tracks (avoids jarring volume jumps between songs).
- **Touches:** playback audio pipeline - likely Web Audio API gain
  normalization.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #37. No further detail given in the
  issue - needs scoping (per-track normalization vs. a manual EQ UI) before
  it's actionable.

### clip-editor: Audio clip editor with a "My Clipsss" playlist
- **Status:** draft
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
- **Status:** draft
- **Priority:** low
- **Description:** After a few days of use, show a thumbs-up/thumbs-down
  prompt. Either choice should prompt for more detail, and that feedback
  should feed into this same improvements queue - but tagged as
  user-submitted (same as the existing GitHub-idea intake channel) and
  waiting for Mal's confirmation before any lane is dispatched on it, same
  as everything else synced from GitHub.
- **Touches:** new in-app prompt/survey UI, feeds into the GitHub-issue
  intake channel already described above.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #44.

### tester-feedback-form: Form for beta testers to report on the app
- **Status:** draft
- **Priority:** low
- **Description:** Add a form specifically for beta testers to give
  structured feedback on the app.
- **Touches:** likely reuses/extends the existing `improvement-idea.yml`
  GitHub issue template intake channel, or a dedicated form.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #47. Overlaps somewhat with
  `feedback-prompt` above - both are feedback-collection mechanisms;
  worth discussing whether one covers both needs before building both.

### library-search: Add a search function for the user's own library
- **Status:** draft
- **Priority:** medium
- **Description:** Users should be able to search their own library for a
  song or playlist they already have, rather than scrolling to find it.
- **Touches:** library view UI, likely a new search input + filter over the
  in-library playlists/tracks list.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #84.

### playlist-vibe-search: Search Spotify/Apple Music/SoundCloud for playlists by vibe/keyword
- **Status:** draft
- **Priority:** medium
- **Description:** The playlist-input bar should let a user search by vibe
  or keyword (not just paste a direct link) and get back a matching
  playlist - or a list of candidates to pick from - that then loads
  straight into their library.
- **Touches:** playlist input bar / import flow, likely a new search
  endpoint against Spotify/Apple Music/SoundCloud rather than the existing
  direct-link resolve pipeline.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #85. Distinct from `library-search`
  above (that one searches what the user already has; this one searches
  external platforms to find something new to add) - kept separate.

### mobile-ipod-ui: Mobile UI mode styled like the original iPod (click wheel)
- **Status:** draft
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
- **Status:** draft
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
- **Status:** draft
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
- **Status:** draft
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
- **Status:** draft
- **Priority:** medium
- **Description:** On desktop, album art often renders blurry or low
  resolution. Investigate the desktop art-rendering path and prefer/request
  higher-resolution source images (e.g. larger iTunes/Spotify/SoundCloud
  artwork sizes) where the current pipeline is settling for a smaller image.
- **Touches:** track/playlist art resolution (`resolveTrackArt()`,
  `searchItunesTrackArt()`/`artworkUrls()`), desktop album art rendering.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #91. No existing entry covers image
  resolution/sharpness specifically - `album-art-icon-colors` and
  `album-art-2x2-grid-bug` are unrelated bugs (accent color, placeholder
  grid), not resolution.

### lyrics-accuracy: Wrong/missing lyrics even when correct lyrics are findable elsewhere
- **Status:** draft
- **Priority:** medium
- **Description:** Sometimes lyrics don't show even though the correct
  lyrics are findable on Google or Genius. Reporter's example: "Nova Deli"
  by Luedji Luna (genius.com/artists/Luedji-luna) has lyrics on Genius but
  not in-app. Investigate the current lyrics-lookup source/matching and
  improve match accuracy/coverage, possibly by using Genius as a source or
  fallback.
- **Touches:** lyrics fetch/matching pipeline (wherever lyrics are looked up
  by title/artist).
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #90. No existing entry covers lyrics
  accuracy/sourcing - `lyrics-glow-trail` above is a visual effect on
  already-displayed lyrics, unrelated.

### background-playlist-loading: Playlist/album loading should run in the background with a progress bar
- **Status:** draft
- **Priority:** medium
- **Description:** When a playlist/album/song is loading, the user should be
  able to freely return to the main pages instead of being stuck waiting - a
  progress bar somewhere in the UI shows load status and disappears on
  completion. On finish, default behavior is to just add the loaded
  playlist/album to the library (no auto-play); optionally, the user should
  be able to choose to play it immediately and replace the current queue
  once loading finishes.
- **Touches:** `beginImport()` playlist-load flow, loading-state UI.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #93. **Judgment call, flagging for
  your input:** this overlaps two existing draft entries -
  `loading-progress-indicator` (a progress-bar/loading indicator during
  track load) and `play-first-loaded-track` (play-immediately vs. a "play
  now" prompt when a playlist is pasted). Kept as its own entry rather than
  folding in, since it adds two things neither covers: (1) freely navigating
  away from the loading screen instead of being blocked on it, and (2) a
  default "just add to library, don't auto-play" behavior. If you'd rather
  these three be tackled as one combined lane, say so when picking what's
  `ready`.

### podcasts: Support loading and playing podcasts
- **Status:** draft
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
  picked up.

### currentsss-casing-followup: Fix "Currents" playlist casing to "CuRRentSSsss"
- **Status:** review
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
- **Status:** draft
- **Priority:** medium
- **Description:** Add an option to remove individual tracks from a playlist
  directly from the library view.
- **Touches:** library playlist view, track row actions/menu.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #95.

### fullscreen-lp-cassette-visual: Fullscreen on LP/cassette should fullscreen that visual, not standard album art
- **Status:** draft
- **Priority:** medium
- **Description:** Activating fullscreen while the LP (spinning record) or
  cassette art style is selected currently switches to the standard album
  art in fullscreen instead of fullscreening the LP/cassette visual itself.
- **Touches:** album art style fullscreen logic (art-style picker /
  fullscreen toggle).
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #96. Distinct from `record-cassette-size`
  (merged - that changed the visuals' size, not fullscreen behavior).

### fullscreen-player-controls: Fullscreen mode should expose all player controls
- **Status:** draft
- **Priority:** medium
- **Description:** Fullscreen mode should show all the player controls -
  shuffle, loop, album art style switcher, etc. - not just a subset.
- **Touches:** fullscreen player view.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #97. Related to
  `desktop-player-fullscreen-toggle` (draft, desktop-specific panel-sliding
  behavior) but distinct - this is about which controls are present/visible
  in fullscreen generally, not desktop panel layout. Worth reviewing
  together since both touch fullscreen player UI.

### queue-playlist-row-buttons: Collapse queue's playlist-section row buttons into a 3-dot menu
- **Status:** draft
- **Priority:** medium
- **Description:** The playlist section at the bottom of the queue menu has
  so many buttons per track that the title becomes unreadable. Each track
  row there should collapse down to a single 3-dot button that opens the
  other functions, matching the pattern used elsewhere.
- **Touches:** queue panel's playlist section, track row markup.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #98.

### player-hud-remove-playlist-label: Remove playlist title/track number from main player HUD
- **Status:** ready
- **Priority:** medium
- **Description:** Remove the playlist name and track number (currently
  sitting between the artist name and the progress bar) from the main
  player HUD.
- **Touches:** player view HUD layout.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #99.

### library-playlist-footer-overlap: Footer player blocks last entry when viewing a playlist on mobile
- **Status:** draft
- **Priority:** medium
- **Description:** On mobile, opening a playlist from the library, the
  footer player bar covers/blocks the bottom-most track entry in the list.
- **Touches:** library playlist-detail view, mobile footer player spacing.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #100. Related to `player-mobile-spacing`
  (merged - that fixed spacing within the player view itself) but this is a
  different surface (the library's playlist-detail list being covered),
  kept separate.

### discovery-radio-continuation: Discovery should keep playing a radio around a song after it ends
- **Status:** draft
- **Priority:** medium
- **Description:** When playing a single song with Discovery on, once it
  finishes the app should keep playing a radio built around that song
  (rather than stopping). Loading a song while something's already playing
  should build a queue around it.
- **Touches:** Discovery/radio playback logic, queue building.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #101.

### queue-close-return-view: Closing the queue should return to the view you were on
- **Status:** draft
- **Priority:** medium
- **Description:** On mobile, closing the queue panel should return you to
  whichever view you were on just before opening it (player or library),
  instead of always landing somewhere fixed.
- **Touches:** queue panel open/close navigation state, mobile.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #102.

### save-discovery-playlist-to-library: Save modified/discovery-generated playlists to library
- **Status:** draft
- **Priority:** medium
- **Description:** Let the user save a modified playlist, or a radio station
  generated by Discovery, as a new playlist in their library.
- **Touches:** playlist save/create flow, Discovery radio generation.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #103. Related to `currents-playlist-algorithm`
  and `blend-playlist` (both draft, auto-playlist generation) but distinct -
  this is about saving/persisting generated or edited results, not defining
  a new auto-playlist's selection rules.

### background-app-switch-playlist-loading: Playlist loading should continue while app is backgrounded on mobile
- **Status:** draft
- **Priority:** medium
- **Description:** On mobile, if a playlist is still loading and the user
  switches to another app, loading currently stops. It should continue in
  the background instead.
- **Touches:** `beginImport()` playlist-load flow, mobile backgrounding
  behavior (same general area as `mobile-background-resume`, merged).
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #104. **Judgment call, flagging for
  your input:** overlaps `background-playlist-loading` (draft, #93 - a
  progress bar + freedom to navigate away while loading in the foreground).
  Kept separate since this is specifically about loading surviving an app
  backgrounding/process-suspend event on mobile, a different technical
  problem (and may hit the same real OS constraints `mobile-background-resume`
  ran into) rather than just a UI/progress-bar change. Say so if you'd
  rather these be tackled as one lane.

### world-radio-addon: World radio - pick a region on a map, hear music from there
- **Status:** draft
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
- **Status:** draft
- **Priority:** medium
- **Description:** When the app loads, it currently plays the whole tutorial
  song; it should instead just play the first second and then stop.
- **Touches:** splash/tutorial audio trigger (`#onbMusic`), same area as
  `splash-tutorial-music-preload` (merged).
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #106. `splash-tutorial-music-preload`
  added playing the first beat of tutorial music on splash load; this
  report says the full song now plays instead of stopping after a moment -
  likely a follow-up fix/regression on that same feature rather than a
  duplicate ask, so kept as its own entry.

### discover-artist-this-is-playlist: Discover should pull from the "This Is [Artist]" Spotify playlist
- **Status:** draft
- **Priority:** medium
- **Description:** The Discover feature should source from Spotify's
  official "This Is [artist name]" playlists for the relevant artist(s).
- **Touches:** Discovery source-fetching logic.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #107.

### cymatics-fullscreen-dot-density: Add more dots to cymatics visualizer in fullscreen
- **Status:** ready
- **Priority:** low
- **Description:** In fullscreen, the cymatics visualizer's dots look too
  spread out - consider adding more dots when in fullscreen to fill the
  larger space.
- **Touches:** cymatics visualizer rendering/dot-count logic.
- **Branch:** (unclaimed)
- **Notes:** Synced from Geethub issue #108. Distinct from
  `cymatics-heart-centering` (merged - title centering) and
  `cymatics-true-black-contrast` (merged - background color) - this is
  about dot density/spacing in fullscreen specifically.

### spinning-record-realism: Make the spinning record feel physical, tactile, and restrained
- **Status:** draft
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
