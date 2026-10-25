# YouTube ads: state of play

Written 2026-10-25 from IMPROVEMENTS.md, docs/SPONSORBLOCK-AND-PODCAST-ADS.md and
a check of `index.html` (nothing was run against a real ad; no code changed).
Shell cache at time of writing: `ebbless-shell-v406`.

## The one fact that shapes everything

YouTube ads come from YouTube's embedded player, a cross-origin iframe. The ad
is stitched into the stream on YouTube's side (pre-roll, mid-roll, per-video
flag). The page cannot see inside the iframe, cannot remove the ad, and cannot
fast-forward it. EBBLESS can only watch outside signals (no duration, a clock
that is not moving, a duration that does not match the song, frozen playback)
and then route around the ad. That is what `deckAdReason` reads today.

## What already ships

All of it is page code in `index.html`, so it runs the same on web, installed
web app, Android app and Mac app. Nothing branches on platform.

| What | Where it lives | Version / commit |
|---|---|---|
| Ad detection from outside signals, zero-ads gate holds a song silent until it is clean | `deckAdReason`, `gateDeckSound` | tester #20, `yt-ad-onset`; gate in place before #523 |
| Ad dodge: after 8s of pre-roll (`AD_DODGE_AFTER_MS`) or 2.5s mid-song (`AD_SKIP_AFTER_MS`), swap to the preloaded next song; the held song plays after, from the top | `maybeDodgeAd`, `skipHeldAd`, `returnFromAdDodge` | #523 / #558, 2026-10-15, cache v236-v237 |
| "Ad playing. Skipping in Xs" countdown, ad cover in the card and F fullscreen | `adWaitText`, `ytPanelSync` | #523 |
| Ad log (`window.ebblessAdLog`, `adLog`) and "Ads playing?" report that now says which app path and whether the page was hidden | `adsReportBtn`, `adLog` | #518, cache v324 |
| Alternate link: on an ad, swap to a near-certain other upload (title 1.0, artist named, length within 2s), else a SoundCloud upload with identical title; once per song | `adTryAlternate` | #624, cache v335 |
| Background standby: next song loads muted in the second deck, waits up to 60s for its own ad, does one reload of the same video after 8s | `schedulePreload`, `checkDeckReady` (`standby-reload`, `standby-alt`) | #561 / #557, agent/q-desktop-ads |
| Stand-in: play a 90%+ match at once while the original clears its ad, then fade back | `adStandIn` | commit 8ac0ca5, cache v392 |
| Fade the first song back in after a dodge | `returnFromAdDodge` | #658, cache v386 |
| SoundCloud blocked/unplayable falls back to a YouTube link | `scUnplayable` | shipped with SoundCloud sources |
| SponsorBlock tap-to-skip for baked-in sponsor reads (podcasts via YouTube; songs opt-in "Talking") | `sbWatch` | #573, cache v314 |

Not ad handling but related: owner-uploaded tracks get no ads, and feed audio
podcasts (#575, NoSleep) have ads baked into the mp3, which EBBLESS leaves alone.

## The five open ideas

All five are title-only Geethub items in the "ad group" (#541) with no concrete
technique. A 2026-10-18 pass found nothing safe beyond what ships.

- **#527, #528, #529, #539** ("possible workaround", "another", "yet another",
  "possible"): identical stubs. Covered by dodge, alternate link, held-ad skip,
  the zero-ads gate, standby reload and stand-in. Recommend closing all four as
  covered, with one comment each pointing here, and asking the owner for the
  actual technique if they had one in mind. #527 and #528 are `ready` and
  could be picked up by a lane that then finds nothing to build.
- **#572** ("reverse engineer youtube, find where ads come from, stop them"):
  answered in the notes. Ads come from the embed and are injected server side.
  "Stop them" means blocking or hiding ads in the embed, which breaks terms.
  The compliant half (find out where they come from, route around) is the
  shipped work. Close as answered.

Also in the group: #540 (more compliant blocking, `draft`, needs a concrete idea),
#557 (reload instead of skip; built as a one-shot reload on the standby deck),
#561 (play next song in the background; already built), #568 (adblock code
paste, a README of an unrelated library, `draft`), #524 (Mac adblock, parked).

