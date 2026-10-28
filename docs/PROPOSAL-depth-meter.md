# PROPOSAL: Depth meter for Discover (Geethub #553)

Status: exploration only. No app code changed. Owner decision: explore a "depth"
control for how esoteric versus mainstream Discover gets. Explicitly not wanted:
a "never show this artist" button.

The tester's complaint: Discover only pushes artists with the most followers,
and they want to find artists they can genuinely discover and evolve with.

## 1. How Discover picks songs today

Entry points: `maybeExtendDiscoverQueue` (fires on every track load, keeps at
least `DISCOVER_MIN_AHEAD` = 7 songs queued), `prefetchDiscover` (starts the
fetch early), `extendQueueWithDiscover` (appends the batch as `discover-ext:`
queue entries). All three call `fetchDiscoverCandidates(seedTracks, exclude,
DISCOVER_BATCH = 28, allowLong, opts)` in `index.html`. The same function also
feeds CuRRentSSsss (`buildCurrentsPicks`) with `opts`.

Pipeline inside `fetchDiscoverCandidates`:

1. Seed = the most recently played track (plus up to 4 earlier ones, used only
   to demote recent artists).
2. Candidate pool, in parallel:
   - `fetchSimilar` -> worker `GET /similar`. Cascade: Last.fm `track.getSimilar`
     (needs 5+ results), then ListenBrainz similar-recordings (via MusicBrainz
     MBID lookup, no tags), then Last.fm `artist.getSimilar` + each artist's
     `artist.getTopTracks` (`getLastfmArtistFallback`). Each Last.fm candidate
     also gets `track.getTopTags`. Result is edge-cached 7 days per
     title+artist+limit.
   - `fetchThisIsPlaylist` -> `/thisis` (Spotify "This Is <Artist>", only active
     when Spotify credentials are configured; folded in at `matchScore` 0.6).
   - Fallback `fetchYtMix` (YouTube Up Next) if the pool is empty.
3. `fetchPoolAffinity` (crowd tag pairs) and `fetchMoodMetrics` (BPM, key,
   energy from the worker `/metrics`) in parallel.
4. `scoreCandidate`: `0.7 * tag cosine + 0.3 * Last.fm matchScore`, blended
   with crowd pool affinity and the listener's local tag graph, +0.05 same
   artist, -0.15 recently played artist.
5. Re-rank passes: `applyMetricPreference`, `applyTimePreference`,
   `applyYearPreference` (Currents only), `applyTastePreference` (thumbs-downs,
   early skips, artists the listener returns to).
6. `discoverSampleOrder`: score-weighted random walk, weight
   `exp((score - top) / 0.1)`, recent picks for the same seed cut to x0.15.
7. Walk the order, apply hard filters (dupe, library/queue exclusion, declined,
   `discoverLongTrackOk`), resolve to a YouTube video (`searchYouTube`) and
   metadata (`resolveDiscoverMetadata`), stop at `count`.

Where popularity bias comes from today: nowhere in EBBLESS code explicitly, but
it is baked in upstream. Last.fm `track.getSimilar` and `artist.getSimilar`
return the most co-listened neighbours, and co-listening is dominated by
popular artists. Artist fallback takes each artist's top tracks in popularity
order. Candidate tags (`track.getTopTags`) exist only for well-tagged, i.e.
popular, tracks, so the tag-cosine term rewards them again. The match score
(0.3 weight) is itself popularity-correlated. Nothing in scoring ever looks at
how popular a candidate is, so there is no counterweight, and no way for the
listener to ask for one.

## 2. Popularity signals available

