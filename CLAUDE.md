# EBBLESS

Single-file app: almost everything lives in `index.html`. See [README.md](README.md)
for what the app does and how the pieces fit together.

## Multiple Claude Code sessions on this repo

If more than one Claude Code session (terminal tab, window, whatever) is going
to work in this repo at the same time, do not let them share a working
directory. `index.html` is one large file - two sessions editing it in the
same checkout will overwrite each other's uncommitted work, not just conflict
on merge.

**Before starting work, always check for other active sessions first - do not
rely on `AGENTS.md` alone, since it only shows sessions that opted into the
lane system.** A session that never ran `scripts/session.sh start` (including
every session running before this protocol existed) is invisible to the
ledger but just as capable of clobbering your work. Check both:

```bash
scripts/session.sh status
ps aux | grep -c '[c]laude.*EBBLESS'
```

If the process count is more than one (this session included) and you are
about to work directly in the main checkout (not already inside a worktree
under `../ebbless-worktrees/`), assume collision risk is real even if
`AGENTS.md` is empty. Don't uproot an edit that's already in flight - finish
the atomic change you're on, commit it, and push promptly - but claim a lane
for anything further:

```bash
scripts/session.sh start <slug> "<what you're doing>"
```

This creates an isolated git worktree at `../ebbless-worktrees/<slug>` on a
new branch `agent/<slug>`, and adds a row to `AGENTS.md` so any other session
that checks knows this lane is taken and what it covers. `cd` into that path
and work there for the rest of the session.

When the work is done and merged (or abandoned):

```bash
scripts/session.sh done <slug>
```

This removes the worktree and clears the ledger row. It does not delete the
branch - merge or open a PR first, then delete it yourself.

Rules of the road:

- Pick a `<slug>` and scope description specific enough that another session
  reading `AGENTS.md` can tell whether your work overlaps theirs (e.g.
  `intro-outro` / "polishing intro narration timing", not `stuff`).
- Before claiming a lane, skim the `scope` column of other active rows. If
  your task clearly overlaps one (same UI section, same function), don't
  start in parallel - wait, or coordinate with whoever's running that
  session.
- Because `index.html` is one file, even non-overlapping lanes can produce a
  text conflict on merge if they land near each other. Merge each lane back
  to `main` as soon as it's done rather than letting several sit for a long
  time - small, frequent merges beat one large reconciliation.
- `AGENTS.md` is local, gitignored coordination state, not project history.
  It always resolves to the copy in the main checkout (not the worktree), so
  every session sees the same live ledger regardless of where it's running
  from.
- A single-session task (no other Claude Code session active) doesn't need
  any of this - work directly in the main checkout as usual.
- If you discover mid-session that you're already sharing the main checkout
  with another active session (uncommitted changes appear/vanish that you
  didn't make, a commit or reset shows up in `git reflog` that you didn't
  run), stop and tell the user directly rather than guessing at whose work is
  whose. Don't commit, stash, `reset`, or `checkout --` over a file another
  live session may be mid-edit on - even "protecting" it that way can look
  to that session like its own change disappeared. Surface what you found
  and let the user decide.

## GPU budget (see #487)

