# Progress log

Baseline: main @ 08d49e2, tree clean, scripts/check.sh passes.

## Done (committed on agent/backlog-phase1, NOT deployed, NOT merged to main)
- #846 prev-song: skip wait cap 25s -> 8s; incoming song seeks to 0 when the fade starts. Unverified live (needs real playback soak).
- #830 fLUX: no automatic song title card (C key still shows it).
- #838/#809 fLUX: openMilk closes video card, cymatics, lyrics first (index.html ~34490). Unverified live. The art-style cycling part of #838 (fLUX behind art/CD/cassette/LP on key 1) is NOT done.

## Findings
- #831 melt-in: milkLayer already fades opacity 1.6s over the page; ticket may mean over the *art style* in the inline box. Needs a live look before changing.

## Next action
#838 remainder: key 1 / art button cycling with fLUX as backdrop; fullscreen equivalent. Then #861, #855, #831.
Then rest of Phase 1 (#836 #822 #827 #826 #824, #853 #837 #845, #872 #865 #866 #867 #863).

## QA status
All three fixes above: UNVERIFIED. Rule 3 live check is the next action, before any new ticket.
Smoke tests run: none yet.
