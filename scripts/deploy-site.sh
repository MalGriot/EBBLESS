#!/usr/bin/env bash
# Publish the static site as the Workers static-assets project "ebbless-site"
# (ebbless.space). GitHub Pages keeps serving malgriot.github.io/EBBLESS.
# Only git-tracked web files are staged, never docs or source notes.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
mkdir "$OUT/site"
git ls-files -z -- index.html sw.js manifest.json privacy.html terms.html \
  genre-artists.json house-vibes.json brand beta welcome lang sfx adblock \
  visuals sample data move desktop/signin.html | grep -zv '\.md$' \
  | xargs -0 -I{} sh -c 'mkdir -p "$1/site/$(dirname "$2")" && cp "$2" "$1/site/$2"' _ "$OUT" {}
printf '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n' > "$OUT/site/_headers"
cat > "$OUT/wrangler.jsonc" <<'JSON'
{ "name": "ebbless-site", "compatibility_date": "2026-11-01",
  "assets": { "directory": "./site", "html_handling": "auto-trailing-slash", "not_found_handling": "404-page" } }
JSON
echo "Staged $(find "$OUT/site" -type f | wc -l | tr -d ' ') files"
cd "$ROOT/worker" && npx wrangler deploy --config "$OUT/wrangler.jsonc"
