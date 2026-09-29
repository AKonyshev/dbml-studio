#!/usr/bin/env bash
# Builds the Obsidian plugin and writes a zip to the root dist/, beside the
# extension's .vsix and the MkDocs plugin's wheel. Inside is one folder,
# dbml-studio/, holding exactly what Obsidian reads from a plugin folder:
# unzipped into <vault>/.obsidian/plugins/ it is installed.
#
# Does not build the site: the plugin's own build copies the frame out of
# packages/web/dist and refuses one that is missing anything. Run
# `yarn build:web` first.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/packages/obsidian-plugin"

yarn workspace obsidian-plugin build

VERSION="$(node -p "require('$SRC/manifest.json').version")"
ARTIFACT="$ROOT/dist/dbml-studio-obsidian-$VERSION.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/dbml-studio" "$ROOT/dist"
cp "$SRC/manifest.json" "$SRC/main.js" "$SRC/styles.css" "$STAGE/dbml-studio/"
cp -R "$SRC/frame" "$STAGE/dbml-studio/frame"

rm -f "$ARTIFACT"
(cd "$STAGE" && zip -r -q "$ARTIFACT" dbml-studio)

echo "wrote $ARTIFACT"
