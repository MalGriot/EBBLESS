# Mobile CPU and battery audit (Geethub #635, third slice)

Static audit of `index.html` plus the earlier slices recorded in IMPROVEMENTS.md
(`mobile-moves-really-slow-and-slows-down-th`). **Nothing here was measured on
a phone.** Numbers below are counts from the source, not profiles. Step 1 of
the plan is to get real numbers.

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

## Not verified

No profile was taken. Every "cost" above is inferred from the source, not
measured. Timers listed as "no hidden guard" may be throttled by the WebView
when the page is hidden; whether a playing page is throttled depends on the
WebView, which is exactly what step 1 settles.
