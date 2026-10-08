#!/usr/bin/env bash
# Publishes a released dbml-mcp tarball to npm.
#
#   yarn workspace dbml-mcp publish:npm                the version in package.json
#   yarn workspace dbml-mcp publish:npm 0.2.0
#   yarn workspace dbml-mcp publish:npm 0.2.0 --check  everything but the upload
#
# The tarball is the one attached to the GitHub release dbml-mcp-v<version>.
# Release first (docs/releasing.md, "dbml-mcp"), publish after.
#
# A version published to npm can never be published again, so the script asks
# for the version to be typed back. It needs a login to registry.npmjs.org
# (`npm login --registry https://registry.npmjs.org/`, once), and npm asks for a
# one-time code when the account has two-factor authentication.
set -euo pipefail

REPO="AKonyshev/dbml-studio"
# Named on every npm call: run through `yarn workspace`, npm inherits yarn's
# registry setting and would publish to registry.yarnpkg.com, a mirror, instead.
REGISTRY="https://registry.npmjs.org/"
PACKAGE="$(cd "$(dirname "$0")/.." && pwd)"

VERSION=""
CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    -h | --help)
      sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
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

TAG="dbml-mcp-v$VERSION"
TARBALL="dbml-mcp-$VERSION.tgz"

if ! command -v gh > /dev/null; then
  echo "the GitHub CLI (gh) is needed to fetch the tarball from the release" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "fetching $TARBALL from the GitHub release $TAG"
if ! gh release download "$TAG" --repo "$REPO" --pattern "$TARBALL" --dir "$WORK"; then
  echo "the release $TAG has no $TARBALL — release the version first" >&2
  echo "(docs/releasing.md, \"dbml-mcp\")" >&2
  exit 1
fi

LISTING="$(tar -tzf "$WORK/$TARBALL")"
for inside in package/dist/server.cjs package/README.md package/LICENSE package/package.json; do
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

npm publish --dry-run --registry "$REGISTRY" "$WORK/$TARBALL"

if [ "$CHECK_ONLY" -eq 1 ]; then
  echo "$TARBALL is ready; not published (--check)"
  exit 0
fi

if ! NPM_USER="$(npm whoami --registry "$REGISTRY" 2> /dev/null)"; then
  echo "not logged in to $REGISTRY. Log in once with:" >&2
  echo "  npm login --registry $REGISTRY" >&2
  exit 1
fi
echo "logged in to npm as $NPM_USER"

printf 'Publish dbml-mcp %s to npm? It cannot be undone. Type the version to confirm: ' "$VERSION"
read -r answer
if [ "$answer" != "$VERSION" ]; then
  echo "not published"
  exit 1
fi

npm publish --access public --registry "$REGISTRY" "$WORK/$TARBALL"
echo "published: https://www.npmjs.com/package/dbml-mcp/v/$VERSION"
