# Proposal: Music map (Geethub #597)

Design proposal only. No app code changed. Date: 2026-10-18.

## What the owner asked

"Utilize this music map to connect users with their vibe. Reverse engineer it
and use it." The link is music-map.com: type an artist, and a cloud of other
artists floats around them. The closer a name sits, the more likely someone who
likes the first artist also likes that one. Tap any name and it becomes the new
center.

## What it would feel like in EBBLESS

1. On any song, artist page or the now-playing card, tap **Map**. One tap.
2. The artist sits in the middle. Around them, 15 to 25 related artists, nearer
   means closer in sound.
3. Tap a name: the map glides so that artist is the new center. You can keep
   wandering as long as you like.
4. Tap the play button on any name: EBBLESS starts a mix of that artist's songs
   right away, and the map stays open so you can keep going.
5. A small trail at the bottom shows where you came from (Erykah Badu, then
   D'Angelo, then Little Dragon), so you can step back.

No search box needed to start, no settings. It opens from whatever is playing.

## Mission fit

Strong. The mission says "make discovery feel effortless" and "curiosity, and
the freedom to wander." A map you drift across is exactly that. It adds a layer
under a simple surface (one button) and it does not ask for anything: no
sign-in, no data from the listener.

The only thing to watch: it must not become a second, separate app inside the
app. It should open from what is playing and hand straight back to playback.

## Should we "reverse engineer" music-map.com?

No, not the site itself. music-map.com is run by Gnod. Its map comes from years
of its own visitors' answers. There is no public API, and scraping their pages
to copy that data would be taking someone else's work, could break their terms,
and would stop working whenever they change the page.

What we can copy is the **idea**, which is not owned by anyone: "people who
like A also like B", drawn as distance. EBBLESS already has a legitimate source
for that:

- **Last.fm "similar artists"** is already wired into the worker
  (`artist.getSimilar` in `worker/src/index.js`, using the existing
  `LASTFM_API_KEY`). It returns related artists with a match score from 0 to 1,
  which maps straight onto distance.
- **ListenBrainz / MusicBrainz** (open data) as a backup when Last.fm has
  nothing.
- **Later: EBBLESS's own listeners.** The worker's `TASTE_POOL` already counts
  which tags go together across listeners, anonymously. Over time the same
  approach could count which artists go together, which is the real Gnod
  method, built from our own data.

## Simplest version that could ship first (MVP)

- One new worker route, e.g. `/artistmap?artist=`, that calls Last.fm similar
  artists, keeps the top 20, and caches the answer for a week (same caching
  style as `/similar`). One request per map, cheap.
- A full-screen map view in `index.html`: artist names placed by match score
  (closest in the middle ring, weakest at the edge), tap to recenter, play
  button per name using the existing artist mix (the same path the artist
  pages and `/thisis` use).
- Opens from the song menu and the artist page. Back button closes it.
- Trail of the last few artists.

That alone delivers the feeling in the issue.

## Full vision

- **Your map:** open Map with nothing playing and the center is you, ringed by
  the artists you actually play most (from the local listening history).
  "Connect users with their vibe" in the most literal sense.
- **Walk a path:** pick two artists and EBBLESS builds a playlist that drifts
  from one to the other through the artists in between.
- **Map from a song**, not only an artist, using the song-level similar data
  `/similar` already returns.
- **EBBLESS's own map:** add artist pairs from our own listeners to the pool so
  the map slowly reflects how EBBLESS people listen, not only Last.fm.
- **Colors by vibe:** tint names by their main tag (soul, house, jazz) so the
  shape of a scene shows at a glance.

## What it needs technically

- **Worker:** one small route plus a cache. No new storage. No KV writes, so it
  does not touch the free-tier daily write cap.
- **index.html:** one new view. Names are plain text elements placed with
  `transform`. Recentering animates only `transform` and `opacity`, per the GPU
  budget rules in CLAUDE.md. No blur, no canvas loop running when idle, and the
  view must pause anything underneath it (or be paused itself) while hidden.
  The ambient background under it should pause while the map covers it.
- **Accounts:** none needed.
- **Cost:** none new. Last.fm is free for this use, and results are cached.
- **Platforms:** works the same on Android, Mac and PC since it is plain web.

## Legal and privacy

- Low risk as long as we do not scrape music-map.com or reuse its look closely.
  Our own layout, our own data sources.
- Last.fm's API terms ask for attribution: a small "Data from Last.fm" line on
  the map. Check their current terms before shipping.
- No personal data leaves the device for the MVP. "Your map" in the full
  version reads only local history and sends only artist names, same as today.

## Effort

- MVP: **2 to 3 days**.
- Full vision: another **5 to 7 days**, mostly the path builder and own-data
  pooling.

## Risks and what could go wrong

- **Thin results for small or local artists.** Last.fm may return few or no
  similar artists. Fall back to MusicBrainz, and if still empty show a short
  "Not much mapped around this artist yet" and offer the artist mix.
- **Artist name mix-ups** (two artists with the same name). Use MusicBrainz ids
  where Last.fm provides them.
- **Too busy on a phone screen.** Cap at about 15 names on small screens and
  keep tap targets large.
- **GPU budget.** A map that keeps animating while hidden would repeat #487.
  Build it static-by-default.
- **Overlap with the artist pages lane.** The map should open from the artist
  page, so coordinate with whoever owns that page.

## Recommendation

**Build the MVP now.** Best value for the effort of the four ideas, squarely on
mission, no new backend, no cost, no legal exposure. Hold the full vision until
testers have used the MVP.
