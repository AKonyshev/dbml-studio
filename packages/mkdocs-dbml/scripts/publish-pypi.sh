#!/usr/bin/env bash
# Publishes a released mkdocs-dbml wheel to PyPI.
#
#   yarn workspace mkdocs-dbml publish:pypi                  the version in pyproject.toml
#   yarn workspace mkdocs-dbml publish:pypi 0.2.0
#   yarn workspace mkdocs-dbml publish:pypi 0.2.0 --check    everything but the upload
#
# The wheel is the one attached to the GitHub release mkdocs-dbml-v<version>,
# not a fresh build, so PyPI serves byte for byte what the release carries.
# Release first (docs/releasing.md, "Releasing a plugin"), publish after.
#
# A version uploaded to PyPI can never be uploaded again, not even after it is
# deleted, so the script asks for the version to be typed back before it
# uploads. twine then asks for credentials — username `__token__`, password a
# PyPI API token — unless TWINE_USERNAME / TWINE_PASSWORD or ~/.pypirc supply
# them.
set -euo pipefail

REPO="AKonyshev/dbml-studio"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TWINE="$ROOT/.venv/bin/twine"

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
      exit 2
      ;;
    *) VERSION="$arg" ;;
  esac
done

if [ -z "$VERSION" ]; then
  VERSION="$(sed -n 's/^version = "\(.*\)"$/\1/p' "$ROOT/pyproject.toml" | head -n 1)"
fi
if [ -z "$VERSION" ]; then
  echo "no version given, and none found in packages/mkdocs-dbml/pyproject.toml" >&2
  exit 1
fi

TAG="mkdocs-dbml-v$VERSION"
WHEEL="mkdocs_dbml-$VERSION-py3-none-any.whl"

if [ ! -x "$TWINE" ]; then
  echo "no twine in packages/mkdocs-dbml/.venv. Create the environment once with:" >&2
  echo "  yarn workspace mkdocs-dbml setup" >&2
  exit 1
fi
if ! command -v gh > /dev/null; then
  echo "the GitHub CLI (gh) is needed to fetch the wheel from the release" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "fetching $WHEEL from the GitHub release $TAG"
if ! gh release download "$TAG" --repo "$REPO" --pattern "$WHEEL" --dir "$WORK"; then
  echo "the release $TAG has no $WHEEL — release the version first" >&2
  echo "(docs/releasing.md, \"Releasing a plugin\")" >&2
  exit 1
fi

# What the release notes promise: the diagram frame and the license notice
# travel inside the wheel. A wheel built from an empty `_vendor/` would pass
# twine's own check and break every site that installs it.
for inside in "mkdocs_dbml/_vendor/frame/embed.html" "mkdocs_dbml/LICENSE"; do
  if ! unzip -l "$WORK/$WHEEL" | grep -q "$inside"; then
    echo "$WHEEL does not carry $inside — not publishing it" >&2
    exit 1
  fi
done

"$TWINE" check --strict "$WORK/$WHEEL"

if [ "$CHECK_ONLY" -eq 1 ]; then
  echo "$WHEEL is ready; not uploaded (--check)"
  exit 0
fi

printf 'Publish mkdocs-dbml %s to PyPI? It cannot be undone. Type the version to confirm: ' "$VERSION"
read -r answer
if [ "$answer" != "$VERSION" ]; then
  echo "not published"
  exit 1
fi

"$TWINE" upload "$WORK/$WHEEL"
echo "published: https://pypi.org/project/mkdocs-dbml/$VERSION/"
