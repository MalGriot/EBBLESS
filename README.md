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

## The "ad filter"

The YouTube IFrame Player API has no documented signal for "an ad is currently
playing" — it reports the target video's own metadata immediately, even while a
pre-roll ad is what's actually on screen. So every video load starts muted and
unmutes after a flat 5-second timer (`UNMUTE_DELAY_MS` in `index.html`), and the
`ENDED` event (which an ad ending also fires) is ignored until that timer has
confirmed real content. It's a delay heuristic, not ad detection — a real
tradeoff, not a fix.
