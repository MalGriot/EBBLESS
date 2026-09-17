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
  **Needs a decision before this is fully live:** the Spotify lookup is
  backed by a new `GET /spotifyart` endpoint in `worker/src/index.js` using
  Spotify's Client Credentials flow — it needs `SPOTIFY_CLIENT_ID` /
  `SPOTIFY_CLIENT_SECRET` set via `wrangler secret put` and the worker
  redeployed before it does anything; until then it's a safe no-op and the
  app falls back to each source's native art (verified: Spotify links show
  real Spotify CDN art, SoundCloud keeps its own, Apple Music falls back
  cleanly with no errors). The agent deliberately did not deploy this
  itself since it's a live production/infra change — that's your call.

### lockscreen-album-art: Lock screen art should be Spotify album art on mobile
- **Status:** draft
- **Priority:** low (deprioritized below mobile-install-button; also blocks on spotify-album-art landing first)
- **Description:** On mobile, the OS lock-screen / media-session artwork
  should show the Spotify album art (same Soundcloud exception as
  `spotify-album-art`: if it's a Soundcloud link, use Soundcloud's own art).
  Currently it isn't consistent — YouTube art is still showing up sometimes
  on the lock screen instead.
- **Touches:** mobile media session metadata (`MediaSession` API /
  equivalent), lock screen artwork.
- **Branch:**
- **Notes:** Synced from Geethub issue #3. Likely wants the same
  art-resolution logic as `spotify-album-art` — implement that one first if
  both get queued together, or share a helper.

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
