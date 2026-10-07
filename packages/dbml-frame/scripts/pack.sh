#!/usr/bin/env bash
# Builds the site, then dbml-frame, and packs it into the repository's dist/:
#   yarn package:frame
# The tarball is what the extension's GitHub release v<version> carries and
# what publish:npm sends.
set -euo pipefail

PACKAGE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$PACKAGE/../.." && pwd)"

yarn --cwd "$ROOT" build:web
bash "$PACKAGE/scripts/build.sh"
mkdir -p "$ROOT/dist"
TARBALL="$(cd "$PACKAGE" && npm pack --pack-destination "$ROOT/dist" --silent)"

# A host builds its frame from these; without any one the frame does not draw
# or the host does not compile. Read whole first: grep -q under pipefail.
LISTING="$(tar -tzf "$ROOT/dist/$TARBALL")"
for inside in package/frame/embed.html package/frame/manifest.json \
  package/BUILD package/protocol/frameHost.js package/protocol/frameHost.d.ts \
  package/LICENSE; do
  if ! grep -qx "$inside" <<< "$LISTING"; then
    echo "$TARBALL does not carry $inside" >&2
    exit 1
  fi
done
echo "packed: dist/$TARBALL"
