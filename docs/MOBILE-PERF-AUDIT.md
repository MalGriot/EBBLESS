# Mobile CPU and battery audit (Geethub #635, third slice)

Static audit of `index.html` plus the earlier slices recorded in IMPROVEMENTS.md
(`mobile-moves-really-slow-and-slows-down-th`). The first half is a static source audit; the "Measured" section further down
holds the on-device numbers.

## Why Spotify still feels faster

Spotify is a native app: audio decoded by the OS, UI drawn by the GPU with no
page layout, no JavaScript engine, no embedded player. EBBLESS on a phone is a
WebView running a 2.2 MB single-file page, a second embedded player (YouTube or
SoundCloud iframe) per deck, and its own canvases. We will not match native, but
the gap is mostly (a) the embedded video player and (b) things animating or
ticking that nobody can see.

## Inventory (source counts)

| Thing | Count | Note |
|---|---|---|
| `requestAnimationFrame` call sites | 47 | most are one-shots; long loops are viz, record, cassette, cassette stack, lyrics scroll, mini player, cursor |
| `setInterval` | 38 | see table below |
| infinite CSS animations | 47 rules | most are on-demand states; always-on ones listed below |
| `filter: blur` / `backdrop-filter` | 29 / 7 | already audited in slices 1 and 2 |
| `<video>` / canvases | 8 / 4 + 10 created | |

## Always-running timers (the idle "tick tax")

Each wake-up is small; together they keep the CPU out of deep idle, which is the
battery cost. Items marked **no hidden guard** keep running with the screen off.

| Timer | Period | Hidden guard? | Verdict |
|---|---|---|---|
| `updateSeekUI` | 250 ms | no | needed while playing (ad/crossfade logic); can slow to 1 s when hidden and no crossfade pending |
| `npSyncPill` | 1 s | **no** | does nothing unless tuned to On Air; make it start/stop on tune in/out |
| `playLogTick` | 10 s | no | needed (play log) but could be driven off the seek tick instead of its own timer |
| `statsTick` | `STATS_TICK_MS` | no | same: fold into one shared tick |
| `persistResume` | 5 s | no | only needed while playing; stop when paused |
| panel idle closer | 5 s | no | returns immediately when no panel is open; start only while a panel is open |
| `mqSweep` (marquee) | 800 ms | yes | fine; could stop when no marquee is running |
| `scPoolSweep` | 2 s | yes + skips coarse pointers | fine |
| `refreshNowPlaying` | 15 s / 5 s | yes | fine |
| `updateLibraryClockColor` | 10 s, `updateTimeOfDayTint` 5 min | no | trivial |
| `refreshSwellIfDue`, `refreshBlendIfStale` | 60 s | no | trivial |
| `renderAccountRow` | 60 s | yes | fine |
| Mini player `updateMiniPlayerUI` | 500 ms | n/a | desktop PiP only |
| GPU watchdog `scan` | 4 s | n/a | localhost only (checked), `getComputedStyle` on every element, never runs in production |

## Always-on animations that are probably not worth it on a phone

1. **Ambient drift** (`#ambient .layer.is-active`, 16 s infinite, plus a second
   copy under `#flow-layer`): transform only, so cheap per frame, but it keeps
   a full-screen layer compositing for as long as the app is open, including
   while paused. Candidate: stop after the song has been paused for ~10 s, and
   on Battery Saver (see below).
2. **Library card thumbnail cycle** (`thumb-cycle-cover/grid`, 42 s, one
   animation pair per card): scales with library size, runs for off-screen
   cards too. Candidate: only animate cards currently on screen
   (IntersectionObserver adds/removes `.cycle`), or drop on phones.
3. **Cover art pan** (`ap-pan-x/y`, 18 s) and **cassette label pan** (48 s):
   same idea, pause when the view is covered.
4. **Marquee** (`marquee-scroll`): keep, but it is per title; make sure only
   visible rows animate (already partly done by `mqVisible`).

## The embedded player (likely the biggest single cost)

- No place in the source sets a playback quality or limits video decode. With
  YouTube, a phone with the screen on and the video hidden or tiny may still be
  decoding 720p+ video. Candidate: request the lowest video quality when the
  video is not shown (art mode), and while the screen is off. Needs a test on a
  real phone: YouTube may ignore the request.
- Two decks are kept loaded (active plus standby) for gapless handoff, and
  SoundCloud pooling is deliberately off for coarse pointers already. Check
  whether the standby deck should be built later (last ~20 s of the song) on
  phones. Memory plus decode cost; trade-off is gapless transitions.

