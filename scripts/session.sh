#!/usr/bin/env bash
# Coordinates multiple Claude Code sessions working this repo at once.
# Each session gets its own git worktree (own directory, own branch) so
# two sessions can never share a working copy of index.html. AGENTS.md is
# always read/written in the MAIN checkout, no matter which worktree calls
# this script, so it works as one live ledger instead of N divergent copies.
set -euo pipefail

main_root="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
ledger="$main_root/AGENTS.md"
wt_dir="$(dirname "$main_root")/ebbless-worktrees"

usage() {
  cat <<EOF
Usage:
  $(basename "$0") start <slug> "<scope description>"   claim a lane, create a worktree
  $(basename "$0") done <slug>                           release the lane, remove the worktree
  $(basename "$0") status                                show active lanes
EOF
}

cmd="${1:-}"
case "$cmd" in
  start)
    slug="${2:?slug required}"
    scope="${3:?scope description required, e.g. the part of the app you are touching}"
    branch="agent/$slug"
    path="$wt_dir/$slug"

    if [ -f "$ledger" ] && grep -q "^| $slug |" "$ledger" 2>/dev/null; then
      self="$(basename "$0")"
      echo "Lane '$slug' is already claimed in AGENTS.md. Pick a different slug, or run '$self done $slug' first if it's stale." >&2
      exit 1
    fi

    mkdir -p "$wt_dir"
    git -C "$main_root" worktree add -b "$branch" "$path" main
    touch "$ledger"
    printf '| %s | %s | %s | %s | active | %s |\n' \
      "$slug" "$branch" "$path" "$scope" "$(date '+%Y-%m-%d %H:%M')" >> "$ledger"

    echo ""
    echo "Worktree ready. In the new session, run:"
    echo "  cd $path"
    ;;
  done)
    slug="${2:?slug required}"
    branch="agent/$slug"
    path="$wt_dir/$slug"

    git -C "$main_root" worktree remove "$path" --force 2>/dev/null || \
      echo "(worktree dir already gone, skipping)" >&2

    if [ -f "$ledger" ]; then
      grep -v "^| $slug |" "$ledger" > "$ledger.tmp" 2>/dev/null || true
      mv "$ledger.tmp" "$ledger"
    fi

    echo "Lane '$slug' released. Branch '$branch' is left in place for you to merge/PR."
    echo "Once merged, delete it with:"
    echo "  git -C \"$main_root\" branch -d $branch"
    ;;
  status)
    if [ -s "$ledger" ]; then
      cat "$ledger"
    else
      echo "No active sessions."
    fi
    ;;
  *)
    usage
    exit 1
    ;;
esac
