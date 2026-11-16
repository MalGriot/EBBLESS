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

## QA status (live check, 2026-11-16, localhost worktree, test playlist, in-app browser)
- #838/#809: VERIFIED LIVE. Cymatics -> key 3 and video card -> key 3 both showed fLUX (milk-live) on the first press, with the other tab de-activated. Not covered: art-style cycling, fullscreen.
- #830: VERIFIED LIVE. After 6s of fLUX the title card never got is-on. C key not retested.
- #846: PARTLY VERIFIED. Warm previous: new song shows in 0.5s, starts at 0:00. Cold previous (pressed 2s after next): title switched at once, old song held ~8s (was up to 25s), incoming song's clock reset to 0:00 when the fade began (the seek fix firing). NOT verified: audible audio/volume (no ears in the harness), real ads. Side effect seen: the clock shows 0:00-0:04, then jumps back to 0:00 at fade start.
- Console: no errors from these changes (only the pre-existing 403 and empty accounts list at load).
- Smoke test: partial (play, next, previous, fLUX, cymatics, video card ran; seek, pause, queue, library, reload NOT run).

## Next action
Clock jump on cold previous (cosmetic) -> decide: hold the clock at 0:00 until the fade starts. Then #838 remainder, #861, #855, #831.
