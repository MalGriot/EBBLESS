# Platform compliance audit: Spotify + YouTube

Audit for Geethub #221 (backlog `platform-compliance-audit`, which also covers
`video-playback-option`). Written 2026-09-30 against the code on branch
`agent/platform-compliance-audit` and the platform documents as published on
that date. This is an engineering reading of the terms, not legal advice.

Sources checked:

- YouTube API Services Developer Policies: https://developers.google.com/youtube/terms/developer-policies
- YouTube Required Minimum Functionality (embedded player rules, last updated 2026-09-14): https://developers.google.com/youtube/terms/required-minimum-functionality
- YouTube Terms of Service: https://www.youtube.com/t/terms
- Spotify Developer Policy (effective 2025-05-15): https://developer.spotify.com/policy
- Spotify Developer Terms (v10, effective 2025-05-15): https://developer.spotify.com/terms
- Spotify Design Guidelines: https://developer.spotify.com/documentation/design

## A. Current state

**How Spotify data enters.** Only through the Cloudflare Worker. `/playlist`
and `/album` fetch the public `open.spotify.com/embed/...` page and parse its
`__NEXT_DATA__` JSON (`handleEmbed`); `/track` does the same for one track;
per-track playlist thumbnails come from Spotify's public oEmbed endpoint. The
Spotify Web API is not used for imports. It is only used by one optional
Discover path (`This Is` playlist search) and only when
`SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` secrets are configured, which
they currently are not. Spotify podcast links are resolved the same way.

**What Spotify-derived data is shown.** Track title, artist, playlist/album
name, and cover art (Spotify art is kept as-is for Spotify-sourced tracks,
`resolveTrackArt`). The art is shown plain in the Default art style, and is
also reused as the spinning record label, the cassette label, the blurred and
animated ambient background (`#ambient`, `filter: blur(70px)` plus drift
animation), the flow-mode ambient layer, library cards, the mini bar, and
Media Session artwork (lock screen, car).

**Spotify links.** Before this change: one static `https://open.spotify.com`
link in Credits, plus "Copy link" on a library item
(`canonicalLinkForPlaylist`). No per-track link. Per-track Spotify ids were
not kept (the worker dropped the track `uri`).

**How YouTube playback works.** Every non-SoundCloud, non-podcast track is
matched to a YouTube video id by the worker's `/search`, which scrapes
YouTube's search results page (not the YouTube Data API). Playback uses the
official IFrame Player API (`new YT.Player`) in a two-deck setup
(`decks`, `createDeckPlayer`, `loadIntoDeck`): the current track plays in one
player while the next track is preloaded in a second. `playerVars` are
`autoplay: 1, playsinline: 1, mute: 1, vq: 'tiny'`, and quality is re-forced to
`tiny` on every quality change. Every load starts muted and only unmutes after
a 5s timer plus a duration check meant to wait out pre-roll ads
(`UNMUTE_DELAY_MS`, `deckShowsAd`, `checkDeckReady`), then seeks back to 0:00.
`guardActiveDeckAd` re-mutes the active deck while its duration doesn't match
the matched video (mid-roll ads). The preloaded deck plays muted through the
same wait, then pauses at the start of the content. Chromecast loads the
video on YouTube's own receiver app (`233637DE`) through the generic Cast
sender.

**Where the player lives in the DOM.** `#yt-host` (a direct child of `#app`)
holds `#yt-deck-a`, `#yt-deck-b` (the YouTube iframes) and `#sc-deck-a/b`
(SoundCloud widgets). CSS: `#yt-host{position:absolute;width:1px;height:1px;
overflow:hidden;opacity:0;pointer-events:none}`.

**Visible, hidden or minimized during playback.** Hidden, always. The
player is a 1x1 px, fully transparent, non-interactive box for the whole
session, used purely as an audio source. The Media Session API, a near-silent
keep-alive `<audio>` loop, and the desktop Document Picture-in-Picture mini
player keep that audio going with the tab in the background or the screen
locked.

**Autoplay.** Programmatic: every track (including the first after a user
gesture and every auto-advance) loads with `autoplay: 1` + `mute: 1`, and a
second, hidden player autoplays the next track muted at the same time.

**Visual field vs playback.** Behavioural only. `setPlayingUI` calls
`vizSetPlaying(isPlaying)`, and when paused the cymatics pattern holds 3x
longer and its jitter/step drop (0.020/0.016 to 0.004/0.006). Nothing reads
the audio.