| Signal | Source | Cost | Reliability | Status in repo |
|---|---|---|---|---|
| Last.fm listeners + playcount, per artist (`artist.getInfo` -> `stats`) | Last.fm, keyed (`LASTFM_API_KEY`, already set) | 1 call per artist; cacheable for a month | Good. Scrobble-based, so it skews to the Last.fm user base (older, rock/indie/electronic heavy) but it is the best free signal across genres and is on a consistent scale | Not used for discovery. `track.getInfo` listeners is already read in `vibeVerifySeed` (`VIBE_SEED_MIN_LISTENERS = 5000`), so the parsing pattern exists |
| Last.fm listeners + playcount, per track (`track.getInfo`) | Last.fm | 1 call per candidate (the pool already does 1 `track.getTopTags` per candidate, so this doubles Last.fm calls on a cache miss) | Good, more specific than artist; but a deep cut by a huge artist reads "low" at track level, which is not what the tester means. Artist level is the right one for "esoteric artist" | Not used |
| Candidate rank in `artist.getTopTracks` / `track.getSimilar` order | Already in `/similar` | Free | Weak, ordinal only | Implicit |
| Last.fm tag "under 2000 listeners" and similar | Last.fm tags | Free | Noisy, user-made | Currently blacklisted in `TAG_BLACKLIST` |
| Deezer artist `nb_fan` (`/search/artist`, `/artist/{id}`) | Deezer, keyless | 1 call per artist, 50 req / 5 s limit per IP, shared Worker egress | Good for mainstream, patchy for small/regional artists | The worker already calls `api.deezer.com/search/artist` (bio lookup, ~line 2589) and Deezer track search (`deezerMetrics`) |
| Deezer track `rank` | Deezer track object | Already in `deezerMetrics` detail response | Medium | Fetched but discarded |
| YouTube view count of the matched video | Worker `searchYouTube`/`/search` scoring (`c.views`, `popularityBonus`) | Free at resolve time (already fetched) | Medium. Inflated by label uploads and reposts, but a decent last-resort floor and a sanity check on "Underground" picks | Used only to rank match quality in `/search`, not exposed to Discover |
| Spotify artist `followers` + `popularity` (0-100) | Spotify Web API, Client Credentials | 1 call per artist, needs credentials; `/thisis` already wants them but the default deployment has none | Good, and 0-100 is easy to threshold. Spotify has cut several endpoints recently (related artists, audio features), so confirm `GET /artists` still returns both fields before relying on it | Credential plumbing exists in `/thisis`, not enabled by default |
| SoundCloud play counts | Worker `/soundcloud` | Per-track page fetch | Only meaningful for SoundCloud-origin tracks; no catalog-wide use | Not applicable to the Last.fm-driven pool |
| MusicBrainz | MB search | 1 req/s etiquette | No popularity field; ratings are very sparse | Not useful for this |
| ListenBrainz listen counts | ListenBrainz popularity endpoints | Keyless | Smaller user base than Last.fm. Verify the endpoint before use | Not used |
| Apple/iTunes search | iTunes | Keyless | No popularity or follower field at all | Not useful for this |
| The listener's own history (`LS_TASTE`, graph) | Local | Free | Perfect for "what have I already heard", not a popularity signal | Used by `applyTastePreference` |

Recommended primary signal: **Last.fm artist listeners** (log scale). It is the
only free, keyed, already-configured source that covers nearly every artist the
pool can produce, and the Worker already has the call plumbing, the cache and
the key. Secondary: Deezer `nb_fan` as a gap-filler when Last.fm has no entry,
and resolved YouTube views as a post-pick sanity check. Spotify popularity is a
later option if credentials are ever added.

Cost note: the worker caches `/similar` for 7 days. If listeners ride along in
that payload, the cost is paid once per seed and is free for every repeat,
which fits the project's free-tier discipline (`/pool/signal` already hit a
daily write cap once). `artist.getInfo` per artist should get its own long
cache (30 days: audience size barely moves), so artists shared across many
pools are fetched once.

## 3. Design

### The control

One control, called **Depth**, with four steps:

| Step | Label | Meaning |
|---|---|---|
| 0 | Mainstream | Today's behaviour, unchanged. Big names are welcome |
| 1 | Familiar | A light lean away from the very biggest artists. Most picks are known-ish names |
| 2 | Deep cuts | Clearly favours smaller artists and the less-played end of the pool; big names are rare |
| 3 | Underground | Mostly small artists, 2nd-hop similar artists included, biggest tier excluded |

Four steps rather than a free slider: "least clicks" is the project motto, each
label tells the listener what they will get, and four discrete values are easy
to test and to explain. A tap cycles to the next step and wraps; a long press
or tap on the label opens the four options.

Default: **Familiar** (step 1) for new listeners. Rationale: Mainstream is
exactly today's behaviour, which is what generated the complaint; Familiar
corrects the bias gently without making a first-time listener hit thin pools.
Open question for the owner: default to Familiar or to Mainstream for
existing listeners (see section 7).

### Where it lives

In the queue panel header, next to the Discover lightbulb
(`#discoverToggleBtn`), shown only while Discover is on (dimmed and inert when
off, like the toggle itself). It is a compact pill that shows the current label
and cycles on tap. Reasons: Discover is controlled from that header today, the
control is meaningless without Discover, and it is one tap away without a
settings page.

