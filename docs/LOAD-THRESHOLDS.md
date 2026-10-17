# What happens if too many people use EBBLESS (Geethub #559)

Analysis only, written 2026-10-17. No code changed. Numbers marked **[repo]** come from this repo's
code, comments or docs. Numbers marked **[vendor]** are the vendor's published free-tier limits as
known when this was written; they change, so re-check the vendor page before relying on one.
Nothing here was load-tested.

## How a listener touches each service

| Action | Hits |
|---|---|
| Open the app | GitHub Pages (static files), then the service worker serves from cache |
| Signed in, page load | Worker `/profile` sync: 1 KV read, a KV write only if the merge changed something [repo: `handleProfileSync`] |
| Every signed-in request | 1 KV read for the session token; one KV write a day to slide it [repo: `session.js`, `SESSION_SLIDE_MS` 24 h] |
| Play or import a song | Worker `/search` (cache API first, then upstream fetches), then YouTube iframe/embed in the browser |
| Edit playlists | Profile push, debounced 20 s, and at least 5 min apart for track changes [repo: `PROFILE_PUSH_DEBOUNCE_MS`, `NOW_PUSH_MIN_GAP_MS`] |
| Report a wrong match, taste signal, feedback | KV write (`MATCH_REPORTS`, `TASTE_POOL`) |
| Beta sign-up | Worker to a Google Apps Script web app over a Google Sheet [repo: `beta.js`] |

Airtable is not in the app's request path (`grep` finds no use in the app or worker). It is the
owner's task tracker, so a user surge cannot hit it.

## Thresholds, in the order they break

### 1. Cloudflare KV writes: about 1,000 puts a day [vendor, free tier]. Breaks first.
The repo already hit this once (2026-09-23, from testing; see README "Testing against staging")
[repo]. The cap is account-wide across all three namespaces, so profile saves, session slides,
reports, taste pooling and ON AIR all draw from one pot.
- Profile writes happen only when the merge changed something, and the client debounces to one
  push per 20 s burst [repo]. A signed-in user who edits a playlist a few times a day costs
  about 1 to 5 puts a day. Session slide adds 1 a day per active user.
- Rough ceiling: about 150 to 300 daily-active signed-in users before puts run out, depending on
  how much they edit. Past that, writes fail with a 429-style error: new edits stop syncing,
  sign-in sessions cannot be created, reports are lost. Listening itself keeps working.
- Reads are 100,000 a day [vendor]. Each signed-in request reads the session, so about 1,000
  signed-in users making 100 requests each hit it. Second to break.
- Fix when needed: Workers Paid plan (5 USD a month at the time of writing, KV writes then billed
  per million). That is the single highest-value step before any public launch.

### 2. Workers requests: 100,000 a day, 10 ms CPU per request [vendor, free tier]
`/search` and the other music routes cache through the Cache API with long TTLs (6 hours to 30
days) [repo], so repeat songs are cheap. Imports are the heavy part: one search per song, client
driven, about 40 a minute in the background [repo, big-import work]. A 10,000-song import is
10,000 requests alone, so 10 such imports use the whole day.
- Rough ceiling: 100,000 requests a day, which is roughly 300 to 1,000 daily-active people at
  100 to 300 requests each. Past it, every Worker route returns an error until midnight UTC, so
  search, sign-in, sync all stop; already-matched songs in local playlists still play.
- Subrequests: 50 per request on free [repo comment, `METRICS_SUBREQUEST_BUDGET` 30]. Not a
  user-count limit, it caps work per call.

### 3. Workers AI: 10,000 neurons a day [repo: `pod-captioner.js`, `/vibe-interpret`]
Shared by podcast captions and the vibe interpreter. Captions are capped by a Durable Object
budget at 150 audio minutes a day (about 214 minutes is the free ceiling) [repo]. When it runs out
the captioner stops (`capped`) and the vibe route falls back to keyword matching [repo]. Degrades
gracefully; not a breakage.

