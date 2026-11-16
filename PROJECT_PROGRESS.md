# Progress log

Baseline: main @ 08d49e2, tree clean, scripts/check.sh passes.

## Done (committed on agent/backlog-phase1, NOT deployed, NOT merged to main)
- #846 prev-song: skip wait cap 25s -> 8s; incoming song seeks to 0 when the fade starts. Unverified live (needs real playback soak).
- #830 fLUX: no automatic song title card (C key still shows it).

## Findings
- #831 melt-in: milkLayer already fades opacity 1.6s over the page; ticket may mean over the *art style* in the inline box. Needs a live look before changing.

## Next action
#838 / #809: openMilk (index.html ~34490) and the 1-5 key handler (~38743): make activating fLUX close other modes (video, cymatics, fullscreen) and fade in; then #861, #855.
Then rest of Phase 1 (#836 #822 #827 #826 #824, #853 #837 #845, #872 #865 #866 #867 #863).
