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
- **`docs/`** - [`PLATFORM-AUDIT.md`](docs/PLATFORM-AUDIT.md) (Spotify/YouTube
  terms audit and open decisions) and [`AUDIO-LICENSES.md`](docs/AUDIO-LICENSES.md)
  (source + license of every sound EBBLESS ships; add a row before adding one).
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

## Testing against staging, not production

The worker's KV namespaces (`MATCH_REPORTS`, `TASTE_POOL`, `PROFILES`) are on
Cloudflare's free tier, which caps daily `put` operations account-wide - easy
to blow through by testing a KV-writing feature (report-a-match, taste
pooling, profile save) directly against production. Use the staging
environment instead:

```bash
cd worker
npx wrangler dev --env staging       # local dev server against staging KV
npx wrangler deploy --env staging    # deploy to spotify-youtube-search-staging.<subdomain>.workers.dev
```

Then point `BACKEND` in `index.html` at the staging worker's URL while
testing. Staging has its own separate KV namespaces (see `worker/wrangler.toml`),
so nothing written there touches production's quota. Plain `npx wrangler
deploy` (no `--env`) still targets production as before.

## Reading tester feedback

Settings > Feedback & support > "Send feedback" lets beta testers report bugs or ideas
with no login and no GitHub. It POSTs to the worker's `/tester-report`,
which stores each report in `MATCH_REPORTS` under a `tester:<ts>:<uuid>` key
(max 5 per IP per 10 minutes). The same form also opens on its own as a
periodic "Are you feeling this app or nah?" thumbs check (from the 3rd day of
use); those reports carry `source: "vibe-check"` and `sentiment: "up"|"down"`
(the thumbs value is also prefixed into `message`). Force it with `?vibecheck`
or `ebblessVibeCheck()` in the console. Read them with:

```bash
cd worker
npx wrangler kv key list --binding=MATCH_REPORTS --prefix=tester:
npx wrangler kv key get --binding=MATCH_REPORTS "tester:<ts>:<uuid>"
```

## Beta tester system

`beta/` holds the 50-person beta: static pages on the same GitHub Pages site,
backed by `worker/src/beta.js` (routes under `/beta/*`) and its own KV
namespace, `BETA`.

- `beta/` - public signup (shows `17 / 50 testers`; switches to "THE BETA IS
  FULL." plus a waitlist option once 50 spots are filled)
- `beta/tester.html?t=<token>` - an accepted tester's page ("YOU'RE IN.")
- `beta/feedback.html`, `beta/bug.html` - feedback (`EBB-FB-0001`) and bug
  reports (`EBB-TEST-0001`), tied to the tester by their link token, optional
  screenshot
- `beta/admin.html` - sign in with Google (account must be in the
  `ADMIN_EMAILS` worker secret) to see counts, change tester status, copy
  invites, and read feedback, bugs, and in-app "Send feedback" reports in one feed

Nobody is accepted automatically. Setting a tester to accepted/active hands
out the next tester number (`#001`...) and their secret link; accepted,
active and inactive all hold one of the 50 spots, and the worker refuses a
51st. Waitlisted/rejected frees the spot (numbers are never reused).

Admin locally: put `BETA_DEV_ADMIN_KEY=<anything>` in `worker/.dev.vars`
(gitignored), run `npx wrangler dev --local`, and open
`beta/admin.html?backend=local&devKey=<same>` from a localhost server. The
key is only honored on localhost.

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
album URL's `?i=<songId>` deep link to one track).

- **Apple Music** isn't played directly - like Spotify, it's only ever a
  source of `{title, artist}` pairs, each matched to a YouTube video through
  the same `/search` endpoint everything else uses. It dehydrates its
  album/playlist/song pages into a `<script id="serialized-server-data">`
  JSON blob (the same trick as Spotify's `__NEXT_DATA__`), scraped directly -
  no API key, no missing tracks.
- **SoundCloud** plays natively instead of being matched to a YouTube video -
  see "SoundCloud native playback" below. Its tracklist data comes from
  SoundCloud's own public web API (it stopped embedding track/playlist data
  in its pages entirely - verified directly, the old `window.__sc_hydration`
  blob is gone), using a `client_id` pulled live out of one of the site's JS
  bundles (cached for an hour; refetched once on a 401 in case it rotated). A
  playlist's `/resolve` response only fully hydrates its first ~5 tracks and
  leaves the rest as bare `{id}` stubs, which get a follow-up batch fetch.

## SoundCloud native playback

Every other source (Spotify, Apple Music, a plain YouTube link) only ever
supplies a `{title, artist}` pair that gets matched to a YouTube video via
`/search` - SoundCloud is the one exception. A SoundCloud track's own numeric
id (`scId`, from the worker's `/soundcloud` endpoint) becomes the track's
`videoId` field with an `sc:` prefix (e.g. `sc:2312228204`) instead of a real
YouTube id, and the player detects that prefix (`isSoundCloudVideoId()`) and
routes it to a SoundCloud embeddable Widget
(`https://w.soundcloud.com/player/...`, using the SC Widget JS API) instead of
a YouTube `<iframe>` player. This exists because for an independent/
self-released catalog with little YouTube presence of its own, `/search`
sometimes has *no* correct video to match against at all (an artist name that
collides with an unrelated, heavily-used term is the concrete case that
prompted this - see the `soundcloud-native-playback` IMPROVEMENTS.md entry).

Practically, this means: the two-deck crossfade/preload architecture
(`decks`/`createDeckPlayer`/`loadIntoDeck` in `index.html`) now builds either
a `YT.Player` or an SC.Widget-backed adapter per deck depending on the
track's source, exposing the same method surface (`playVideo`/`pauseVideo`/
`seekTo`/`getCurrentTime`/etc.) so crossfade, the queue, media-session
metadata, and transport controls all keep working unmodified either way.
SoundCloud tracks skip the YouTube pre-roll-ad mute-and-wait dance entirely
(SoundCloud's own embeddable player has no such pre-roll to hide) but lyrics
and the Discover "YouTube mix" seed fallback are skipped for them, and the
"report a bad match" button is hidden (there's no YouTube match to report).

One real, unresolved limitation: browsers only reliably allow a *new*
cross-origin iframe to autoplay unmuted audio within a short window after a
genuine user gesture (or once that specific origin/frame has already been
allowed to play once) - YouTube's player sidesteps this by always starting
**muted** (always allowed) and unmuting after the fact, which SoundCloud's
widget has no equivalent hook for. In practice this can mean the very first
SoundCloud track of a session - or a track that gets auto-promoted from the
preloaded standby deck without any fresh click, e.g. a natural end-of-track
advance - loads and shows correctly but sits paused until the listener taps
play once; the play/pause icon accurately reflects this (it's never a silent
failure), and playback is normal after that tap. Worth deeper investigation
against the real deployed worker (much lower latency than a local
`wrangler dev` instance, which is what this was verified against) before
assuming how often this actually bites a real listener.

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

## Speakers, TVs and cars

- **Cars / lock screen / Bluetooth / headsets** run off the Media Session
  API (`updateMediaSessionMeta`, `syncMediaPositionState` and the
  `setActionHandler` block in `index.html`): title/artist/playlist,
  artwork at its real sizes, play/pause/stop/prev/next/seek, and a
  position state kept in sync (never NaN/Infinity). On iOS the +/-10s seek
  handlers are left off on purpose - registering them replaces the
  previous/next *track* buttons on the lock screen and in CarPlay.
- **Chromecast / Google TV** (Chrome desktop + Android) uses the Cast sender
  SDK, loaded lazily. YouTube tracks go to YouTube's receiver app
  (`233637DE`) by video id, podcast episodes to the Default Media Receiver by
  URL. The receiver plays one item at a time and EBBLESS stays the queue:
  when an item finishes, the next queue track is loaded onto the receiver.
  Stopping (or the device going away) resumes playback here at the
  receiver's position. If the receiver refuses a load, playback comes
  straight back here with a toast - loading YouTube's receiver through the
  generic sender isn't a documented contract, so this needs real-device
  checking. SoundCloud-native tracks can't be cast.
- **AirPlay**: on iOS, picking a speaker in Control Center routes all audio
  (YouTube included). The in-app AirPlay button only exists for podcast
  episodes on Safari, since AirPlay needs a real media element.