### 4. YouTube: the quota that matters is not ours
- Playback uses the embed in the browser, so each listener's own browser and IP carry it. No
  shared key, nothing to exhaust. [repo]
- Matching reads YouTube HTML pages from the Worker, not the Data API [repo: `PLATFORM-AUDIT.md`].
  There is no quota number, but many requests from Cloudflare IPs are the likeliest thing to get
  throttled or CAPTCHA'd. Cache hits keep this small, but a wave of new users all importing
  playlists at once is the risk. Symptom: matches come back empty or wrong.
- If matching ever moved to the official Data API: `search.list` costs 100 units against 10,000
  a day, so about 100 searches a day [vendor; also noted in `PLATFORM-AUDIT.md`]. That would be
  unusable without a quota increase (which needs a compliance audit).

### 5. Spotify
- Spotify development mode allows only users added in the dashboard (about 25) until quota
  extension is approved [repo: improvements notes on the Spotify sign-in]. That is a hard user
  cap on "Load your music > Spotify", independent of load.
- Rate limiting is a rolling 30 second window per app [vendor]; the worker's metrics path already
  caps concurrency and tracks per request (`worker/src/index.js` near line 165, 3476) [repo].

### 6. GitHub Pages
Soft limits: about 100 GB bandwidth a month, 1 GB site size, 10 builds an hour [vendor]. The
app is cached by the service worker after first load, so a returning user costs little. A
single `index.html` is the main weight. Safe into the thousands of users; not the first thing
to break.

### 7. Beta Google Sheet (Apps Script)
Apps Script web apps have per-day URL fetch and execution-time quotas and a limit on
simultaneous executions [vendor]. Beta routes are cached for a short period (`STATUS_CACHE_S`)
and capped by the beta cap in the Sheet [repo], so the beta cannot exceed its own cap. Tester
reports are throttled to 5 per IP per 10 minutes [repo]. Mobile carrier NAT can put many people
behind one IP, so a throttle may hit innocent users [repo: `ANDROID-NATIVE-AUDIT.md`].

## What breaks first, summary

1. KV writes (about 150 to 300 daily-active signed-in users). Sign-in and syncing stop.
2. Worker requests (about 300 to 1,000 daily-active users, much sooner with imports). Everything
   routed through the Worker stops until midnight UTC.
3. KV reads, then YouTube page matching being throttled from Cloudflare IPs.
4. Spotify dev-mode user list (about 25) for that one import path.

Listening to songs already matched in a local library keeps working through all of these, since
playback is the browser plus the YouTube embed.

## The adblocker part (Mac app, #524, parked)

Not built (see memory note: parked as a reserve option, build only on request). When it is, the
load story is different from the services above:
- The Mac app would block YouTube ad requests with Electron's `session.webRequest`, locally. It
  adds no Worker, KV or Pages load; it removes some network traffic from the user's own machine.
  There is no server-side threshold to tune.
- The risk is policy, not scale. YouTube's API terms forbid blocking ads in embeds, so if it is
  enforced the embed or API access can be cut for every user, not just Mac users. The ceiling is
  a switch, not a number.
- The current ad avoidance (dodging and skipping ads in the web player, #523) is also local to
  the browser and costs the Worker nothing.
- If a "rules list" were ever fetched from the Worker (like an updatable filter list), it should
  be a static file on Pages with a long cache, never a per-user Worker or KV call.

## Recommended before public launch

1. Move the Worker to the paid plan, or at least confirm the daily put and request counts in the
   Cloudflare dashboard during beta (both are visible there).
2. Check that when the Worker returns a quota error, the app says "busy, try
   again later" and keep local playback working (not verified that this is what happens today).
3. Keep imports client-paced (already about 40 matches a minute) so one user cannot spend the
   daily request pot.
4. Decide on YouTube matching if Cloudflare IPs get throttled: a second source or a cached
   match table shared across users.

## Not verified

No load test was run. Vendor numbers were not re-fetched today. Per-user request counts above
are estimates from the code paths, not measurements.
