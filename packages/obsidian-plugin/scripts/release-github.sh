#!/usr/bin/env bash
# Releases the Obsidian plugin on GitHub: the tag Obsidian's Community plugins
# directory reads, and the release carrying the files Obsidian installs.
#
#   yarn workspace obsidian-plugin release:github 0.2.0            tag, push, release
#   yarn workspace obsidian-plugin release:github 0.2.0 --check    everything but those
#
# Run on main once the release commit is merged (docs/releasing.md, "The
# Obsidian plugin"). The tag is the bare version, as the directory requires,
# on HEAD, which has to be origin/main. Attached: main.js, manifest.json and
# styles.css, which Obsidian installs, and the zip for installing by hand. The
# release is not marked latest: "latest" on the repository is the extension's.
#
# A pushed tag is public at once and the directory serves the release from it,
# so the script asks for the version to be typed back first. --check stops
# after the build and its checks.
set -euo pipefail

REPO="AKonyshev/dbml-studio"
PACKAGE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$PACKAGE/../.." && pwd)"

usage() {
  echo "usage: yarn workspace obsidian-plugin release:github <x.y.z> [--check]" >&2
  exit 2
}

VERSION=""
CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    -h | --help)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "unknown option: $arg" >&2
      usage
      ;;
    *)
      if [ -n "$VERSION" ]; then
        echo "one version, not two: $VERSION and $arg" >&2
        usage
      fi
      VERSION="$arg"
      ;;
  esac
done

if [ -z "$VERSION" ]; then
  usage
fi
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "the version is x.y.z, exactly the tag the directory reads: not $VERSION" >&2
  exit 2
fi

fail() {
  echo "$1" >&2
  exit 1
}

cd "$ROOT"

# The tree the tag will name, exactly: main, nothing uncommitted, nothing
# unpushed and nothing unpulled.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  fail "release from main, not from $BRANCH"
fi
DIRTY="$(git status --porcelain)"
if [ -n "$DIRTY" ]; then
  fail "the tree has changes; commit or remove them first:
$DIRTY"
fi
git fetch --quiet origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  fail "main is not origin/main; pull or push until they are the same commit"
fi

# The directory reads the root manifest.json from the default branch and
# picks a release for an Obsidian version from versions.json beside it.
MANIFEST_VERSION="$(node -p "require('./manifest.json').version")"
MIN_APP="$(node -p "require('./manifest.json').minAppVersion")"
if [ "$MANIFEST_VERSION" != "$VERSION" ]; then
  fail "manifest.json is at $MANIFEST_VERSION, not $VERSION; the release commit changes it first"
fi
LISTED="$(node -p "require('./versions.json')['$VERSION'] ?? ''")"
if [ -z "$LISTED" ]; then
  fail "versions.json has no $VERSION; add \"$VERSION\": \"$MIN_APP\""
fi
if [ "$LISTED" != "$MIN_APP" ]; then
  fail "versions.json says $VERSION needs $LISTED, manifest.json says $MIN_APP"
fi

# The release notes: the version's section of the changelog, without its
# heading.
NOTES="$(awk -v v="$VERSION" '
  index($0, "## [" v "]") == 1 { on = 1; next }
  on && /^## \[/ { exit }
  on { print }
' packages/obsidian-plugin/CHANGELOG.md)"
if [ -z "$(printf '%s' "$NOTES" | tr -d '[:space:]')" ]; then
  fail "packages/obsidian-plugin/CHANGELOG.md has no entry for $VERSION"
fi

if git rev-parse --quiet --verify "refs/tags/$VERSION" > /dev/null; then
  fail "the tag $VERSION already exists here"
fi
if [ -n "$(git ls-remote --tags origin "refs/tags/$VERSION")" ]; then
  fail "the tag $VERSION already exists on origin"
fi
if [ "$CHECK_ONLY" -eq 0 ] && ! command -v gh > /dev/null; then
  fail "the GitHub CLI (gh) is needed to create the release"
fi

# From scratch: the site, then the plugin — the frame vendored from the
# site's build and packed into main.js — then the zip.
yarn build:web
yarn package:obsidian

MAIN_JS="$PACKAGE/main.js"
ZIP="$ROOT/dist/dbml-studio-obsidian-$VERSION.zip"

# What a reader installs is main.js alone, so it has to carry the frame. The
# BUILD of the frame just vendored, as a string, is the proof it is this one;
# and a main.js under 1 MB cannot hold an 11.6 MB frame, however well it packs.
node -e '
  const fs = require("fs");
  const [mainJs, buildFile] = process.argv.slice(1);
  const build = fs.readFileSync(buildFile, "utf8");
  const code = fs.readFileSync(mainJs, "utf8");
  if (!code.includes(JSON.stringify(build))) {
    console.error(`main.js does not carry the frame of build ${build.trim()}`);
    process.exit(1);
  }
  if (code.length < 1000000) {
    console.error(`main.js is ${code.length} bytes, too small to carry the frame`);
    process.exit(1);
  }
  console.log(`main.js carries frame ${build.trim()} (${code.length} bytes)`);
' "$MAIN_JS" "$PACKAGE/frame/BUILD"

if ! unzip -l "$ZIP" | grep -q "dbml-studio/main.js"; then
  fail "$ZIP does not hold dbml-studio/main.js"
fi

if [ "$CHECK_ONLY" -eq 1 ]; then
  echo "$VERSION is ready to release; nothing tagged or released (--check)"
  exit 0
fi

printf 'Tag %s on %s, push it and release it on GitHub? The tag is public at once. Type the version to confirm: ' \
  "$VERSION" "$(git rev-parse --short HEAD)"
read -r answer
if [ "$answer" != "$VERSION" ]; then
  echo "not released"
  exit 1
fi

git tag -a "$VERSION" -m "DBML Studio for Obsidian $VERSION"
git push origin "refs/tags/$VERSION"

NOTES_FILE="$(mktemp)"
trap 'rm -f "$NOTES_FILE"' EXIT
printf '%s\n' "$NOTES" > "$NOTES_FILE"

# The tag is pushed by now, so a rerun refuses it. Should the release fail,
# say how to finish it by hand from the files the build left in place, rather
# than leave a tag the directory finds no assets under.
if ! gh release create "$VERSION" \
  --repo "$REPO" \
  --verify-tag \
  --latest=false \
  --title "DBML Studio for Obsidian $VERSION" \
  --notes-file "$NOTES_FILE" \
  "$MAIN_JS" "$ROOT/manifest.json" "$PACKAGE/styles.css" "$ZIP"; then
  fail "the tag $VERSION is pushed, but the release was not created. Finish it from the repository root:
  gh release create $VERSION --repo $REPO --verify-tag --latest=false \\
    --title \"DBML Studio for Obsidian $VERSION\" \\
    --notes-file <the $VERSION section of packages/obsidian-plugin/CHANGELOG.md> \\
    packages/obsidian-plugin/main.js manifest.json packages/obsidian-plugin/styles.css \\
    dist/dbml-studio-obsidian-$VERSION.zip"
fi

echo "released: https://github.com/$REPO/releases/tag/$VERSION"
