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
