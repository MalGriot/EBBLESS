# Playlist transfer apps: TuneMyMusic, FreeYourMusic, SongShift, Soundiiz

Covers Geethub #520, #521, #522, #543. Research only, no app code changed.
Date: 2026-10-18.

Method: read each product's public home, pricing and help pages, plus public
reviews. No logins, no accounts, no downloads, no network capture. Everything
below is what the companies say about themselves unless marked. Their accuracy
claims (for example "99%") are marketing, not tested by us. Prices change, so
re-check before quoting them.

## What these apps are

All four do the same job: you sign in to Spotify (or Apple Music, Tidal, etc.)
inside their tool, pick playlists, and they re-create those playlists in a
different service's library. They are "move my stuff" tools. You use them once
when you switch services, or on a schedule if you pay for sync.

EBBLESS is different. It does not move your music into another service. It
reads a link and plays it right away, no account. So these tools are not
competitors for the same moment, but they fix the same first-day problem:
"I have a whole life of playlists somewhere else, how do I get them here?"

## Side by side

| | TuneMyMusic | FreeYourMusic | SongShift | Soundiiz |
|---|---|---|---|---|
| Where it runs | Website | iOS, Android, Mac, Windows, Linux apps | iPhone/iPad app | Website |
| Services | ~18 (Spotify, Apple, YouTube Music, Tidal, Deezer, SoundCloud, Amazon, Qobuz and more) | 15+ | 13 (Spotify, Apple, Tidal, YouTube, SoundCloud, Last.fm and more) | 48 listed |
| Other ways in | Paste a link, paste text, upload a file | Sign in only | Sign in only | Sign in; also file and link import |
| Free | 500 songs total, then pay | 300 songs (600 with an email sign-up) | Limited; page does not say how | Unlimited playlists, one at a time, 200 songs per playlist |
| Paid | About $2/month billed yearly. Unlimited transfers, daily auto-sync (up to 20), cloud backup | About 15 EUR per quarter, 40 EUR per year, or 199 EUR once | Pro from $6.99/month; App Store also lists yearly and lifetime | 5 EUR/month or 39 EUR/year. Whole-library batch transfers, 20 sync slots |
| Matching | Says it uses the song's ISRC code (a unique ID for a recording), then title and artist, keeps order and removes duplicates | "Smart matching," keeps names and order | Matches, then you review and fix before it goes through | Matches on title, artist, album |
| Songs it can't match | Marked "missing," downloadable CSV report | Flagged, one-tap "Rematch" with suggested alternatives, says never silently dropped | Review screen before confirming. Pro adds match fixing | Listed in a transfer report. Page does not say how to fix them |
| Extras | Share link that opens on any service, backup, AI playlist maker | Auto-sync about every 15 min, cloud backup | Share to people on other services, sync new songs | Sync, "smartlinks" for promoting releases, AI playlist maker |

Sources: each product's own pages (tunemymusic.com, freeyourmusic.com,
songshift.com, soundiiz.com and their plans/pricing pages) and the App Store
listing for SongShift prices.

## How the matching works, as far as it is public

- The best matcher is "same recording ID" (ISRC). Spotify, Apple, Tidal and
  Deezer all know a song's ISRC, so a transfer between two of them can be
  nearly exact. TuneMyMusic says it does this first and falls back to title and
  artist. Soundiiz uses title, artist, album.
- Nobody publishes their exact fallback rules. What is visible is the
  experience around the match: a missing list, a CSV, a rematch button, a
  review step.
- Public reviews of FreeYourMusic (mostly App Store and aggregator sites; we
  could not read Play Store reviews directly) repeat two pain points: a song
  gets swapped for a remix of the same song (worst with dance music), and
  "liked songs" land in a new playlist instead of in the Liked Songs list.
  A competitor's page also says the free limit is easy to miss until you hit
  it. Treat those as signals, not as proof.

The pattern across all four: **the matching itself is a commodity. The thing
people judge is what happens when a match is wrong or missing.**

## What EBBLESS already does better

- No sign-in at all. These tools all need you to log in to the source service
  (and sometimes the target). EBBLESS needs a pasted link.