Secondary placement, later: the same control inside the radio/Swell screens
and a row in Settings, all bound to the same setting.

```
 Queue                                                         
 +-----------+  +---------------------------+  <  >  save  x
 | (o) Discover |  |  Depth: Familiar   ..o.. |
 +-----------+  +---------------------------+
                   Mainstream  Familiar  Deep cuts  Underground
                       o----------(*)--------o----------o
                   "A little less obvious"

 tap pill      -> next step
 tap label row -> jump straight to a step
 caption under the pill changes per step:
   Mainstream   "The big names"
   Familiar     "A little less obvious"
   Deep cuts    "Smaller artists, fewer hits"
   Underground  "Artists most people haven't heard"
```

### Persistence

New key `ebbless:discoverDepth` (integer 0-3), global rather than per playlist
(the tester wants a taste dial, not a per-list chore). Add it to
`PROFILE_SETTING_KEYS` so it follows the listener across devices through the
existing profile sync. Not gated by `personalizeOn()`: it is an explicit
setting, not a learned signal, so it works when personalised listening is off.

### How it affects the queue

Changing the step does not rebuild what is already queued. It affects the next
`extendQueueWithDiscover` batch, and the existing discover prefetch is
invalidated (add depth to `discoverPrefetchKey`) so the next batch is built at
the new depth. Optional later: a "Refresh upcoming" action that drops the
`discover: true` entries after the current track and refetches
(`removeDiscoverFromQueue` already exists).

CuRRentSSsss: leave unchanged in slice 1 (it has its own tuning); expose it
through `opts.depth` so it can opt in later.

## 4. Algorithm per step

Two mechanisms, both applied inside `fetchDiscoverCandidates`:

A. **Re-rank by inverse popularity** after the existing scoring passes and
before `discoverSampleOrder`. Needs a `listeners` value on each candidate.

B. **Reach deeper** for steps 2 and 3: widen the pool with second-hop similar
artists, because re-ranking a pool made of famous artists can only reorder
famous artists.

### Worker side

`/similar` response candidates gain `artistListeners` (integer, 0 or missing =
unknown). Computed from a new cached helper:

```
async function getLastfmArtistListeners(artist, env):
  cached = cache.get('artistinfo/' + norm(artist))            // 30 day TTL
  if cached: return cached
  data = lastfmCall('artist.getInfo', { artist, autocorrect: 1 })
  n = parseInt(data?.artist?.stats?.listeners) || 0
  cache.put(..., n)                                            // cache 0 for 1 day only
  return n
```

Run through `mapWithConcurrency(…, 5, …)` alongside the existing tag fetch.
Dedupe by artist first: a 30-candidate pool usually has far fewer distinct
artists, so the extra calls are about 10 to 20 per cache miss.

A new optional param `deep=1|2` on `/similar` triggers the second hop (only for
steps 2 and 3, so Mainstream and Familiar cost nothing extra):

```
// deep = 1 (Deep cuts) or 2 (Underground)
async function widenPool(seedArtist, candidates, deep, env, limit):
  near = artist.getSimilar(seedArtist, limit=15)                  // already used by /artistmap
  second = []
  if deep == 2:
    for a in top 5 of near by match:
      second += artist.getSimilar(a.name, limit=10)               // 5 extra calls, cached
  extra = unique(near + second) minus artists already in candidates
  infos = mapWithConcurrency(extra, 5, a => getLastfmArtistListeners(a.name))
  extra = extra.filter(a => infos[a] > 0)                         // drop unknowns
  for a in extra sorted by listeners ascending (but >= floor):
    tracks = artist.getTopTracks(a.name, limit=6)
    pick tracks ranked 2..5 (skip #1 which is usually the hit)    // the "deep cut" part
    candidates.push({ title, artist: a.name, matchScore: 0.5 * a.match,
                      tags: artistTopTags(a.name), artistListeners: infos[a] })
```

Cache key includes `deep` so the mainstream cache is untouched
(`SIMILAR_CACHE_VERSION` + `/deep/N`).

### Client side

