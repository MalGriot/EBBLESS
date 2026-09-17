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
- **Status:** ready
- **Priority:** medium
- **Description:** On desktop, there's no player/controller visible centered
  in the UI at all (not just off to one side) - just blank space where it
  should be. Investigate why it's not rendering/positioned there and fix so
  the player/controller appears centered in the desktop layout.
- **Touches:** desktop layout CSS/markup for the player/controller region in
  `index.html` (unconfirmed - needs investigation of the exact selector and
  why it isn't showing).
- **Branch:** (none yet)
- **Notes:** Synced from Geethub issue #23. Reporter clarified (2026-09-18):
  it's not just off-center, there's no center player visible at all on
  desktop. Checked against existing entries - distinct from
  `player-button-colors` (that one is about button color/contrast on an
  existing, visible player, not this one's absence/positioning), no overlap
  found.
