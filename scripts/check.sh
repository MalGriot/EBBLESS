#!/usr/bin/env bash
# Single pre-commit entry point. Run manually any time: scripts/check.sh
set -e
cd "$(git rev-parse --show-toplevel)"
scripts/check-whats-new.sh
node scripts/check-html.js
node scripts/check-security.js
node tools/genre-map-layout.js --check >/dev/null
if git diff --cached --name-only | grep -q '^worker/'; then (cd worker && npm test --silent); fi
node scripts/test-manual-carry.js >/dev/null
