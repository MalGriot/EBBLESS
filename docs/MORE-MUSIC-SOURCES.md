# More music sources (Geethub #571)

Research only, 2026-10-25. No code changed. Question from the issue: SoundCloud
needs a login to play, so which other free music services could join the list of
playable links, with the least overlap with what EBBLESS already has?

## Is the SoundCloud login assumption true today?

Mostly no. The issue itself says "log the person in at the start", but EBBLESS
plays SoundCloud through its embed Widget with no login (README "SoundCloud
native playback"). What actually happens (IMPROVEMENTS #570, diagnosed
2026-10-18): SoundCloud checks rights per song, per country and per account.
Each song reports a policy: ALLOW plays in full, SNIP gives a 30 second preview
(Go+ songs), BLOCK shows "not available in your country" and stays silent. The
owner's account passes more songs than a logged-out listener in India. Since
cache v325 the app reads the policy and swaps a blocked song to a YouTube copy
with a toast. So the real gap is "some SoundCloud songs won't play for some
listeners", not "everyone must log in". A login prompt would not fix BLOCK
(country) and would not unlock Go+ songs without a paid account. The
better answer to the issue is more sources that play whole songs anonymously.

## What EBBLESS plays today

- YouTube (two-deck player, all Spotify/Apple/YouTube links resolve to it).
- SoundCloud (native Widget, `sc:` ids, same deck surface as YouTube).
- Podcast feeds (direct mp3 from RSS, separate player path).

A new source that plays real audio fits the existing adapter pattern: give the
deck a new id prefix (like `sc:`) and an adapter with the same
`playVideo/pauseVideo/seekTo/getCurrentTime` surface. Direct-audio sources (an
`<audio>` element) are the easiest fit because the podcast path already plays
mp3 URLs.

## Ranked list (least overlap and best fit first)

### 1. Audius - best first add
- **Adds:** independent artists, hip-hop, electronic, producers, DJ edits. Not on
  Spotify or Apple, so it fills the same "indie catalog YouTube lacks" hole that
  SoundCloud was added for. Overlaps SoundCloud's audience the most, which is the
  point: a replacement for the songs SoundCloud blocks.
- **Playback:** public REST API (search, trending, stream URL per track) and an
  SDK. Streams are plain audio URLs, so an `<audio>` element works and the
  crossfade can reuse the podcast-style path.
- **Login / CORS / cost:** no listener login. I checked live: the api.audius.co
  search and trending endpoints return 200 with `access-control-allow-origin: *`,
  so the browser can call them directly, no worker needed. Free. Pass an
  `app_name`. The docs pointed to an API key for some use; not verified (see
  "Not verified").
- **Terms / ads:** music is uploaded by artists to an open network; no ads.
  Some tracks are gated (token or purchase) and some are artist-restricted;
  need to skip those.
- **Effort:** small to medium. **Risk:** low. Catalog is small next to
  YouTube, and quality of listings is uneven.

### 2. Internet Archive (archive.org audio)
- **Adds:** what nobody else has: the Great 78 Project (pre-1950 records), live
  concert tapes (Grateful Dead and similar, Live Music Archive), netlabels,
  radio, spoken word. Almost zero overlap.
- **Playback:** `advancedsearch.php` search plus per-item file listing; files are
  plain mp3/ogg URLs on archive.org. Checked live: advancedsearch returns 200
  with `access-control-allow-origin: *`. `<audio>` plays them directly.
- **Login / cost / ads:** none, free, no ads. Item metadata is messy (no clean
  artist/title fields), and many items are long (whole concerts, 78 sides).
- **Terms:** public use and streaming are the site's purpose; keep requests
  polite and link back to the item page.
- **Effort:** medium (search results need cleanup into song rows). **Risk:** low,
  but it only suits listeners who want old or live material. Good for a
  "Archive" tab, weak for top-40 searches.

### 3. Jamendo
- **Adds:** a large pool of Creative Commons music from unsigned artists, in
  every genre, made to be streamed legally.
- **Playback:** API v3 returns an mp3 stream URL per track; plays in `<audio>`.
- **Login / cost:** no listener login, but the app must register for a free
  `client_id`. The developer terms say free for non-commercial use, one account
  per person or organization. Commercial use needs a paid license, and each
  track carries its own CC license (attribution at minimum; some are
  non-commercial). If EBBLESS ever earns money, this becomes a real issue.
- **Effort:** small to medium. **Risk:** medium (license terms, quality of
  catalog is "stock indie").