## What is genuinely still open

The big gap is evidence. Every ad path was verified with a simulated ad. The
in-app browser never got a real one. Open questions that only a device with
real ads can answer:

- Does a same-video reload (#557) come back ad-free, or does YouTube serve a
  second ad? Watch `ebblessAdLog` for `standby-reload` then `unmute` or
  `gate-release` (worked) versus `wait-cap` or `dodge` (did not).
- Does an `adTryAlternate` swap actually play ad-free?
- Does the dodge-return fade (#658) feel right on a phone?

By platform:

- **Android app (WebView):** no YouTube sign-in, so no Premium, and no
  extensions. This is the most likely source of #518 ("ads since installing").
  With the screen off the iframe clock updates once a second, so the guard
  (2000 ms hidden) can let a second or two of an ad through. Needs a real-ad
  test on the TECNO POP 9.
- **Mac app (Electron):** same clean profile, stripped user agent. The only
  thing that would remove ads here is #524, parked because it blocks ad
  requests. Dodge and alternate links apply but are unverified against real ads.
- **PC (browser or installed web app):** shares the browser's cookies, so a
  signed-in Premium user sees no ads at all. Others get the same guard as web.
  No known PC-specific gap.
- **Web:** same code. Gaps: dodge is off when `routeLocked` (cast), when there
  is no next track (Discover tops up if on, otherwise nothing at queue end), and
  when the next track is not yet confirmed.
- **iPhone:** out of scope (2026-10-16).

Also open: a song with no match anywhere (no alternate, no SoundCloud) still
waits out its ad, and the report button only helps if someone taps it.

## Compliant versus not

Compliant (nothing blocked, hidden or altered inside the embed):

- Detect from outside signals and route around: dodge, hold muted, reload the
  same video through the normal API, swap to another upload or SoundCloud.
- Prefer a non-YouTube source when an exact match exists.
- Remembering which songs tend to ad, and pre-swapping them.
- Telling the listener what is happening (countdown, report with context).
- SponsorBlock tap-to-skip for content-level sponsor reads. It touches nothing
  of YouTube's ad system. Data is CC BY-NC-SA, so revisit before any paid tier.
- Pointing users at YouTube Premium or the artist's own channels.

Would break YouTube's terms (do not build; stated rule: detect and route around only):

- Blocking ad requests (#524, Mac adblock, uBlock-style filters, #568).
- Hiding or covering the ad and playing audio underneath, or auto-clicking or
  fast-forwarding the ad. (Muting a held ad while the listener hears the next
  song is the shipped behavior; the ad still loads and plays out in full.)
- Stripping ads from the stream or fingerprinting and cutting them from
  podcast audio, which also strips what the show's creators are paid for.
- Using the YouTube player outside the embed API, or proxying video.

## Ranked next steps

1. **Real-ad field test, no new code.** Run the ad test playlist on the Android
   phone and the Mac app, pull `ebblessAdLog` / "Ads playing?" reports, and
   record whether reload, alternate and stand-in work. Effort: small (one
   owner session plus a short write-up). Risk: none. Everything else depends
   on this, and it closes #518, #557 and #624 honestly.
2. **Remember ad-prone songs and pre-swap them.** When `adTryAlternate` finds a
   clean alternate, store the song as "ads on this link" and prefer the
   alternate (or SoundCloud) on later plays, before any ad is heard. The only
   compliant lever that avoids the ad instead of waiting it out. Effort:
   medium (a per-song flag in the playlist and one pre-check at load). Risk:
   low to medium: a wrong swap plays the wrong cut, so keep the strict match
   gate and the one-try loop guard, and do not reuse it for songs the owner
   uploaded.
3. **Close the dodge gaps.** When there is no next track or the route is
   locked, hold silent with the countdown and try the alternate swap first
   instead of sitting on the ad. Effort: small to medium. Risk: low, but the
   branch only runs on a real ad, so it needs step 1's test rig.

Housekeeping: close #527, #528, #529, #539 and #572 as covered or answered,
link this doc in each, and keep #524 parked unless the owner asks for it with
the terms risk understood.
