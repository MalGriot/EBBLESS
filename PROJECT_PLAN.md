# EBBLESS backlog project plan

Master plan: phases 0-8 as given in the autonomous-development brief (2026-11-16).
Order: P1 playback/fLUX/queue/library bugs, P2 ready queue (#746 #781 #870 #805),
P3 core UX, P4 cassette/DJ markers, P5 sharing, P6 radio/map, P7 videos, P8 regression.
Deferred by decision: #864 (no paste fields).

Working lane: worktree ../ebbless-worktrees/backlog-phase1, branch agent/backlog-phase1
(other lanes active in AGENTS.md: player-look, platform-release, iphone-scope-note, station-page).
Checks: scripts/check.sh (pre-commit). No headless playback test exists; YouTube playback
fixes can only be verified in a live browser/soak, so they are marked "unverified live".