```
const DEPTH_PROFILES = [
  // strength: how hard inverse popularity pulls; floor/ceil in listeners;
  // temp: sampling temperature; wide: pool widening level
  { name: 'Mainstream',  strength: 0,    ceil: Infinity, floor: 0,   temp: 0.10, deep: 0 },
  { name: 'Familiar',    strength: 0.10, ceil: Infinity, floor: 0,   temp: 0.12, deep: 0 },
  { name: 'Deep cuts',   strength: 0.25, ceil: 2.0e6,    floor: 300, temp: 0.15, deep: 1 },
  { name: 'Underground', strength: 0.40, ceil: 3.0e5,    floor: 300, temp: 0.18, deep: 2 },
];

function applyDepthPreference(ranked, depth):
  p = DEPTH_PROFILES[depth]
  if p.strength == 0: return ranked

  // Percentile within THIS pool, not absolute thresholds, so it adapts to genre
  // (a "small" jazz artist and a "small" pop artist differ by orders of magnitude).
  known = ranked.filter(x => x.c.artistListeners > 0)
  if known.length < 6: return ranked          // thin pool or Last.fm missing: do nothing
  logs = known.map(x => log10(x.c.artistListeners)).sort(asc)
  pct(v) = fraction of logs <= v                // 0 = least popular, 1 = most

  for x in ranked:
    L = x.c.artistListeners
    if L > 0:
      obscurity = 1 - pct(log10(L))             // 1 = deepest in the pool
      x.score += p.strength * (obscurity - 0.5) // symmetric: obscure up, popular down
      if L > p.ceil: x.score -= 0.5 * p.strength   // soft cap, never a hard drop
      if L < p.floor: x.score -= 0.3               // too obscure to trust the match
    else:
      x.score -= 0.05 * p.strength                // unknown: slight, not a ban
  re-sort ranked by score, reassign rank
  return ranked
```

Notes on the numbers:

- Scores today run roughly 0.2 to 0.9 and sampling temperature is 0.1, so a
  `strength` of 0.4 shifts a pool-deepest candidate by +0.2 and a pool-biggest
  candidate by -0.2: a clear, not total, reorder. Final values need tuning on a
  real pool (the existing repeat-run simulation described under
  `discover-randomness` in `IMPROVEMENTS.md` is the right harness).
- The sampling temperature rises at deeper steps (`temp`), widening the draw
  so a thin deep pool does not collapse to the same few tracks. This needs
  `discoverSampleOrder` to take the temperature as a parameter (it is a
  constant today).
- `rank` stays the post-depth score rank, so the long-track strong-match rule
  behaves as before.
- The soft ceiling is a score penalty, not a filter, so Underground still
  returns something when the pool is all large artists.
- Keep the existing same-seed-artist and recent-artist adjustments; they are
  independent of depth.

Post-resolution sanity check (optional, step 3 only): when the YouTube match is
resolved, if its view count is far above the artist's expected scale (for
example more than 50M views for an artist under 300k listeners), it is likely a
same-name mismatch or a label reupload of something else; skip it. This reuses
data the worker already has in `/search` scoring.

Thin pool fallback: if after filtering fewer than `count` tracks resolve at the
chosen depth, fall back one step toward Mainstream for the remainder of the
batch rather than returning short (the existing code already degrades by
retrying without the strict skip set for Currents; same idea). Surface it
quietly: the pill shows "Deep cuts" but a one-time toast or tooltip says
"Not enough deep matches for this song, mixed in some familiar ones".

## 5. Risks

- **Cold start.** A seed with no or few Last.fm similar tracks falls through
  to ListenBrainz (no tags, no listeners) or the YouTube mix (no popularity
  info). In those cases depth silently no-ops (`known.length < 6`). That is
  acceptable, but the pill should not promise something it cannot deliver:
  tooltip "Depth works best on songs with listening data".
- **Thin pools at depth.** Real underground neighbours exist for a seed only
  if Last.fm has similarity data for small artists, which is sparse at the very
  low end. The `floor` (300 listeners) guards against matches that are noise.
  Widening to second-hop artists is what makes Deep cuts and Underground
  viable, which is why it is in the design and not optional.
- **Playability.** Small artists are less likely to have a clean official
  upload; `searchYouTube` may return a wrong-artist or low-quality match. The
  worker already has wrong-artist guards (`artistKeys`, `candidateNamesArtist`).
  Expect a higher skip-resolve rate at depth 3, so over-fetch more candidates
  (for example 1.5x the pool) at higher steps.