**Audio analysis.** None. The only `AudioContext` plays EBBLESS's own sfx
(needle drop/lift, cassette rewind). Volume leveling uses YouTube's own
published loudness value for the video (`loudnessDb`, fetched as metadata by
the worker's `/ytvideo`), not analysis of the audio. No FFT, waveform,
amplitude, beat or tempo detection anywhere. No trivia or quiz code exists
(searched `index.html` and the worker).

**Credits.** Settings > About > Credits opens a static centered card
(`#credits-modal`) with three groups (Music sources, Music data, Built with)
of outbound links with a one-line role each.

## B. Compliance issues

### Must fix (or consciously accept the risk)

These are real conflicts with current published requirements. Each one
changes the core of how EBBLESS plays or sources music, so none were changed
in this pass. They need an owner decision (options at the end).

1. **Hidden YouTube player used as an audio source.** YouTube Developer
   Policies III.I.7: must not "separate, isolate, or modify the audio or video
   components of any YouTube audiovisual content", and III.I.9: must not play
   content "from a background player, meaning a player that is not displayed
   in the page". Required Minimum Functionality: "Embedded players must have a
   viewport that is at least 200px by 200px." `#yt-host` is 1x1 px at opacity 0
   for the whole session. The new YouTube card (below) shows the real player on
   demand, but it does not make the default hidden playback compliant.
2. **Muting through ads.** Developer Policies III.I.5: must not "modify,
   interfere with, replace, or block advertisements placed or served by
   YouTube". The mute-until-the-ad-is-over logic (`UNMUTE_DELAY_MS`,
   `deckShowsAd`, `guardActiveDeckAd`) exists specifically to silence pre-roll
   and mid-roll ads; the README calls it "the ad filter".
3. **Autoplay rules.** Required Minimum Functionality: players must start
   automatic playback only when fully visible (more than half on screen), and
   "A page or screen must not have more than one YouTube player that
   automatically plays content simultaneously". The hidden active deck
   autoplays, and the standby deck autoplays muted at the same time to preload.
4. **Modifying the player.** Developer Policies III.I.6: must not "modify,
   build upon, or block any portion or functionality of a YouTube player".
   Forcing `tiny` quality through the documented `setPlaybackQuality` call is
   probably fine on its own; the seek-back-to-0 after a muted wait and the
   crossfade/volume automation are documented API calls too. The ad muting in
   item 2 is the part that clearly crosses this line.
5. **Scraping YouTube search.** YouTube Terms of Service: must not "access
   the Service using any automated means (such as robots, botnets or
   scrapers)". The worker's `/search`, `/ytplaylist` (RSS is fine) and
   `/ytvideo` read YouTube's HTML pages. The sanctioned route is the YouTube
   Data API (`search.list`, quota-limited).
