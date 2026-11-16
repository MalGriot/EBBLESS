# Progress log

Baseline: main @ 08d49e2, tree clean, scripts/check.sh passes.

## Done (committed on agent/backlog-phase1, NOT deployed, NOT merged to main)
- #846 prev-song: skip wait cap 25s -> 8s; incoming song seeks to 0 when the fade starts. Unverified live (needs real playback soak).
- #830 fLUX: no automatic song title card (C key still shows it).
- #838/#809 fLUX: openMilk closes video card, cymatics, lyrics first (index.html ~34490). Unverified live. Art-style cycling: key 1 already cycled art, CD, cassette, LP with fLUX staying open behind the disc/tape (VERIFIED LIVE, no change needed). Added: plain art now sits faded (40%) over fLUX instead of covering it (VERIFIED LIVE, inline buttons still clickable). Fullscreen variant NOT tested (CSS shared; needs a real fullscreen check).

- #822 unheart: the playing song stays in the queue and keeps playing, no skip; only the saved Liked list loses it (likeGhosts, playlistForWrite in index.html). VERIFIED LIVE: unheart keeps title, reheart restores original order, next goes to the right song, later plays do not re-add it. Thumbs down (CuRRentSSsss decline) already plays next; unchanged. Not tested: signed-in sync, unheart from the queue panel or library rows.
- #824 queue: Played songs now sit above Now (was below the upcoming list), Now is lined up at the top of the view, and the list slides back to it 4s after scrolling stops (smooth unless reduced motion). VERIFIED LIVE on a 37-row queue: opens with Now at offset 0, scrolled away, back at 0 after 5.5s idle, follows on next. Not tested: mobile width, reduced motion, long-press/swipe rows. This reverses the earlier #730 choice (Played at the bottom).
- #826 Cmd/Ctrl-click play next: library cards (playlist, album) queue the whole thing right after the playing song; track rows queue that one song; artist and podcast cards show an explanation toast. VERIFIED LIVE: Liked (3 songs) played next in order, one row from a 32-song playlist played next, plain click still opens the playlist. NOT tested: the artist/podcast explanation (no such card in the test library), videos (no video library yet, #868), mobile. Uses a toast, not a modal pop-up.
- #836 trailer in queue: cause is the worker's YouTube match (it can pick a film trailer for a song title); the Unliked playlist is only the thumbs-downed videos, so it replays whatever got matched. Fix: new `trailer` exclude group in worker/src/index.js (hints in match-text.js, waived if the song's own title says trailer) + unit test. VERIFIED BY TEST (worker npm test, 246 pass). NOT verified end to end: needs the worker DEPLOYED (not done) and only affects new matches; the existing trailer in the owner's Unliked/library stays until removed or re-matched. Which song it came from is unknown.
- #866 library thumbs: song count, runtime and last played removed from library cards; status/description lines (Daily picks, A mix of your library, Unliked hint, Nothing yet, busy messages) stay. VERIFIED LIVE (library at phone width): user playlists show no count line. Not checked: desktop width, list view, artist/album/podcast/set cards (same code path).

## Findings
- #831 melt-in: milkLayer already fades opacity 1.6s over the page; ticket may mean over the *art style* in the inline box. Needs a live look before changing.

## QA status (live check, 2026-11-16, localhost worktree, test playlist, in-app browser)
- #838/#809: VERIFIED LIVE. Cymatics -> key 3 and video card -> key 3 both showed fLUX (milk-live) on the first press, with the other tab de-activated. Not covered: art-style cycling, fullscreen.
- #830: VERIFIED LIVE. After 6s of fLUX the title card never got is-on. C key not retested.
- #846: PARTLY VERIFIED. Warm previous: new song shows in 0.5s, starts at 0:00. Cold previous (pressed 2s after next): title switched at once, old song held ~8s (was up to 25s), incoming song's clock reset to 0:00 when the fade began (the seek fix firing). NOT verified: audible audio/volume (no ears in the harness), real ads. Clock side effect FIXED (6cc6dcf) and VERIFIED LIVE: on a cold previous the clock holds 0:00 for ~9s, then counts up from 0:01, no jump.
- Console: 82 errors, none from the three changes. One 403 from Google sign-in on localhost, the rest (80+) are 502s from the production worker `/ytmix?videoId=...` (a worker-side failure, repeated per song; not touched by this lane, needs its own look).
- Smoke test, Phase 1 (2026-11-16, desktop, localhost): PASS. Next, previous (from 0:00), seek to 50%, pause stops clock, resume, keys 2/4/3/3/1 (cymatics, lyrics, fLUX open and close, art), queue row click, library card opens playlist, library row plays, reload resumes same song with queue restored. No JS errors. Only failed request after reload: 404 /brand/assets/liked-art-poster.jpg, a file missing on main too (pre-existing). Console also shows the 502s from /ytmix (production worker).

## Library batch status (checked live at 1440x900, 'lib-wide' = the widened library column)
- #865 art does not fade in wide library: NOT REPRODUCED. In lib-wide the player cover cross-fades over 1s (A 1.00 to 0.00, B 0.00 to 1.00). One run right after toggling lib-wide showed no cover for ~2s, then it appeared (a layout-change timing effect, not isolated). May mean a different art surface (Recents thumbs, now-playing tiles); needs the owner's description.
- #872 home page in the slim column: lib-wide gives the home column 340px; Recently played tiles are ~120px and Top artists circles run off the edge as a normal horizontal scroll. What 'accommodate' should look like is a design call; not changed.
- #867 filter menu glitchy: clicking the filter icon in the Library header only changed the grid tile size in a still screenshot; the glitch is not visible in a still. Needs a screen recording or exact steps.
- #863 sequential thumb loading: engineering task, not started (needs a repro of the freeze to verify; risk of regressions in library render).

## Next action
Phase 1 is done except the items above and the fLUX decisions (#861, #855, #831). Run the phase smoke test (QA section of PROJECT_PLAN.md), then merge agent/backlog-phase1 to main, then Phase 2 (#746, #781/#870, #805).