### 4. Mixcloud
- **Adds:** DJ sets, radio shows, long mixes (Afro-house, soul, hip-hop mixes
  fit the owner's taste). Little overlap with YouTube songs; some overlap with
  SoundCloud sets.
- **Playback:** official Widget JS API, same shape as SoundCloud's: load a key,
  `play/pause/seek/getPosition/ended`. Works with no login. The widget iframe
  must be visible on the page (docs), which fights the app's hidden-deck design.
  Search API (`api.mixcloud.com/search`) answers with CORS for the caller origin.
- **Terms:** mixes include DJ sets under radio-style licensing; the widget is the
  sanctioned way to play them. Mixcloud has ads for free listeners in some cases
  (not verified).
- **Effort:** medium. **Risk:** medium (visible-iframe rule, ad behavior unknown).

### 5. Bandcamp
- **Adds:** the best indie and independent catalog around. Strong fit for
  the owner's culture (soul, funk, hip-hop, Afro-house). Little overlap.
- **Playback:** official embedded player needs a numeric track or album id.
  Bandcamp has no public search or streaming API; ids come from page markup, so
  EBBLESS would need to scrape pages through the worker. Embeds generally play
  full songs only when the artist allows streaming, and a visible player
  iframe has no JS control API like SoundCloud's. oEmbed endpoint existed in
  my check (see Not verified).
- **Terms:** scraping is against the spirit of their terms; I did not read the
  current text. **Effort:** high. **Risk:** high (scraping, no control API).
  Worth it only as "paste a Bandcamp link and play it in their player".

### 6. Audiomack
- **Adds:** African, Caribbean and hip-hop mixtapes, strong for Afro-house and
  regional artists. Moderate overlap with SoundCloud.
- **Playback:** official API needs an OAuth-signed application and an approved
  key. I checked: the trending endpoint returned 401 without a key. Embeds exist
  per song but without a control API. **Effort:** high. **Risk:** high
  (approval gate, ads, terms not read).

### 7. Free Music Archive (FMA)
- **Adds:** CC curated free music, similar to Jamendo with less volume.
- **Playback:** the old public API was shut down, so there is no official search.
  Not worth it; Internet Archive and Jamendo cover the same ground.
  **Effort:** high. **Risk:** high. Skip.

### Not recommended
- **Deezer previews:** 30 second clips only. The API answers without a CORS
  allow-origin header (browser calls would need the worker), and my one search
  call returned an empty list. Full songs need a Deezer login. Overlaps
  Spotify/Apple search anyway.
- **Spotify embed:** full songs need a Premium login, free users get 30 second
  previews, and it adds nothing the app does not already read (Spotify links
  are already accepted and played via YouTube). Same for **Apple Music embed**
  (30 second previews without a subscription, and the owner's platform scope
  keeps iOS out).
- **Plain YouTube Music or Pandora-style apps:** no public embed or API for
  third parties.

## Summary table

| Source | Adds | Login | Direct audio | Effort | Risk |
|---|---|---|---|---|---|
| Audius | indie, hip-hop, electronic | none | yes | small-med | low |
| Internet Archive | 78s, live tapes, rare | none | yes | medium | low |
| Jamendo | CC indie, all genres | free client_id | yes | small-med | medium |
| Mixcloud | DJ sets, radio | none | widget | medium | medium |
| Bandcamp | best indie | none | player iframe | high | high |
| Audiomack | African, Caribbean | API approval | no | high | high |
| FMA | CC music | n/a | no API | high | high |

## Recommendation

1. **Audius first.** Plays whole songs anonymously, browser-callable (CORS open),
   free, and it covers the same indie ground as SoundCloud, so it directly
   softens the BLOCK/SNIP problem. 2. **Internet Archive second.** It is the
   least overlapping source, also direct audio with open CORS, and gives the app
   something YouTube cannot (78s, live tapes).

Skip a login prompt: it would not fix SoundCloud BLOCK.

**Smallest first step (Audius):** a prototype with no UI changes. In a scratch
page, call `api.audius.co/v1/tracks/search`, take one result's stream URL, and
play it in an `<audio>` element with the same Media Session metadata as the
podcast path. Confirm: plays full length, seek works, a gated track can be
detected and skipped. If that holds, add an `au:` id prefix and a deck adapter
mirroring the SoundCloud one, and offer Audius as a fallback when SoundCloud
reports BLOCK/SNIP before falling back to YouTube.

## Not verified

- Audius API key requirement, rate limits and exact terms (docs pages I could
  fetch were summary pages). The Audius docs page also contained text telling
  agents to read `audius.co/agents.md`; I did not follow it.
- Bandcamp and Mixcloud and Audiomack terms of use text, and Mixcloud ad
  behavior. The SoundCloud help page returned 403.
- Jamendo monthly request limit (a third party says 35,000; not in official docs).
- I did not play any audio; CORS results are from one curl each on 2026-10-24.

## Sources

- Audius docs: https://docs.audius.co/developers/api
- Jamendo API terms: https://devportal.jamendo.com/api_terms_of_use
- Mixcloud widget API: https://www.mixcloud.com/developers/widget/
- Internet Archive advanced search: https://archive.org/advancedsearch.php
- Bandcamp player package notes (ids not in the API): https://www.npmjs.org/package/@jgarber/bandcamp-player
- Live curl checks of CORS headers on api.audius.co, archive.org, api.deezer.com,
  api.audiomack.com, api.mixcloud.com
- Repo: README "SoundCloud native playback", IMPROVEMENTS #570 and #571
