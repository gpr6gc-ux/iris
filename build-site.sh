#!/usr/bin/env bash
# Assemble the deployable web root into dist/ — ONLY the files the browser needs.
# Everything else in this repo (supabase/, sidecar/, investing/, docs/, tests/, workflows/, *.md) is source and
# must never be served from the public web. netlify.toml sets publish = "dist" and runs this as the build command,
# so a git-linked deploy is as safe as a CLI upload (.netlifyignore is NOT honored by Netlify's build system —
# this script is the mechanism that actually keeps backend source off the site).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DIST="$HERE/dist"
rm -rf "$DIST"
mkdir -p "$DIST"
# The complete set of web assets, matching index.html's references:
cp "$HERE/index.html" "$DIST/"
cp "$HERE/styles.css" "$DIST/"
cp -r "$HERE/js" "$DIST/js"
cp -r "$HERE/design" "$DIST/design"
# Guard: nothing that looks like backend source may have leaked into dist.
if find "$DIST" -type f \( -name '*.sql' -o -name '*.md' -o -name '*.ndjson' \) | grep -q .; then
  echo "build-site: refusing to publish — backend/source files found in dist:" >&2
  find "$DIST" -type f \( -name '*.sql' -o -name '*.md' -o -name '*.ndjson' \) >&2
  exit 1
fi
echo "build-site: published $(find "$DIST" -type f | wc -l) web files to dist/"