- Instant. Nothing is "transferred," so there is no waiting and nothing to
  pay for. The song plays now.
- Nothing to unmatch on the other side. A missing match here means a skipped
  song, not a broken library in another service.
- Free with no song cap, no 300 or 500 limit.
- Accepts four kinds of links (Spotify, Apple Music, SoundCloud, YouTube).
- A "report a bad match" button already exists in the player.
- Playlists can be shared as links (the app has playlist and track share).

## What EBBLESS lacks compared with them

1. **A "these songs didn't match" screen.** After a link loads, the listener
   has no single place that says "47 of 50 songs found, here are the 3 that
   weren't." Every transfer app shows this and it is the thing that earns
   trust.
2. **A way to fix one wrong song from the list.** All four let you swap a bad
   match for a better one. EBBLESS has a report button, which tells us about
   the problem but does not fix it for the listener on the spot.
3. **Getting a whole library in one go.** The transfer tools do "all my
   playlists plus liked songs" in one step. EBBLESS takes one link at a time.
4. **A backup of the music itself.** TuneMyMusic and FreeYourMusic sell cloud
   backup. EBBLESS has a Save/Open backup in advanced settings, but from the
   code it only covers settings and view preferences (crossfade, library
   sort and so on), not the playlists, so a listener who clears their browser
   data can lose the library.
5. **Paste a list of song names.** TuneMyMusic lets you paste text or upload a
   file. EBBLESS only takes links, so a person with a screenshot, a notes-app
   list or a CSV from another tool has no way in.
6. **Keeping a playlist up to date.** Sync is the main paid feature of every
   tool here. In EBBLESS a pasted playlist is a snapshot.

Note: #543 asks for a "stylish, quick, easy to understand" transfer animation
and #522 asks for sharing playlists to other users and using that to build
listener groups. Both are covered in the list below. The listener-groups part
needs accounts or an opt-in profile, which pulls against "no sign-up," so it
is the lowest item.

## Recommendations, ranked

Effort is a rough guess for one focused build session: **small** is under half
a day, **medium** is one to two days, **large** is several days.

1. **Add a "found X of Y songs" result after any link loads, with the missing
   ones listed.** Small to medium. This is the single most copied thing from
   all four tools and costs nothing in the listener's flow: it only appears
   when something is missing. Directly serves "make discovery feel
   effortless" by never leaving the listener wondering why a song vanished.
2. **Let the listener fix a wrong or missing song right in that list.** Show
   two or three other candidates from the search the app already does, tap one,
   done. Medium. Pair it with the existing "report a bad match" so a fix also
   improves future matches. Fixes the remix-swap complaint seen in reviews.
3. **Paste a list of song names ("Artist - Title" per line) as another way
   in.** Small to medium. Reuses the matching that already exists, and needs no
   account. Also the easiest way for someone coming from a service EBBLESS
   does not read, or from a text export of a library, to bring music across.
4. **Add playlists to the existing Save/Open backup, so one file holds the
   whole library and can be opened again.** Small to medium. Gives the
   listener a backup without any cloud account and covers "I cleared my
   browser." Same idea as the paid backup in the other tools, but free and
   local.
5. **A short, calm import animation that counts songs found as it goes**
   (#543). Medium. Mostly polish, and only worth it after item 1 exists so the
   animation has real numbers to show. Must follow the GPU budget in
   CLAUDE.md: animate only transform and opacity and stop when hidden.
6. **A "refresh this playlist" button on playlists that came from a link.**
   Small. A manual version of sync: tap and it re-reads the original link and
   adds new songs. Skip automatic background sync, which needs servers and
   accounts.
7. **Bring a whole library in one step (all playlists plus liked songs).**
   Large. Needs a source sign-in for most services, which breaks "no
   sign-up." Only worth doing for Spotify if it can be done as a one-time
   optional tool, never a requirement.
8. **Listener groups from shared playlists** (the second half of #522).
   Large, and the weakest fit with the mission because it needs identity. Park
   it unless profile sync already covers it.

Do not copy: paid tiers with song caps, nag screens about limits, anything
that makes the listener log in to start. The mission says no sign-up and no
friction. The caps are the transfer apps' business model, not a feature
listeners like.
