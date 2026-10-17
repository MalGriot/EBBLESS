# SponsorBlock research (#573) and podcast ads (#575)

Written 2026-10-17. Findings only, no code changed.

## Part 1: Ads on podcasts (#575, NoSleep Podcast)

**What EBBLESS does.** `https://open.spotify.com/show/5XhS5WBxLYgN3S9KhEyrrF`
resolves through the worker's `/podcast` to The NoSleep Podcast's public feed
(`audioboom.com/channels/5101646.rss`, 300 episodes, 282 with chapters). Every
episode plays as `au:<feed audio url>` in a plain `<audio>` element. It never
touches YouTube, so the YouTube ad detection from #523 (`maybeDodgeAd`,
duration-mismatch gate) does not apply and cannot help.

**Where the ads are.** Inside the mp3. The enclosure URL goes through Podtrac /
Podscribe redirects to audioboom, which does dynamic ad insertion (and the show
also has host-read sponsor spots). The app gets one audio stream with the ads
already stitched in. Nothing marks them: the feed's chapters are story titles
only (first chapter starts at 5:45, the intro/ad block before it is unlabelled),
and I found no chapter in 300 episodes titled as an ad or sponsor.

**Why there is no safe small fix.**
- The ad positions are not in the feed, so there is nothing to skip to.
- Guessing (skip the first N minutes, skip silence gaps) would cut real content
  and break on every show.
- Fetching the mp3 server-side and stripping ads is audio fingerprinting
  territory: big, fragile, and it also strips what the show's creators are paid
  for. Not consistent with "stay within terms the user accepts".
- Only the Spotify app/premium or the show's own paid feed removes these.

**What could be done later (not built).**
1. Honour explicit markers when a feed has them: skip a Podcasting 2.0 chapter
   whose title is clearly an ad ("Ad", "Sponsor", "Advertisement") with a toast.
   Cheap, but NoSleep does not use them, so it would not fix this report.
2. Community segment data (see Part 2) keyed by episode, if it ever exists for
   podcasts.
3. A "Skip ahead 30s" quick button already exists as +15s; ad breaks can be
   hopped with it.

**Classification:** `type:platform-limitation` (ads are baked into the show's
audio by its host, not an EBBLESS playback fault).

## Part 2: SponsorBlock (#573)

**How it works.** SponsorBlock (sponsor.ajay.app) is a crowdsourced database.
Users submit time ranges per YouTube video ID, with a category (sponsor, intro,
outro, self-promo, interaction reminder, non-music section, preview, filler).
Others vote; segments get locked or hidden by votes. Clients ask
`GET /api/skipSegments/<sha256(videoID) first 4 hex>?categories=[...]` (the hash
prefix is for privacy), get back segments `[start, end]` for the video, and seek
past them during playback. The data is open (CC BY-NC-SA 4.0 database dump) and
the API is free but rate limited and asks for attribution. Client side logic is
just "on timeupdate, if inside a segment, seek to its end".

**It is a different problem from #523.** SponsorBlock skips *baked-in sponsor
reads inside a video's content*. It does nothing for YouTube's own
pre-roll/mid-roll ads, which are injected by the player and not part of the
video's timeline (the ones #523 detects and dodges). So it would not reduce the
ads EBBLESS users hit between songs.

**Fit for EBBLESS.**
- Songs from YouTube: the useful category is `music_offtopic` ("non-music
  section", e.g. talking intros on a music video) and `intro`/`outro`. Coverage
  for official music videos is thin. Risk: auto-skipping part of a song the
  user wants whole, and the matched video is often a lyric/audio upload with
  different timing, so segments from another cut would skip the wrong part.
- Podcasts: only helps for the YouTube-fallback shows, not feed audio (feed
  episodes have no YouTube ID, and #575 is feed audio). SponsorBlock segment
  timing applies to a specific upload, which may differ from the feed mp3.
- Legitimacy: reading the public API from the worker is allowed (attribution
  required, non-commercial licence on the data; EBBLESS free-use fits, but
  check before any paid tier). It is a user-side skip of content, not
  circumvention of access controls, and it does not touch YouTube's ad system.
- Cost: a worker route with a cache (hash prefix), a per-video fetch on track
  load, and a skip tick that must follow the GPU/rAF rules (no new loop, hook
  the existing seek poll). Roughly a day with testing, mostly on the
  mismatch-cut edge cases.

**Recommendation (superseded, see Part 3).** Do not build now. It does not address ad complaints (#523,
#575), the benefit for music is small and risky, and for podcasts it only covers
the YouTube-fallback path. Revisit only as an opt-in "skip talking sections in
YouTube-sourced podcasts" setting, restricted to `sponsor`/`selfpromo`, applied
only when the matched video duration is within tolerance of the expected
duration (reuse `AD_DUR_TOLERANCE_S`). Do not use it for songs.

## Part 3: What was built (2026-10-17, cache v314)

The owner decided to build it. `sbWatch` in index.html, next to the #575 ad
code, feeding the same tap-to-skip prompt (`setSkipSegs` / `skipPromptTick`).

**How SponsorBlock works, as used here.** Checked live on 2026-10-17:
`GET https://sponsor.ajay.app/api/skipSegments/<first 4 hex of sha256(videoID)>`
`?categories=[...]&actionTypes=["skip"]` returns every video under that hash
prefix (100+), each `{ videoID, segments: [{ segment: [start, end], category,`
`actionType, videoDuration, votes, locked, UUID }] }`; 404 when none. The
server sends `Access-Control-Allow-Origin: *`, so the browser asks directly
and the worker is untouched. Only the prefix leaves the device; the app picks
its own video out of the reply, so SponsorBlock can't tell which one plays.
Segments voted down are already hidden by the server.

**Licence.** The segment database is CC BY-NC-SA 4.0 (attribution,
non-commercial, share-alike); the server code is AGPL-3.0, which doesn't
apply since EBBLESS only reads the public API. Attribution is the Settings
row's link to sponsor.ajay.app. Non-commercial: fine while EBBLESS is free;
revisit before any paid tier.

**Scope decided.**
- Podcast episodes playing from YouTube (the no-public-feed fallback):
  always on, categories sponsor, selfpromo, interaction, intro, outro,
  labelled Sponsor / Self-promo / Reminder / Intro / Outro.
- Songs: off by default. Settings > Playback > "Skip talking in songs" turns
  on `music_offtopic` only (label "Talking"). With it off, no request is made
  for songs at all.
- Feed-audio episodes (`au:` ids, like #575 NoSleep) are not covered: they
  have no YouTube id.
- Never a silent skip; the listener taps Skip. No auto-skip setting was
  added (possible follow-up).

**Accuracy guard.** Segments are keyed by the exact video playing, so the
"different cut" risk from Part 2 only applies when the uploader re-trims a
video: a segment whose recorded `videoDuration` differs from the player's
duration by more than 2 s is dropped. Overlapping segments merge; under 3 s
isn't offered. One request per video per session; a failed request is
retried after 2 minutes. No new loop or animation: it rides the existing
seek poll and prompt.

**Verified** in a localhost preview: podcast episode `89uRpoPmR5U` showed
"Sponsor 0:57 Skip" inside 0:31-1:31 and Skip landed after it; the same
video as a song showed nothing; song `THscJf7O7bY` showed "Talking" only
after turning the setting on and lost it when turned off; no console errors
or new `[gpu-watchdog]` warnings. Not verified: Android native app, a real
YouTube-fallback podcast imported end to end.
