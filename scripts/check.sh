#!/usr/bin/env bash
# Single pre-commit entry point. Run manually any time: scripts/check.sh
set -e
cd "$(git rev-parse --show-toplevel)"
scripts/check-whats-new.sh
node scripts/check-html.js
if git diff --cached --name-only | grep -q '^worker/'; then (cd worker && npm test --silent); fi