- **Last.fm bias.** Listener counts reflect Last.fm's audience: regional and
  non-Western artists (a stated EBBLESS interest, see `docs/REGIONAL-SOURCES.md`)
  can look "underground" simply because Last.fm users do not scrobble them. The
  percentile-within-pool approach softens this; Deezer fans as a second opinion
  helps further. Do not label results "underground" anywhere in the UI beyond
  the user-chosen step name.
- **API limits.** Last.fm is generous but not unlimited. Baseline extra cost
  per `/similar` cache miss at steps 0 and 1: about 10 to 20 `artist.getInfo`
  calls. At step 3 add about 5 more `artist.getSimilar` and 10 or so
  `artist.getTopTracks` calls. Everything is cached (7 or 30 days) and shared
  across all listeners. Deezer is limited to 50 requests per 5 seconds per IP
  and the Worker shares egress, so use it only as a gap-filler, with a short
  timeout, never in the hot path.
- **Worker deploy order.** Worker must ship before the client reads
  `artistListeners`; the client treats a missing field as "unknown" so an
  older worker is safe (same pattern as `year` in `/spotifyart`).
- **GPU budget.** The control is a static pill with no animation; nothing
  here touches the `CLAUDE.md` GPU rules.
- **Behaviour change for everyone.** Defaulting existing listeners to
  Familiar changes their Discover without asking. Tester feedback says that is
  the wanted direction, but it is the owner's call (section 7).
- **Not a feedback loop.** Depth is a dial, not a block list. Nothing here
  hides an artist permanently. Existing thumbs-down logic is untouched.

## 6. Phased plan

**Phase 1, smallest slice: re-rank only, no new pool.** About 1 to 1.5 days.
- Worker: add `getLastfmArtistListeners` with a 30 day cache; attach
  `artistListeners` to `/similar` candidates (bump `SIMILAR_CACHE_VERSION`).
  Worker unit test for the shaping/parse helper.
- Client: `ebbless:discoverDepth` setting (add to `PROFILE_SETTING_KEYS`),
  `applyDepthPreference` with Mainstream / Familiar / Deep cuts profiles
  (no pool widening yet; Underground can be a hidden fourth profile or simply
  labelled the same as Deep cuts until phase 2), call it right after
  `applyTastePreference`, add depth to `discoverPrefetchKey`.
- UI: the pill in the queue header next to the Discover lightbulb.
- Verify with the existing mock harness approach: for a fixed synthetic pool
  with listener counts, the share of low-listener picks should rise with the
  step, filters should be unaffected, and step 0 must be byte-for-byte today's
  order.
- Even this alone fixes the headline complaint for any pool that contains a
  spread of artist sizes, which Last.fm pools usually do.

**Phase 2: reach deeper.** About 1.5 to 2 days. Worker `deep=1|2` pool
widening (second-hop `artist.getSimilar`, deep-cut track selection), the
Underground step, temperature parameter on `discoverSampleOrder`, over-fetch at
depth, thin-pool fallback and toast.

**Phase 3: polish and second opinions.** About 1 to 2 days. Deezer `nb_fan`
gap-filler, YouTube view sanity check, caption text under the pill, settings
row and radio/Swell placement, optional CuRRentSSsss opt-in, optional
"refresh upcoming" action. Optional Spotify popularity if credentials appear.

Total estimate: about 4 to 5.5 developer-days across three small merges,
phase 1 usable on its own. This spans `index.html`, `worker/src/index.js` and
a worker redeploy, so it needs a lane via `scripts/session.sh` and the
GPU-watchdog console check on the new pill.

## 7. Open questions for the owner

1. Default step for existing listeners: Familiar (fixes the complaint by
   default) or Mainstream (no surprise until they touch it)?
2. Is "Underground" the right top label? Alternatives: "Hidden gems", "Far out".
3. Should the control apply to CuRRentSSsss and radios too, or only the
   queue's Discover?
4. Is a listener-count threshold the right idea of "esoteric" for this tester,
   or do they also mean "newer artists" (a recency/emerging-artist lean would be
   a separate signal, e.g. Last.fm listener growth or first-release year)?
5. "Evolve with" artists suggests tracking: would a later "Rising" step that
   favours artists whose audience is growing be wanted? That needs a stored
   history of listener counts, so it is out of scope here.
6. OK to add Last.fm call volume (cached, shared across listeners) to the
   free-tier budget, and to require a worker redeploy with phase 1?
7. Spotify credentials: the `/thisis` source is dormant without them. If the
   owner is willing to add them, Spotify popularity becomes a good second
   signal; otherwise stay with Last.fm + Deezer.
