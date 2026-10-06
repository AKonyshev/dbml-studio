#!/usr/bin/env bash
# Publishes a released antora-dbml tarball to npm.
#
#   yarn workspace antora-dbml publish:npm                  the version in package.json
#   yarn workspace antora-dbml publish:npm 0.2.0
#   yarn workspace antora-dbml publish:npm 0.2.0 --check    everything but the upload
#
# The tarball is the one attached to the GitHub release antora-dbml-v<version>.
# Release first (docs/releasing.md, "antora-dbml"), publish after.
#
# A version published to npm can never be published again, so the script asks
# for the version to be typed back. npm asks to log in (`npm login`) if needed,
# and for a one-time code when the account has two-factor authentication.
set -euo pipefail

REPO="AKonyshev/dbml-studio"
PACKAGE="$(cd "$(dirname "$0")/.." && pwd)"

VERSION=""
CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    -h | --help)
      sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "unknown option: $arg" >&2
      exit 2
      ;;
    *) VERSION="$arg" ;;
  esac
done

if [ -z "$VERSION" ]; then
  VERSION="$(node -p "require('$PACKAGE/package.json').version")"
fi
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "the version is x.y.z: not $VERSION" >&2
  exit 2
fi

TAG="antora-dbml-v$VERSION"
TARBALL="antora-dbml-$VERSION.tgz"

if ! command -v gh > /dev/null; then
  echo "the GitHub CLI (gh) is needed to fetch the tarball from the release" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "fetching $TARBALL from the GitHub release $TAG"
if ! gh release download "$TAG" --repo "$REPO" --pattern "$TARBALL" --dir "$WORK"; then
  echo "the release $TAG has no $TARBALL — release the version first" >&2
  echo "(docs/releasing.md, \"antora-dbml\")" >&2
  exit 1
fi

LISTING="$(tar -tzf "$WORK/$TARBALL")"
for inside in package/lib/index.js package/vendor/frame/embed.html \
  package/vendor/validate.mjs package/vendor/frame-host.js \
  package/vendor/frame-host.css package/LICENSE; do
  if ! grep -qx "$inside" <<< "$LISTING"; then
    echo "$TARBALL does not carry $inside — not publishing it" >&2
    exit 1
  fi
done
PACKED_VERSION="$(tar -xzOf "$WORK/$TARBALL" package/package.json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).version")"
if [ "$PACKED_VERSION" != "$VERSION" ]; then
  echo "$TARBALL says version $PACKED_VERSION, not $VERSION" >&2
  exit 1
fi

npm publish --dry-run "$WORK/$TARBALL"

if [ "$CHECK_ONLY" -eq 1 ]; then
  echo "$TARBALL is ready; not published (--check)"
  exit 0
fi

printf 'Publish antora-dbml %s to npm? It cannot be undone. Type the version to confirm: ' "$VERSION"
read -r answer
if [ "$answer" != "$VERSION" ]; then
  echo "not published"
  exit 1
fi

npm publish --access public "$WORK/$TARBALL"
echo "published: https://www.npmjs.com/package/antora-dbml/v/$VERSION"
