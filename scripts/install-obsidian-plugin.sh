#!/usr/bin/env bash
# Copies the built plugin into a vault. The vault's `.obsidian/` is ignored by
# git, so the plugin is installed rather than committed — the same arrangement
# the extension has with `.vsix`.
set -euo pipefail

VAULT="${1:-${OBSIDIAN_VAULT:-}}"

if [ -z "$VAULT" ]; then
  echo "usage: install-obsidian-plugin.sh <vault path>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/packages/obsidian-plugin"
DEST="$VAULT/.obsidian/plugins/dbml-studio"

mkdir -p "$DEST"
cp "$SRC/manifest.json" "$SRC/main.js" "$DEST/"

# `if`, not `[ -f x ] && cp`: under `set -e` a failed `&&` list ends the script,
# and there is no stylesheet until the plugin draws diagrams.
if [ -f "$SRC/styles.css" ]; then
  cp "$SRC/styles.css" "$DEST/"
fi

if [ -d "$SRC/frame" ]; then
  rm -rf "$DEST/frame"
  cp -R "$SRC/frame" "$DEST/frame"
fi

echo "installed to $DEST"
