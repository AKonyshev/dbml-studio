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

# Both halves or nothing. `build:plugin` alone, or a vendor step that failed,
# leaves main.js without the frame it loads, and a plugin installed like that
# turns on and then draws an empty box for every diagram in the vault.
missing=()
for file in main.js frame/embed.html; do
  if [ ! -f "$SRC/$file" ]; then
    missing+=("packages/obsidian-plugin/$file")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "install-obsidian-plugin: not built: ${missing[*]}" >&2
  echo "run \`yarn build:web\`, then \`yarn build:obsidian\`, then install again" >&2
  exit 1
fi

mkdir -p "$DEST"
cp "$SRC/manifest.json" "$SRC/main.js" "$DEST/"

# `if`, not `[ -f x ] && cp`: under `set -e` a failed `&&` list ends the script,
# and there is no stylesheet until the plugin draws diagrams.
if [ -f "$SRC/styles.css" ]; then
  cp "$SRC/styles.css" "$DEST/"
fi

rm -rf "$DEST/frame"
cp -R "$SRC/frame" "$DEST/frame"

echo "installed to $DEST"
