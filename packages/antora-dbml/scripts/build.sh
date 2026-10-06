#!/usr/bin/env bash
# Compiles src/ to lib/ and vendors the frame, the host script and the
# validator from packages/web/dist into vendor/. Build the site first:
# yarn build:web. The vendoring rule is the MkDocs plugin's, by the same
# script, so the two packages can never ship different frames from one build.
set -euo pipefail

PACKAGE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PACKAGE"

rm -rf lib
npx tsc -p tsconfig.build.json
node ../mkdocs-dbml/scripts/vendor.mjs --out "$PACKAGE/vendor"
