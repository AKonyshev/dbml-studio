#!/usr/bin/env bash
# Builds the bundle and packs it into the repository's dist/:
#   yarn package:mcp
# The tarball is what the GitHub release carries and what publish:npm sends.
set -euo pipefail

PACKAGE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$PACKAGE/../.." && pwd)"

node "$PACKAGE/scripts/build.mjs"
mkdir -p "$ROOT/dist"
TARBALL="$(cd "$PACKAGE" && npm pack --pack-destination "$ROOT/dist" --silent)"

LISTING="$(tar -tzf "$ROOT/dist/$TARBALL")"
for inside in package/dist/server.cjs package/README.md package/LICENSE package/package.json; do
  if ! grep -qx "$inside" <<< "$LISTING"; then
    echo "$TARBALL does not carry $inside" >&2
    exit 1
  fi
done
# It installs nothing: everything is in the bundle.
if tar -xzOf "$ROOT/dist/$TARBALL" package/package.json | node -e "const p=JSON.parse(require('fs').readFileSync(0,'utf8'));process.exit(Object.keys(p.dependencies??{}).length===0?0:1)"; then
  echo "packed: dist/$TARBALL"
else
  echo "$TARBALL declares runtime dependencies; the bundle is meant to have none" >&2
  exit 1
fi
