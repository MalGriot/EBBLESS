#!/usr/bin/env bash
# Fails if sw.js CACHE_VERSION is newer than the top WHATS_NEW entry in
# index.html AND the staged change bumps it without touching WHATS_NEW.
# Bump with no user-facing change? Set SKIP_WHATS_NEW=1 for that commit.
set -e
cd "$(git rev-parse --show-toplevel)"
[ -n "$SKIP_WHATS_NEW" ] && exit 0
git diff --cached --name-only | grep -qx sw.js || exit 0
git diff --cached -U0 sw.js | grep -q '^+const CACHE_VERSION' || exit 0
if git diff --cached -U0 index.html | grep -q "^+  { version: [0-9]*, date:"; then exit 0; fi
echo "sw.js CACHE_VERSION bumped but no new WHATS_NEW entry staged in index.html." >&2
echo "Add a plain-English entry at the top of WHATS_NEW, or commit with SKIP_WHATS_NEW=1 if nothing user-facing changed." >&2
exit 1