## Other candidates

- `will-change` appears 22 times; confirm none sit on resting elements.
- Visualizer is already throttled (30 fps phones, 10 fps paused, idle when off
  screen). Candidate: 20 fps on phones, or off entirely when Battery Saver is on.
- Cassette, record and cassette-stack rAF loops were not profiled (slice 2 note).
- Respect `prefers-reduced-motion` and, where available, the Battery Status API
  or the Android native side: one "low power mode" switch (auto when battery < 20%
  or OS Battery Saver) that disables ambient drift, card cycling, visualizer and
  sets video quality to lowest. One switch is easier to explain than six toggles.
- The "still in the top bar after closing" part of #635 was fixed on Android in
  2.11.1 (onTaskRemoved). Not re-verified here.

## Proposed order

1. **Measure on the owner's phone (TECNO POP 9, a low-end device, so a good
   worst case).** Android Settings > Battery > EBBLESS usage, plus
   `chrome://inspect` remote profiling of the WebView: record 60 s paused, 60 s
   playing with screen on, 60 s playing screen off. This tells us whether the
   cost is page JS (our timers/animations) or the embedded player (not ours to
   fix, only to feed less video).
2. Quick wins, low risk: `npSyncPill`, `persistResume`, panel idle closer start
   only when needed; merge `playLogTick`/`statsTick` into the seek tick.
3. Pause ambient drift, card cycling and art pans when paused/covered/off screen.
4. Lowest video quality when video is not visible.
5. Low power mode switch (auto) tying 3 and 4 and the visualizer together.

## Measured on the TECNO (2026-10-30, adb + Chrome DevTools over USB)

One phone, one song, a few minutes per state, 8 cores = 800%. Profiling and
tracing add overhead, so read ratios, not absolutes.

| State | WebView renderer | App process | Total |
|---|---|---|---|
| Playing, screen on | 182% | 141% | about 320% |
| **Paused**, screen on | 166% | 137% | about 300% |
| Playing, **screen off** | 132% | 29% | about 160% |

1. **Paused costs as much as playing.** So the cost is the UI drawing and not
   the audio. Screen off roughly halves it, but the renderer still burns
   1.3 cores with the screen off. That is the battery problem.
2. **The page's main thread is about 50% blocked.** A PerformanceObserver saw a
   200 to 450 ms long task about once a second, for 45 s straight, plus one
   7.8 s freeze. A 6 s trace shows the main thread busy almost the whole time:
   render pipeline 3.25 s (style recalc 1.3, paint 1.15, layerize 0.95),
   timers 0.97 s. Page JavaScript itself is small (about 2.6 s per 8 s).
3. **`refreshNowPlaying` rebuilds the whole library while the library is
   hidden.** In a 10 s profile, 4.9 s was `refreshNowPlaying` calling
   `renderLibrary` (449 playlists, 275 cards, about 9,700 DOM nodes in a
   `display:none` view). It runs on the 15 s poll whenever the On Air feed
   changes, even for someone who never tuned in. This is the 7.8 s freeze.
4. **JS-driven style writes at about 21 Hz** on `.record-disc`, `#hubL`,
   `#hubR`, `#csTapeSheen` (cassette art mode), plus about 3 Hz on the seek
   fills, knobs and reel paths. Five CSS animations were running: `cymPh` x3,
   ambient drift, `viz-icon-spin`.
5. Only 1,303 of 12,121 DOM nodes are rendered, so DOM size is not the issue.
6. **Single toggles did not help.** Hiding iframes, ambient layers, canvases,
   the cassette, the record, or the whole player stage each left the main
   thread about 4.4 to 5 s blocked per 10 s. Do not expect one magic fix.
7. `/nowplaying` was fetched only 3 times in 45 s, as designed.

Open question the data did not answer: what the renderer is doing at 132% with
the screen off (page JS in the hidden page, or the YouTube iframe). A trace
with the screen off is the next measurement. Battery drain itself was not
measured: the phone was charging.

### Second trace pass (same day, real song playing, phone on charger)

- A first set of "playing" numbers was partly taken while the app showed
  "Nothing playing yet" with the DVD-logo bounce running (7 animated elements).
  Re-measured with a real song and the DVD hidden: renderer 179% + app 142%,
  main thread 5 to 6.3 s blocked per 10 s. Same picture.
