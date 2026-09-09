#!/usr/bin/env bash
# Publish the DBML VS Code extension to the Marketplace (publisher: konyshevav).
#
# Usage:
#   ./scripts/publish-extension.sh dbml              # test, build, publish DBML extension
#   ./scripts/publish-extension.sh dbml --package    # build .vsix only (no upload)
#   ./scripts/publish-extension.sh dbml --local      # build one to install and try
#   ./scripts/publish-extension.sh dbml --skip-tests # publish without running tests
#
# --local stamps a version of its own so that VS Code sees every build as newer
# than the last and than the release: installing the same version twice is what
# it quietly declines to do, --force or not.
#
# Auth (pick one):
#   npx @vscode/vsce login konyshevav   # stores PAT in macOS Keychain
#   export VSCE_PAT="..."               # or pass token via env
#
# Publisher is read from each extension's package.json — do not pass -p to publish
# unless you mean a Personal Access Token.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VSCE=(npx --yes @vscode/vsce)

PACKAGE_ONLY=false
SKIP_TESTS=false
LOCAL_BUILD=false
TARGETS=()

usage() {
  sed -n '2,16p' "$0"
  exit "${1:-0}"
}

for arg in "$@"; do
  case "$arg" in
    -h | --help) usage 0 ;;
    --package | --package-only) PACKAGE_ONLY=true ;;
    --local) PACKAGE_ONLY=true; LOCAL_BUILD=true ;;
    --skip-tests) SKIP_TESTS=true ;;
    dbml) TARGETS+=("$arg") ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage 1
      ;;
  esac
done

if ((${#TARGETS[@]} == 0)); then
  TARGETS=(dbml)
fi

resolve_package_dir() {
  case "$1" in
    dbml) echo "packages/dbml-vs-code-extension" ;;
    *) echo "Unknown extension: $1" >&2; exit 1 ;;
  esac
}

read_version() {
  node -p "require('${1}/package.json').version"
}

publish_one() {
  local name="$1"
  local pkg_dir
  pkg_dir="$(resolve_package_dir "$name")"
  local abs_dir="$ROOT/$pkg_dir"

  if [[ ! -f "$abs_dir/package.json" ]]; then
    echo "Missing package.json: $abs_dir" >&2
    exit 1
  fi

  local version
  version="$(read_version "$abs_dir")"
  echo "==> $name v$version ($pkg_dir)"

  pushd "$abs_dir" >/dev/null

  if [[ "$SKIP_TESTS" == false ]]; then
    echo "    running tests..."
    yarn test
  else
    echo "    skipping tests"
  fi

  echo "    building..."
  yarn package

  if [[ "$LOCAL_BUILD" == true ]]; then
    # A version of its own, above the release and above the last local build.
    # VS Code compares versions and declines to reinstall one it already has,
    # which is what makes a rebuilt .vsix look like it did not take. The patch
    # is bumped so the build is newer than the release, and the timestamp goes
    # in a prerelease tag so it can never be mistaken for one.
    local stamped
    stamped="$(node -p "
      const [major, minor, patch] = require('./package.json').version.split('.');
      const now = new Date();
      const at = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0'),
      ].join('');
      \`\${major}.\${minor}.\${Number(patch) + 1}-local.\${at}\`
    ")"

    # Kept outside the package: anything left beside package.json is a file
    # `vsce` finds and ships. Restored whatever happens, because a package.json
    # carrying a local version is one the next person to stage everything
    # commits without noticing.
    local kept
    kept="$(mktemp)"
    cp package.json "$kept"
    trap 'mv -f "$kept" "$abs_dir/package.json"' RETURN
    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      pkg.version = process.argv[1];
      fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    " "$stamped"

    local artifact
    artifact="$ROOT/dist/$(node -p "require('./package.json').name")-local.vsix"

    echo "    packaging $stamped ..."
    # One name, always overwritten: the version inside is what tells builds
    # apart, and a directory filling with them is nobody's idea of an archive.
    "${VSCE[@]}" package --out "$artifact"
    echo "    wrote $artifact ($stamped)"
    echo "    install: code --install-extension ${artifact#"$ROOT/"} --force"
  elif [[ "$PACKAGE_ONLY" == true ]]; then
    echo "    packaging .vsix..."
    "${VSCE[@]}" package --out "$ROOT/dist"
    echo "    wrote $ROOT/dist/${name}-*.vsix (see dist/)"
  else
    local pkg_publisher
    pkg_publisher="$(node -p "require('./package.json').publisher")"
    echo "    publishing as $pkg_publisher..."
    if [[ -n "${VSCE_PAT:-}" ]]; then
      "${VSCE[@]}" publish -p "$VSCE_PAT"
    else
      # Uses PAT from `vsce login` (Keychain) via package.json publisher field
      "${VSCE[@]}" publish
    fi
    echo "    published $pkg_publisher.$(node -p "require('./package.json').name")@$version"
  fi

  popd >/dev/null
}

echo "Installing workspace dependencies..."
yarn --cwd "$ROOT" install --frozen-lockfile 2>/dev/null || yarn --cwd "$ROOT" install

mkdir -p "$ROOT/dist"

for name in "${TARGETS[@]}"; do
  publish_one "$name"
done

echo "Done."
