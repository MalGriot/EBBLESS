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

### tutorial-i-tried-it-album: "I Tried It" tutorial sample should show as a two-track album
- **Status:** review
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

  **Assumption to confirm:** Wind Horse Records' own Bandcamp listing
  (windhorserecords.bandcamp.com/album/unnayanaa-mal-griot-i-tried-it)
  lists this as a two-track release: "I Tried It (Original Mix)" - 5:56,
  and "I Tried It (Radio Edit)" - 3:34. The 5:56 duration matches what the
  tutorial already had hardcoded for the currently-"playing" track, which
  corroborates the Original Mix being track 1. Apple Music's own listing
  treats "I Tried It" as a single (1 track), and I could not scrape
  Spotify's own track listing directly (its web player is a JS SPA that
  didn't yield a track list through a plain HTML fetch) to confirm the
  second track's exact title/casing there - used "I Tried It (Radio Edit)"
  based on the Bandcamp listing. Please confirm against the actual Spotify
  album page that the second track is titled that way (and not, say,
  "I Tried It - Radio Edit" with a dash, or a different edit name
  entirely) before merging.
- **Verified:** Syntax-checked (`node -e "new Function(...)"` over the
  extracted `<script>` block - no errors). Loaded the file in a live
  browser preview (a plain `python3 -m http.server` over this worktree, not
  the main checkout) and exercised both the real timed intro (`?intro=1`)
  and the deterministic debug beats (`?introBeat=library` /
  `?introBeat=library-panel`): the library card now shows "2 tracks", the
  playlist panel shows both "I Tried It" and "I Tried It (Radio Edit)" rows
  with the correct artist/art, and the rest of the sequence (paste/load
  beats, player, art-style menu, captions/timing) played through
  unaffected. No new console errors or failed network requests against the
  worktree's own server; the console/network noise seen during testing
  traced to unrelated stale tabs/servers left over from other concurrent
  sessions on this machine, not this change.
