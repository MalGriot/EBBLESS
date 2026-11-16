# EBBLESS backlog project plan

Master plan: phases 0-8 as given in the autonomous-development brief (2026-11-16).
Order: P1 playback/fLUX/queue/library bugs, P2 ready queue (#746 #781 #870 #805),
P3 core UX, P4 cassette/DJ markers, P5 sharing, P6 radio/map, P7 videos, P8 regression.
Deferred by decision: #864 (no paste fields).

Working lane: worktree ../ebbless-worktrees/backlog-phase1, branch agent/backlog-phase1
(other lanes active in AGENTS.md: player-look, platform-release, iphone-scope-note, station-page).
Checks: scripts/check.sh (pre-commit). No headless playback test exists; YouTube playback
fixes can only be verified in a live browser/soak, so they are marked "unverified live".

## QA and sanity rules (these override "test" in the brief)

What "tested" means, in order. A ticket is only "done" when every row that applies is satisfied.

1. **Static gate (every commit):** `scripts/check.sh` passes. This only proves the file parses and
   no new unsafe keyframes/secrets. It does NOT prove a fix works.
2. **Logic test (when the bug is pure logic):** add a small node test next to the existing ones
   (`scripts/test-home-order.js`, `scripts/test-manual-carry.js` are the pattern; worker has
   `npm test` in `worker/`). Pure-logic fixes get a test in the same commit.
3. **Live browser check (every UI, playback, fade, layout, fLUX, queue, library ticket):**
   serve the worktree on localhost, drive it with /browse (or the in-app browser), then:
   reproduce the original symptom, confirm it is gone, read the console, and check there are no
   new `[gpu-watchdog]` warnings. Capture a screenshot or console excerpt as the proof.
   Playback timing bugs (#846 type) need a real soak: play a track, press previous, time it.
4. **Honest labels:** each ticket in PROJECT_PROGRESS.md is marked `verified live`,
   `verified by test`, or `UNVERIFIED`. UNVERIFIED tickets are never counted in the final
   "Completed" list and block deployment readiness.
5. **No-regression rule:** if a check fails, fix it before the next ticket. Do not stack work on a
   broken base.

### Smoke test (run after every phase and before every merge to main)
Play a track. Press next, then previous (previous must start from 0:00, within a few seconds).
Seek. Pause/resume. Open fLUX (key 3), switch to cymatics (2), lyrics (4), back to art (1).
Open the queue and the library; click a song. Reload the page; confirm it resumes.
Console must show no new errors. Record pass/fail and date in PROJECT_PROGRESS.md.

### Merge cadence
Merge the lane to main after each phase's smoke test passes, not at the end (small merges
avoid conflicts in the shared index.html). Never merge or deploy with an UNVERIFIED ticket in a
user-facing path unless the owner accepts it in writing.

### Phase 8 is a final sweep, not the first test
Regression coverage happens continuously via the rules above. Phase 8 re-runs the full smoke test
plus the areas listed in the brief on desktop and mobile widths.

### Retroactive debt (do first)
#846, #830, #838/#809 are committed but UNVERIFIED. Run rule 3 on each before starting new tickets.
