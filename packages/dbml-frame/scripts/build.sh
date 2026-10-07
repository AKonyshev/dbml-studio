#!/usr/bin/env bash
# Builds what dbml-frame ships out of packages/web: the embed frame, selected
# from packages/web/dist by the MkDocs plugin's vendor script (the rule every
# host's copy of the frame follows), with the walked part of the manifest; and
# frameHost.ts compiled. Build the site first: yarn build:web.
set -euo pipefail

PACKAGE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PACKAGE"

rm -rf protocol frame BUILD
npx tsc -p tsconfig.protocol.json

# vendor.mjs empties its --out first, so it never writes into the package
# itself — that would delete the package's own sources.
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
node ../mkdocs-dbml/scripts/vendor.mjs --out "$STAGE/out" --frame-only
mv "$STAGE/out/frame" "$PACKAGE/frame"
mv "$STAGE/out/BUILD" "$PACKAGE/BUILD"
