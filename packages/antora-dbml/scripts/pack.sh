#!/usr/bin/env bash
# Builds the site, then the package, and packs it into the repository's dist/:
#   yarn package:antora
# The tarball is what the GitHub release carries and what publish:npm sends.
set -euo pipefail

PACKAGE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$PACKAGE/../.." && pwd)"

yarn --cwd "$ROOT" build:web
bash "$PACKAGE/scripts/build.sh"
mkdir -p "$ROOT/dist"
TARBALL="$(cd "$PACKAGE" && npm pack --pack-destination "$ROOT/dist" --silent)"

# What a site installs has to carry the frame, the validator and the license.
LISTING="$(tar -tzf "$ROOT/dist/$TARBALL")"
for inside in package/lib/index.js package/vendor/frame/embed.html \
  package/vendor/validate.mjs package/vendor/frame-host.js package/LICENSE; do
  if ! grep -qx "$inside" <<< "$LISTING"; then
    echo "$TARBALL does not carry $inside" >&2
    exit 1
  fi
done
echo "packed: dist/$TARBALL"