- Style invalidations in the clean state come from CSS animations (`cym-ph`
  in the top-bar icon, `viz-icon-spin`, ambient canvas drift) and the seek bar
  writes. Pausing all of them cut blocking only about 10 to 15% (5.0 s to 4.3
  to 4.6 s), so they are not the main cost.
- **RETRACTED: "three YouTube iframes cause the cost".** The first test
  (blank two of three iframes: 4.66 s to 0.97 s blocked) was invalid: the
  iframes I blanked included the one that was playing, so the app went quiet.
  Redone with the playing deck left alone: baseline 5.4 and 4.7 s, blank the
  paused deck a only 3.9 s, blank a and c 5.0 s (noise range about 4 to 6 s).
  Blanking everything made it worse (8.8 s), probably the app's repair logic
  reacting to dead players. Idle-deck removal is not a proven win.
- State of the decks while a song plays (read from inside the YouTube frames):
  the playing deck is playing and unmuted; the other two are **already paused**
  (one paused mid-song at 194 s, one paused at 0:01, muted, 192 px wide). So
  "pause the standby once the song is confirmed" already exists
  (`index.html` around line 24109). The `controls=0` idea is untested and
  could touch the YouTube ad UI that ad-skipping relies on.
- A page reload undid the experiment.

### Per-frame trace (8 s, real song playing, main thread busy 7.9 s)

Attribution by frame (tracing inflates absolute numbers; read the shares):

| Cost | ms of 7.9 s | Share |
|---|---|---|
| EBBLESS style recalc (`UpdateLayoutTree`) | 1850 | 23% |
| **Accessibility tree updates (`RunAccessibilitySteps`)** | 1590 | 20% |
| YouTube frames' JS (player base.js 895, ytembeds 511) | 1400 | 18% |
| EBBLESS JS (`FunctionCall`) | 830 | 10% |
| EBBLESS timers (inside the JS above) | 690 | |
| EBBLESS pre-paint, animation frames, layout, layerize | about 600 | 8% |

Two of the three YouTube frames each fire about 0.7 s of timers per 8 s while
one is paused, so idle YouTube pages are not free, but blanking them did not
move the total (see the retraction above).

**Accessibility service on the test phone.** The TECNO has a third-party
accessibility service enabled (`com.brainrot.android` ReelsAccessibilityService,
"BrainPal", listening to window content changes and scrolls). With any
accessibility service on, Android WebView builds and updates the accessibility
tree on every DOM change, which is the `RunAccessibilitySteps` cost above. This
is specific to the phone, not to EBBLESS, but it makes every DOM or style write
in the app more expensive on this device, and the owner's complaint comes from
this device. **Not yet tested:** turn that service off and re-run the 10 s
long-task measurement. (Changing the setting is the phone owner's to do.)

### After BrainPal was removed (inconclusive)

Accessibility services list is now empty, but the first re-measure still showed
`RunAccessibilitySteps` at about 2 s per 8 s and about 4.8 to 5.0 s blocked per
10 s, because the WebView renderer process predated the removal (Chromium keeps
accessibility mode until the process restarts). The app was force-stopped and
relaunched (new renderer pid 23414) to redo it, but the owner had to leave
before the re-measure ran. **Next time:** start a song, wait about 40 s, then
run the 10 s long-task measurement twice and the per-frame trace; compare
`RunAccessibilitySteps` (was 1.6 to 2.0 s) and blocked time (was 4.7 to 5.4 s).
Also note: a measurement taken on the splash screen or during a track change
is not comparable.

### Revised order

0. Test with the accessibility service off. If it drops a lot, the lever in
   our code is writing less to the DOM per second (cassette/record 21 Hz style
   writes, seek fills, marquee), because each write is paid for twice.
   Idle YouTube decks are not proven to matter; leave the deck design alone.
1. (Done in this lane, commit 784be7a, not deployed) skip `renderLibrary` when the library view is hidden; mark it dirty and
   render when opened (fixes the multi-second freeze, safe, small).
2. Find what keeps the render pipeline busy at about 1 Hz with 200 to 450 ms
   per cycle: trace the style recalcs (`UpdateLayoutTree` stack traces), then
   fix the 21 Hz style writers (cassette/record) and the always-on animations.
3. Trace the screen-off renderer.
4. Then the timer clean-ups and low power mode from above.

## Not verified

No profile was taken. Every "cost" above is inferred from the source, not
measured. Timers listed as "no hidden guard" may be throttled by the WebView
when the page is hidden; whether a playing page is throttled depends on the
WebView, which is exactly what step 1 settles.