6. **Spotify: the product shape itself.** If EBBLESS is a Spotify developer
   app (it is whenever Spotify client credentials are configured, and it
   uses Spotify's embed widget pages), Spotify Developer Policy III.5 says "Do
   not create any product or service which is integrated with streams or
   content from another service", and III.9 bars an app "that enables the
   transfer of data to another service" (with an exception for "the metadata
   of the user's playlists"). Playing a Spotify playlist's tracks from YouTube
   is close to exactly what III.5 describes. Separately, the worker reads
   Spotify's embed pages with a script, and the Developer Terms IV.2.4 bar
   using "any robot, spider, site search/retrieval application, or other tool
   to retrieve, duplicate, or index any portion of the Spotify Service or
   Spotify Content". Not fixable with attribution; it's a positioning and
   risk decision.

### Recommended

7. **Link Spotify metadata back to Spotify.** Developer Policy II.4.b:
   "Metadata, cover art and Audio Preview Clips must be accompanied by a link
   back to the applicable album, content or playlist on the Spotify Service."
   Done in Credits in this pass (see C). The Design Guidelines go further (the
   full Spotify logo, min 70px, near any Spotify metadata, and link text such
   as "LISTEN ON SPOTIFY"); the brief rules out Spotify branding in the main
   interface, so this pass does the minimum (text attribution in Credits).
   Deeper compliance would need a small "Listen on Spotify" link near the
   track title for Spotify-sourced tracks.
8. **Spotify cover art treatment.** Design Guidelines: "Artwork must be kept
   in its original form. Don't animate or distort it in any way. This includes
   applying overlays and blurring"; Developer Terms IV.2.1.b only permits
   resizing. For Spotify-sourced art, the spinning record label (cropped and
   rotated), cassette label, and blurred animated ambient background all
   modify it. Options: use non-Spotify art (Cover Art Archive / iTunes, which
   the app already resolves for other sources) for those styles, or accept.
9. **Caching.** Developer Policies III.E.4 limits storing API data to 30 days.
   EBBLESS doesn't use the Data API so this doesn't strictly bind it, but if it
   moves to the Data API (item 5), matched video ids kept forever in
   `localStorage` and the worker's 30-day match cache would need a refresh
   policy.
10. **Chromecast through YouTube's receiver.** Loading YouTube's receiver app
    (`233637DE`) from a generic Cast sender isn't a documented YouTube
    integration (already noted in README). Low risk, worth knowing.

### Already fine

- EBBLESS never plays, proxies or records Spotify audio. Spotify is metadata
  only.
- YouTube playback uses the official IFrame Player API; audio is never
  downloaded, proxied or re-hosted.
- The visual field is not audio-reactive and runs no audio analysis.
- No trivia/quiz code, Spotify-powered or otherwise.
- Credits already credit YouTube, Spotify and the data sources (and the
  GetSongBPM backlink its terms require).
- Metadata is truncated with marquee scrolling rather than cut, so the full
  title is always reachable (Design Guidelines on truncation).
- EBBLESS deep plans (skins, visuals, themes, original ambient audio) are
  compatible with YouTube III.F.3.a ("must not charge users to watch content
  in an embedded YouTube player") and Spotify Developer Terms V.5 ("will not
  sell any Spotify Content") as long as no paid tier gates playback,
  playlists or third-party recordings.

## C. What this pass changed

1. **Dynamic Spotify attribution in Credits.** The worker now passes each
   Spotify track's id (`spotifyId`, from its `spotify:track:` uri) and the
   client keeps it on the track. The Spotify row in Credits links to the
   current track on Spotify ("Listen to "Title" on Spotify"), updated on every
   track change (`updateCreditsSpotifyLink`, called from
   `reflectCurrentTrackUI`). Tracks imported before this (or while the worker
   isn't redeployed) fall back to the album/playlist they came from; anything
   not from Spotify keeps the generic link. No raw URLs, no logos.
2. **Fourth player tab: YouTube.** Next to Album art / Visualizer / Lyrics,
   `#ytPanelBtn` opens a card (`#yt-modal`, same style as Credits) that shows
   the real YouTube player producing the audio: the active deck's own iframe,
   placed over the card's 16:9 slot (min 200px tall) one layer above the card,
   with nothing drawn over it and all native controls, title, channel, logo
   and links intact. It is never reparented (that would reload it) and follows
   track changes and deck swaps while open. Pausing or seeking in YouTube's
   controls updates EBBLESS's own UI through the existing state events. The
   tab is disabled (dimmed, not clickable, `aria-disabled`) whenever the
   current track has no working YouTube connection: SoundCloud-native or
   podcast audio, no matched video id, casting, or the embed reported an error
   for that video; an open card closes if the track changes to one of those.
   While the card is open the visible player is not forced to `tiny` quality.
3. **Audio license doc.** `docs/AUDIO-LICENSES.md`.
4. SW cache bumped to `ebbless-shell-v39`.

No change to the hidden-player architecture, ad muting, autoplay, YouTube
search, or Spotify sourcing (items 1 to 6); those need a decision.

## Options for the must-fix items

- **A. Visible player by default.** Replace the default album-art view (or add
  it to it) with the real YouTube player at 200x200 or larger whenever a
  YouTube track plays, and pause when it's not on screen. Most compliant,
  biggest change to the look; conflicts with the background/lock-screen and
  mini-player features.
- **B. Drop the ad muting and the parallel preload.** Let ads play audibly,
  load the next track only when it becomes current (lose gapless/crossfade for
  YouTube tracks). Fixes items 2 to 4; items 1 and 5 remain.
- **C. YouTube Data API for search.** Replace the HTML scraping with
  `search.list` (API key, ~100 searches/day on default quota, would need a
  quota increase, which requires a compliance audit by YouTube that would look
  at items 1 to 3).
- **D. Accept the risk** for a small private/beta audience, knowing an API or
  embed-level block from YouTube or Spotify can happen without notice.
- **E. Spotify positioning.** Treat Spotify links as a way to import a
  playlist's titles (the III.9 "user's playlists" exception fits a user's own
  playlists best), stop using Spotify client credentials, and prefer
  non-Spotify art for the stylized art modes.