Rapid blinking of the background and menus (#487) came from GPU memory
running out: big blurred layers, videos, and infinite animations kept running
while hidden, piling up feature by feature. No single change looked wrong.
Every visual change must follow these rules:

- **Hidden means stopped.** Anything not on screen must not animate or play:
  pause its animations (`animation-play-state:paused`), pause its videos, or
  take it out of rendering (`display:none`, or `visibility:hidden` after a
  fade). `opacity:0` alone does NOT stop the work - the layer still composites.
- **Covered means stopped.** If a full-screen view covers something (e.g.
  `#flow-layer` over `#ambient`), pause what's underneath while it's open.
- **Animate only `transform` and `opacity`.** Never put `filter`, `blur`,
  `backdrop-filter`, `box-shadow`, or size/position properties in keyframes or
  long-running transitions; set them once, statically.
- **`will-change` only on what is animating right now** (e.g. the
  `.is-active` layer), never on a whole set of layers, and never "just in case".
- **No `backdrop-filter` over anything that moves.** A blurred-glass button or
  panel above an animating layer (the drifting ambient, video, visualizer)
  re-blurs every frame; in fullscreen this flickered and garbled controls on
  Mac Chrome (#487). Use a solid/semi-opaque fill there instead.
- **Large blurred/filtered layers are expensive.** A new full-screen blur,
  video, canvas, or backdrop effect needs a pause-when-hidden path in the same
  commit. Prefer reusing an existing layer over adding another.
- **rAF loops must idle.** Stop requesting frames when nothing changes
  (see the custom cursor, which only runs while the pointer moves).

On localhost the app runs a dev-only GPU watchdog that logs
`[gpu-watchdog]` console warnings for hidden infinite animations, hidden
playing videos, too many large blurred layers at once, and `backdrop-filter`
over moving content. When verifying a
visual change, check the console for these and fix any you introduced.

## Commit protocol (so it doesn't break later)

The pre-commit hook runs `scripts/check.sh`. Run it yourself any time.

- **What it checks:** WHATS_NEW entry with every `sw.js` cache bump,
  every inline `<script>` in `index.html` parses (one syntax error blanks the
  whole app), no NEW `@keyframes` animating anything but transform/opacity,
  `scripts/check-security.js` (hard-coded secrets, eval, unsafe `_blank`,
  plain http), and `worker` tests when `worker/` is staged.
- **Grandfathered keyframes** live in `scripts/check-html.baseline.json`.
  Fix one and run `node scripts/check-html.js --write-baseline` to shrink the
  list. Never add to it to get a commit through; fix the animation instead.
- **Security review:** for changes touching the worker, sessions/tokens, user
  data, or `innerHTML` with external text, walk `docs/SECURITY-REVIEW.md`.
  New hits in `scripts/check-security.baseline.json` are never the fix.
- **Maintenance:** `docs/MAINTENANCE.md` has the habits (public routes never
  renamed, pinned dependencies, deletion test, cost notes). Dependencies in
  `worker/` and `desktop/` must be exact versions; the security grep enforces it.
- **Fresh clone:** the hook is not in git. Install it with
  `printf '#!/usr/bin/env bash\nexec "$(git rev-parse --show-toplevel)/scripts/check.sh"\n' > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`
- **Cleanup rules:** no mass refactors of `index.html` while other lanes are
  active (see `AGENTS.md`). Cleanup is small, per-area, behavior-preserving,
  and merged right away. Commented-out code and dead helpers get removed in
  the lane that touches that area.

## gstack (REQUIRED — global install)

**Before doing ANY work, verify gstack is installed:**

```bash
_GS=""
for _D in "${GSTACK_ROOT:-}" "$HOME/.claude/skills/gstack" "$HOME/.codex/skills/gstack" "$HOME/.factory/skills/gstack" "$HOME/.kiro/skills/gstack" "$HOME/.config/opencode/skills/gstack" "$HOME/.slate/skills/gstack" "$HOME/.cursor/skills/gstack" "$HOME/.openclaw/skills/gstack" "$HOME/.hermes/skills/gstack" "$HOME/.gbrain/skills/gstack" "$HOME/.copilot/skills/gstack" "$HOME/.gemini/antigravity-cli/skills/gstack" "$HOME/.gemini/skills/gstack" "$HOME/.gstack/repos/gstack"; do
  [ -z "$_GS" ] && [ -n "$_D" ] && [ -d "$_D/bin" ] && _GS="$_D"
done
[ -n "$_GS" ] && echo "GSTACK_OK: $_GS" || echo "GSTACK_MISSING"
```

If GSTACK_MISSING: STOP. Do not proceed. Tell the user:

> gstack is required for all AI-assisted work in this repo.
> Install it:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Then restart your AI coding tool.

Do not skip skills, ignore gstack errors, or work around missing gstack.

Using gstack skills: After install, skills like /qa, /ship, /review
and /browse are available. Use /browse for all web browsing (Aside first, the bundled gstack browser as fallback).
Use the resolved install path above for gstack file paths
(default: ~/.claude/skills/gstack).

The Skill gate in .claude/settings.json runs .claude/hooks/check-gstack.cjs with
Node.js and blocks when it cannot run. If a skill is blocked with "node: not
found", tell the user to install Node.js (https://nodejs.org); if it is blocked
with "Cannot find module ... check-gstack.cjs", the hook file is missing from
this checkout. Do not work around either block.
