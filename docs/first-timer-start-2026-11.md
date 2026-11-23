# First-timer start (HQ T-0011), release 580

App only. No worker deploy, no Sheet step, no `house-vibes.json` change. Nothing is pushed until the CEO says yes.
Built on `origin/main` 5ce8f77 (release 578). Release 580: 579 is taken by T-0012 (vibe window, branch claude/vibe-window-2a4457), 578 is the last on main. If another lane
takes it first, renumber `sw.js` and the WHATS_NEW entry.

## What a new person sees, in order
New person = no music history by the existing rule: `!hasEverPlayed() && !splashResumable()` (`isNewPerson()`).

1. The first-visit splash, as in release 578 (Enter, Import, Tutorial; the install invite where it applies). Unchanged.
2. After Enter, or after the splash clears on its own, **Home and Search** (not the Library). The decision is made in
   `startApp()` where the view is chosen, so every way into the app lands the same: Enter, the auto-entering phone path,
   and the Android web splash.
3. At the top of Home, one **Start here** tile: the album cover, "breathe love d e e p", "Play this song: . . . g a s p",
   and a play button. It exists only for new people.
4. Tap the tile: the player opens and the song starts. Nothing plays before the tap: not on Enter, not on load, not on
   landing on Home.
5. Checklist (Library page card): step 1 reads "1 of 5 · Play this song" for a new person. It ticks on the first real
   `PLAYING` event, from any path (the tile, a search result, a tile on Home). The next steps are unchanged (Open an
   artist or album, Add a song, Create a playlist, Revisit something you saved), so it is still n of 5 and ends cleanly.
   Everyone who has already played keeps "Search for a song, artist or album" as step 1.

Returning people land where they did in release 578 (player with a track, otherwise Library). Splash, Resume and the
Android native splash are unchanged.

## How it works
- `STARTER_ALBUM` (inline in `index.html`, block `start-here`): the 10 tracks of the SoundCloud album Breathe Love Deep
  by MAL GRIOT MUSIC, read once on 2026-11-23 from the worker's `/soundcloud` route (SoundCloud ids, titles, art,
  durations). A tap builds the album from this data, so it never waits on the roughly 20 second lookup. The audio still
  loads through the existing SoundCloud player. If SoundCloud renames or removes a track, refresh the list:
  `curl "https://spotify-youtube-search.malgriot.workers.dev/soundcloud?url=https%3A%2F%2Fsoundcloud.com%2Fmal-griot%2Fsets%2Fbreathelovedeep"`
  and rebuild the rows.
- The tile saves the album to the library on tap (as the existing starter seed does) unless a good copy is already there.
- Checklist: new milestone `firstplay` ("Play this song") sits in the Library list in place of `search` for people with
  no real play yet (`msTasks()`); once it is done it stays, so the list never changes under the person.

## Counters (`plays_tapped`, `plays_started`, `plays_failed`)
| Path | Tapped | Started | Failed |
|---|---|---|---|
| Start here tile | 1, at the tap (skipped if music is already playing) | the real `PLAYING` event | `statsPlayError()` after 15 s with no `PLAYING` (and the existing 20 s timer is then a no-op), or a deck error |
| Song from search results, a Home tile, a link, the nudge play button, **first-timer** | 1, counted when the song is loaded to play (new, `loadIndex`) | the real `PLAYING` event | the existing 20 s timeout |
| Song from those paths, a person who has already played | unchanged: a tap is counted only for the play button, a playlist's Play, the toggle and splash Resume | only if a tap is waiting | the existing 20 s timeout |
| Auto-advance, resume of a running song | none | none | none |

The gap this closes: before, only five explicit play buttons counted a tap, and a `PLAYING` event with no tap counted
nothing. A first-timer who started their first song from a search result or a tile was invisible, including when it
failed. The new line is one condition in `loadIndex` (`autoplay && !hasEverPlayed()`), so it never touches people who
have played and never counts auto-advance. One tap is one tap: `statsPlayTapped()` keeps one pending attempt, so the
tile, `playPlaylistNow` and `loadIndex` asking for the same start count once.

