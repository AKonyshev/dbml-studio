#!/usr/bin/env bash
# Copies the built plugin into a vault. The vault's `.obsidian/` is ignored by
# git, so the plugin is installed rather than committed — the same arrangement
# the extension has with `.vsix`.
#
# Installs what the Community plugins directory installs — main.js,
# manifest.json, styles.css — and removes the vault's frame/, so the plugin
# unpacks the frame its main.js carries on the next start, as it does for a
# reader. A build from a dirty tree keeps the BUILD id of the one before it, so
# a frame left in place could otherwise outlive the code it belongs to.
set -euo pipefail

VAULT="${1:-${OBSIDIAN_VAULT:-}}"

if [ -z "$VAULT" ]; then
  echo "usage: install-obsidian-plugin.sh <vault path>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/packages/obsidian-plugin"
DEST="$VAULT/.obsidian/plugins/dbml-studio"

# main.js is built only with the frame inside it (scripts/build-plugin.mjs
# refuses otherwise), so it alone says the plugin is built.
if [ ! -f "$SRC/main.js" ]; then
  echo "install-obsidian-plugin: not built: packages/obsidian-plugin/main.js" >&2
  echo "run \`yarn build:web\`, then \`yarn build:obsidian\`, then install again" >&2
  exit 1
fi

mkdir -p "$DEST"
cp "$ROOT/manifest.json" "$SRC/main.js" "$SRC/styles.css" "$DEST/"
rm -rf "$DEST/frame"

echo "installed to $DEST"
