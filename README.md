# EBBLESS

Paste a public Spotify playlist link, get it played back as YouTube audio, with a
mute-on-load / auto-unmute heuristic to blunt pre-roll ads. Same core trick as the
"Currently On Repeat" widget on the Griot site's about.html, generalized to any
playlist and wrapped as a standalone app.

## Pieces

- **`index.html`** — the app itself. Single static file, no build step. Open it
  directly or serve it (`python3 -m http.server`, or the `ebbless`
  entry in the workspace's `.claude/launch.json`).
- **`worker/`** — a small Cloudflare Worker at
  `https://spotify-youtube-search.malgriot.workers.dev` that does the actual
  Spotify + YouTube fetching server-side.
- **`brand/`** — brand guidelines. [`brand/brand-guidelines.html`](brand/brand-guidelines.html)
  is the visual brand manual; [`brand/BRAND.md`](brand/BRAND.md) is the
  condensed source of truth for developers and future agents — read it
  before changing copy, color, type, or the logo.

## Why there's a backend

Neither Spotify's playlist embed page nor YouTube's search results page send
CORS headers, so the browser can't fetch them directly — some proxy is required.
Public CORS proxies (corsproxy.io, allorigins.win, jina.ai's reader, several
Invidious mirrors) were tried first and rejected: most are down, rate-limited, or
now require a paid API key, and — more fundamentally — YouTube's search page
returns a flat 401 to requests coming from those shared/datacenter proxy IPs.
Running the same fetch from one dedicated Worker avoids that, and caches results
(6h for playlists, 30d for YouTube matches) to cut down on repeat hits.

## Redeploying the worker

```bash
cd worker
npx wrangler deploy
```

Requires the `sumtinels@gmail.com` Cloudflare account to be authenticated via
`wrangler login` (already set up in this environment).

## YouTube links

Besides Spotify, you can paste a YouTube link directly — a playlist
(`youtube.com/playlist?list=...`), a single video (`watch?v=...`, `youtu.be/...`,
`/shorts/...`), or a `watch?v=...&list=...` link (imported as a playlist unless
the `list=` looks like an auto-generated mix/radio, "Watch Later", or "Liked
videos"). No YouTube search/matching step is needed since the link already
points at real videos.

Playlist tracklists come from YouTube's public playlist RSS feed
(`/feeds/videos.xml?playlist_id=`) rather than scraping the playlist page:
YouTube moved the actual tracklist behind its internal, undocumented
"innertube" browse/continuation API sometime in 2026, which needs a live
clientVersion/visitorData pair and uses renderer shapes that change often —
too brittle to depend on here. The tradeoff is that feed only exposes a
playlist's ~15 most recent videos, which the app surfaces as a note after
import.

## SoundCloud and Apple Music links

Also accepted: a SoundCloud track/set link (`soundcloud.com/{user}/{track}` or
`.../sets/{name}`) and an Apple Music album/playlist/song link
(`music.apple.com/{storefront}/{album|playlist|song}/{slug}/{id}`, including an
album URL's `?i=<songId>` deep link to one track). Unlike YouTube, neither
service's audio gets played directly — like Spotify, they're only ever a
source of `{title, artist}` pairs, each matched to a YouTube video through the
same `/search` endpoint everything else uses.

- **Apple Music** dehydrates its album/playlist/song pages into a
  `<script id="serialized-server-data">` JSON blob (the same trick as
  Spotify's `__NEXT_DATA__`), scraped directly - no API key, no missing
  tracks.
- **SoundCloud** stopped embedding track/playlist data in its pages entirely
  (verified directly - the old `window.__sc_hydration` blob is gone), so this
  calls SoundCloud's own public web API instead, using a `client_id` pulled
  live out of one of the site's JS bundles (cached for an hour; refetched once
  on a 401 in case it rotated). A playlist's `/resolve` response only fully
  hydrates its first ~5 tracks and leaves the rest as bare `{id}` stubs, which
  get a follow-up batch fetch.

One easy footgun: `parseSpotifyLink`'s `playlist|album|track` regex isn't
anchored to a Spotify domain, and Apple Music's own URLs contain the literal
path segments `/playlist/` and `/album/` — so Spotify's parser was silently
swallowing Apple Music links before Apple Music's own parser ever ran. Fixed
by requiring `spotify.com` or a `spotify:` URI prefix up front.

## The "ad filter"

The YouTube IFrame Player API has no documented signal for "an ad is currently
playing" — it reports the target video's own metadata immediately, even while a
pre-roll ad is what's actually on screen. So every video load starts muted and
unmutes after a flat 5-second timer (`UNMUTE_DELAY_MS` in `index.html`), and the
`ENDED` event (which an ad ending also fires) is ignored until that timer has
confirmed real content. It's a delay heuristic, not ad detection — a real
tradeoff, not a fix.