If the starter cannot load: offline at tap time, the tile says "You're offline. Connect and tap to try again." and
nothing is counted. Otherwise, after 15 s with no `PLAYING`, a toast says the song did not start, the tile reads
"Couldn't start. Tap to try again.", and one failure is counted. Navigation always works; the person is never stuck.

## Tests
- `node scripts/test-first-timer-start.js` : source checks plus real headless Chrome: new person at 390 px and desktop
  lands on Home with the tile, no auto-play (6 s wait, counters all 0), checklist "1 of 5 · Play this song", the tap
  (1 tapped, 1 started, 0 failed, song plays, step ticks, next is "2 of 5 · Open an artist or album", still 0 failed after
  25 s), returning person lands on the Library with no tile and the Search step, SoundCloud blocked (one failure, honest
  state, not stuck, no double count), offline at tap (honest state, nothing counted). `--slow` adds Slow 4G timing,
  `--shots` rewrites the screenshots. It uses real SoundCloud audio over the network and blocks the worker's `/beta/*`
  routes so the fake tester token it uses is never sent anywhere. `scripts/check.sh` runs only the source part
  (`--no-browser`).
- `node scripts/test-first-play.js` : gained three checks for the tile and first-timer counting.
- Screenshots at 390 px: `docs/first-play-evidence/7-new-person-lands-on-home.jpg`,
  `docs/first-play-evidence/8-returning-person-lands-on-library.jpg`.

## Tap to PLAYING (headless Chrome, 390 px, real SoundCloud player)
Time from the tile tap to the SoundCloud player's real PLAYING event (`window.__ebbStartHere`, set by the tile code),
cold page, new person, Slow 4G = Chrome's preset (1.6 Mbps down, 750 kbps up, 562 ms latency):

| Network | Runs (ms) | Median |
|---|---|---|
| Normal | 1980, 2230, 2604, 3554, 4009, 4074, 5680, 7222, 7912 | about 4000 |
| Slow 4G | 3438, 3801, 3991, 4189 | about 3900 |

So the tap does not wait on the worker lookup (the old path took about 20 s), but "a second or two" is not what
headless Chrome measured: the time is dominated by SoundCloud's own widget and stream start, which varied from 2 s to
8 s between runs on the same network and was not slower on Slow 4G (the SoundCloud player script is already requested
at page load, so the tap itself waits only on the iframe and the audio). Slow 4G also makes the page itself take about
50 s to finish loading before the splash shows Enter; that is the existing page weight, not this change.

## Release steps (app only)
1. QA reviews the branch `claude/first-timer-start-db2de5`.
2. On the CEO's yes: merge to `main` and push (GitHub Pages deploys the app). No worker deploy, no Sheet step.
3. Phone check, fresh browser profile (this is the part headless Chrome cannot prove): load the app on mobile data, let
   the splash pass or press Enter. You should land on Home with Start here at the top and the Library checklist saying
   "Play this song". Nothing should play. Tap the tile: music starts in a couple of seconds. Then Library: the checklist
   shows the tick and "2 of 5".
4. Same phone, reopen: you are no longer new, so you land on the Library as before and there is no tile.
5. Rollback: revert the commit and bump `sw.js` to the next number. Nothing else changed outside the app.

## Not verified here
- A real phone (touch, real autoplay rules on Android Chrome and Safari, real mobile data). Headless Chrome with
  `--autoplay-policy=no-user-gesture-required` and muted output reached the `PLAYING` event; whether the audible start
  behaves the same on a phone is the phone check above.
- The CEO's phone showed the splash with only Add to Home Screen, then the app, for a few seconds. Headless Chrome on a
  non-localhost host reproduces the Add to Home Screen splash. The landing is decided in `startApp()` so it does not
  depend on which splash path ran, but the real phone is the proof.
- The newsletter (T-0008) bullets still describe the one-tap Play of release 577 and need rewording.
