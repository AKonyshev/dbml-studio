# Releasing

What a release is here, in the order it happens. Written down because the steps
are not derivable from the code: nothing automates them, there are no release
workflows, and two of them are outside this repository altogether.

A release is the extension's release. `packages/dbml-vs-code-extension/package.json`
carries the version everything else is named after; the root `package.json`
version is unrelated and is not touched.

The MkDocs plugin has its own version and its own release, below. The Obsidian
plugin lives in its own repository,
[AKonyshev/obsidian-dbml-studio](https://github.com/AKonyshev/obsidian-dbml-studio),
and is released there.

## Deciding the number

Read what has landed since the last tag and ask what a **user of the previous
version** would notice:

```bash
git log v<previous>..main --oneline
```

Only that decides the number. A branch of seven commits can be a patch: 1.0.2
was six commits of tests, refactoring and documentation around one fix anybody
could see. Check where each user-visible commit actually sits — a fix written
during one release cycle may already have shipped in the last one.

- **patch** — a fix to behaviour that shipped broken;
- **minor** — something a user can now do that they could not;
- **major** — something they did before and cannot now, or must do differently.

## The steps

### 1. Land the work

Ordinary pull requests into `main`, reviewed and merged as usual. The release
commit comes after, on top of everything it describes.

### 2. Verify what you are about to release

On `main`, with the working tree clean:

```bash
yarn typecheck && yarn test && yarn build:web && yarn test:e2e
yarn workspace dbml-studio test:integration
```

The last one is not in the sweep and launches a real VS Code. Run it: it is the
only thing that proves the extension still opens a file.

### 3. The release commit

Its own branch, because `main` takes changes through pull requests.

```bash
git checkout -b chore/release-<version>
```

Three files, and a fourth when the frame changed:

- `packages/dbml-vs-code-extension/package.json` — the version;
- `packages/dbml-vs-code-extension/CHANGELOG.md` — an entry under the new
  version, in the `Added` / `Changed` / `Fixed` sections
  [Keep a Changelog](http://keepachangelog.com/) uses;
- `packages/dbml-frame/package.json` — the same version as the extension's,
  because the package is released with it (below). Its
  `packages/dbml-frame/CHANGELOG.md` gets an entry only when the frame changed
  for hosts, not on every release.

Write the entry for someone deciding whether to update. Say what they would
notice and, where it helps, why it was wrong — a fix nobody can recognise is a
fix nobody trusts.

Commit as `chore(release): <version>`, open a pull request, get it merged.

### 4. Tag

On `main`, after the merge. The tag goes on the merge commit, which is what
every previous tag has done.

```bash
git checkout main && git pull --ff-only
git tag -a v<version> -m "v<version> — <the short name>"
git push origin v<version>
```

### 5. The GitHub release

```bash
gh release create v<version> --title "v<version> — <the short name>" --notes "..."
```

The notes are the changelog entry with room to breathe. Past titles name the
release rather than number it: _v1.0.1 — the listing release_, _v1.0.2 — the
SVG that had no tables in it_.

### 6. Attach the package

**Every release carries a `.vsix`.** It is how someone installs the version
without the Marketplace, and how a bad release is rolled back to.

```bash
cd packages/dbml-vs-code-extension
yarn create:package
gh release upload v<version> dbml-studio-<version>.vsix
```

`create:package` runs `vsce package`, which runs the build first through
`vscode:prepublish` — so the package is always built from the working tree, not
from whatever `dist/` held. Check the version inside before uploading:

```bash
unzip -p dbml-studio-<version>.vsix extension/package.json | grep '"version"'
```

The file is git-ignored. Move it to the repository root's `dist/`, which keeps
every released package beside the others' — that is the copy step 7 publishes:

```bash
mv dbml-studio-<version>.vsix ../../dist/
```

The `dbml-frame` tarball goes on the same release (see `dbml-frame` below):

```bash
cd ../..
yarn package:frame
gh release upload v<version> dist/dbml-frame-<version>.tgz
```

### 7. The Marketplace

```bash
yarn workspace dbml-studio publish:marketplace --packagePath ../../dist/dbml-studio-<version>.vsix
```

It publishes the `.vsix` attached to the GitHub release, not a fresh build, the
way the other packages' scripts publish their released ones — compare it with the
release asset first if it has been sitting in `dist/`. `vsce` takes the access
token stored by `npx vsce login konyshevav`, or `VSCE_PAT` from the environment.
The script is `publish:marketplace`, not `publish`: `yarn workspace … publish`
is yarn's own command, which packs the extension as an npm package and pushes
it to yarn's registry.

Separate, last, and **only when somebody decides to**. It is irreversible and
it reaches every installed copy. The publisher has been blocked once, in July
2026, for an extension resembling another one; the listing and the identifiers
are what got it back. Nothing about a GitHub release requires this to follow
immediately — a release that only exists as a tag and a `.vsix` is a complete
release for anyone reading the repository.

## Releasing a plugin

The MkDocs plugin is released on its own, by the steps above with three
differences (the Antora extension and `dbml-frame` have their own sections):

- **The release commit** changes the plugin's version file and its
  `CHANGELOG.md` (below, per plugin), not the extension's, and is committed as
  `chore(release): <plugin> <version>`. Two packages released together share one
  commit and one pull request.
- **The tag** names the plugin, so it cannot be mistaken for an extension
  version: `mkdocs-dbml-v<version>`, on the merge commit, annotated like the
  extension's.
- **The GitHub release** is the plugin's own, titled
  `<plugin> <version> — <the short name>`, with its package attached in place of
  the `.vsix`. Mark it `--latest=false`: "latest" on the repository's page is
  the extension's.

```bash
gh release create mkdocs-dbml-v<version> --latest=false --title "mkdocs-dbml <version> — <the short name>" --notes "..."
gh release upload mkdocs-dbml-v<version> dist/mkdocs_dbml-<version>-py3-none-any.whl
```

## The MkDocs plugin

The plugin is versioned on its own, in `packages/mkdocs-dbml/pyproject.toml`,
by the same rule as above: what would a user of the previous version notice?
The entry goes in `packages/mkdocs-dbml/CHANGELOG.md`.

It carries a built copy of the diagram frame, so the build order matters and
is enforced — the wheel refuses to build from a `dist` that is missing
anything the frame needs:

```bash
yarn build:web
yarn workspace mkdocs-dbml build
```

The wheel is in `packages/mkdocs-dbml/dist/`. Check it carries the frame and
the license notice before anything else — two lines, `_vendor/frame/embed.html`
and `mkdocs_dbml/LICENSE`:

```bash
unzip -l packages/mkdocs-dbml/dist/mkdocs_dbml-<version>-py3-none-any.whl | grep -E '_vendor/frame/embed.html|LICENSE'
```

Copy it to the root `dist/`, beside the `.vsix` archive, and attach it to the
GitHub release as step 6 attaches the extension.

Publishing to PyPI is separate, last, and only when somebody decides to — like
the Marketplace, it cannot be taken back: a version uploaded once can never be
uploaded again, not even after deleting it. It comes after the GitHub release,
because it publishes the wheel attached there rather than a fresh build:

```bash
yarn workspace mkdocs-dbml publish:pypi <version> --check   # fetch and check only
yarn workspace mkdocs-dbml publish:pypi <version>
```

The script (`packages/mkdocs-dbml/scripts/publish-pypi.sh`) fetches the
wheel from the release `mkdocs-dbml-v<version>`, refuses one that does not
carry the frame and the license, runs `twine check --strict`, and asks for the
version to be typed back before uploading. twine then asks for credentials:
username `__token__`, password a PyPI API token (pypi.org → Account settings →
API tokens). The script is `publish:pypi`, not `publish`, because
`yarn workspace … publish` is yarn's own command for npm.

## antora-dbml

The Antora extension is an npm package, versioned on its own, in
`packages/antora-dbml/package.json`, by the same rule: what would a user of
the previous version notice? The entry goes in
`packages/antora-dbml/CHANGELOG.md`, and the release commit fills in its date.

It carries a built copy of the diagram frame, so one command builds the site,
the package and the tarball, and refuses a tarball that is missing the frame,
the validator or the license:

```bash
yarn package:antora
```

The tarball is `dist/antora-dbml-<version>.tgz`, beside the `.vsix` archive.
Check what is inside before anything else:

```bash
tar -tzf dist/antora-dbml-<version>.tgz
```

It must list `package/lib/index.js`, `package/vendor/frame/embed.html`,
`package/vendor/validate.mjs`, `package/vendor/frame-host.js`,
`package/vendor/frame-host.css` and `package/LICENSE`, and nothing under
`package/src/`. `yarn package:antora` already refuses a tarball without the
required files; the sources check is by eye.

Tag it on the merge commit, annotated, as `antora-dbml-v<version>`, and attach
the tarball to the GitHub release:

```bash
git tag -a antora-dbml-v<version> -m "antora-dbml-v<version> — <the short name>"
git push origin antora-dbml-v<version>
gh release create antora-dbml-v<version> --latest=false --title "antora-dbml <version> — <the short name>" --notes "..."
gh release upload antora-dbml-v<version> dist/antora-dbml-<version>.tgz
```

Publishing to npm is separate, last, and only when somebody decides to — a
version published once can never be published again. It comes after the GitHub
release, because it publishes the tarball attached there rather than a fresh
build:

```bash
yarn workspace antora-dbml publish:npm <version> --check   # fetch and check only
yarn workspace antora-dbml publish:npm <version>
```

The script (`packages/antora-dbml/scripts/publish-npm.sh`) fetches the tarball
from the release `antora-dbml-v<version>`, refuses one that does not carry the
frame, the validator and the license or whose `package.json` says another
version, runs `npm publish --dry-run`, and asks for the version to be typed
back before publishing. The last step is the maintainer's: it needs an npm
account that may publish `antora-dbml`, logged in once with
`npm login --registry https://registry.npmjs.org/`, and its two-factor code.
Every npm call in the script names that registry: run through
`yarn workspace`, npm would otherwise inherit yarn's and publish to
registry.yarnpkg.com, a mirror. The script is
`publish:npm`, not `publish`, because `yarn workspace … publish` is yarn's own
command.

## dbml-mcp

The MCP server is an npm package, versioned on its own, in
`packages/dbml-mcp/package.json`, by the same rule: what would a user of the
previous version notice? The entry goes in `packages/dbml-mcp/CHANGELOG.md`, and
the release commit fills in its date.

It is one bundled file with no runtime dependencies, so one command builds the
bundle and the tarball, and refuses a tarball that is missing the bundle, the
README or the license, or that declares a dependency:

```bash
yarn package:mcp
```

The tarball is `dist/dbml-mcp-<version>.tgz`, beside the `.vsix` archive.
Check what is inside before anything else:

```bash
tar -tzf dist/dbml-mcp-<version>.tgz
```

It must list `package/dist/server.cjs`, `package/README.md`,
`package/CHANGELOG.md`, `package/LICENSE` and `package/package.json`, and
nothing else. `yarn package:mcp` already refuses a tarball without the required
files; the rest is by eye.

Tag it on the merge commit, annotated, as `dbml-mcp-v<version>`, and attach the
tarball to the GitHub release:

```bash
git tag -a dbml-mcp-v<version> -m "dbml-mcp-v<version> — <the short name>"
git push origin dbml-mcp-v<version>
gh release create dbml-mcp-v<version> --latest=false --title "dbml-mcp <version> — <the short name>" --notes "..."
gh release upload dbml-mcp-v<version> dist/dbml-mcp-<version>.tgz
```

Publishing to npm is separate, last, and only when somebody decides to — a
version published once can never be published again. It comes after the GitHub
release, because it publishes the tarball attached there rather than a fresh
build:

```bash
yarn workspace dbml-mcp publish:npm <version> --check   # fetch and check only
yarn workspace dbml-mcp publish:npm <version>
```

The script (`packages/dbml-mcp/scripts/publish-npm.sh`) fetches the tarball
from the release `dbml-mcp-v<version>`, refuses one that does not carry the
bundle, the README and the license or whose `package.json` says another
version, runs `npm publish --dry-run`, and asks for the version to be typed
back before publishing. The last step is the maintainer's: it needs an npm
account that may publish `dbml-mcp`, logged in once with
`npm login --registry https://registry.npmjs.org/`, and its two-factor code.
Every npm call in the script names that registry, for the reason given under
`antora-dbml`.

The extension is not released through any of this, but it is affected by it: the
`.vsix` embeds the server as `extension/dist/mcp/server.cjs`, built from
whatever `dbml-mcp` source is in the workspace when the `.vsix` is built, not
from a published `dbml-mcp` version. The extension's own version therefore does
not have to match a tag here. The `version` its MCP definition reports is both,
`<extension version>-<dbml-mcp version>`, so a change to either makes VS Code
restart the server. Check that the server is in the archive:

```bash
unzip -l dist/dbml-studio-<version>.vsix | grep mcp/server.cjs
```

## dbml-frame

`dbml-frame` is the diagram frame and the protocol a host speaks with it, as an
npm package, for hosts that live outside this repository: the Obsidian plugin
(`AKonyshev/obsidian-dbml-studio`) builds its frame from it. It carries the
frame (`frame/`, with its `manifest.json`), the `BUILD` string that says which
build the frame is, and the compiled `protocol/frameHost`.

It has no tag and no release of its own. Its version is the extension's, set in
the release commit (step 3), and its tarball is attached to the extension's
release `v<version>` — so a host can name the frame it was built against by one
number.

One command builds the site, the package and the tarball, and refuses a
tarball that is missing the frame, its manifest, `BUILD`, the protocol (the
`.js` and its `.d.ts`) or the license:

```bash
yarn package:frame
```

The tarball is `dist/dbml-frame-<version>.tgz`, beside the `.vsix` archive.
Check what is inside before attaching it:

```bash
tar -tzf dist/dbml-frame-<version>.tgz
```

It must list `package/frame/embed.html`, `package/frame/manifest.json`,
`package/BUILD`, `package/protocol/frameHost.js`,
`package/protocol/frameHost.d.ts` and `package/LICENSE`, and nothing under
`package/src/`. `yarn package:frame` already refuses a tarball without the
required files; the sources check is by eye.

Publishing to npm is separate, last, and only when somebody decides to — a
version published once can never be published again. It comes after the GitHub
release, because it publishes the tarball attached there rather than a fresh
build:

```bash
yarn workspace dbml-frame publish:npm <version> --check   # fetch and check only
yarn workspace dbml-frame publish:npm <version>
```

The script (`packages/dbml-frame/scripts/publish-npm.sh`) fetches the tarball
from the release `v<version>`, refuses one that does not carry the required
files or whose `package.json` says another version, runs
`npm publish --dry-run`, and asks for the version to be typed back before
publishing. The last step is the maintainer's: it needs an npm account that may
publish `dbml-frame`, logged in once with
`npm login --registry https://registry.npmjs.org/`, and its two-factor code.
Every npm call in the script names that registry, for the reason given under
`antora-dbml`. The script is `publish:npm`, not `publish`, because
`yarn workspace … publish` is yarn's own command.

## The Obsidian plugin

The Obsidian plugin is not released from this repository: it lives in
[AKonyshev/obsidian-dbml-studio](https://github.com/AKonyshev/obsidian-dbml-studio),
with its own version, tags and Community plugins listing. Its steps are in that
repository's
[`RELEASING.md`](https://github.com/AKonyshev/obsidian-dbml-studio/blob/main/RELEASING.md).
It takes the diagram frame from the `dbml-frame` package (above), so a new
frame reaches it once that release's `dbml-frame` is published to npm.

## What has gone wrong before

- **A release with no `.vsix`.** The GitHub release is easy to finish and call
  done. It is step 6 that makes the version installable.
- **`vsce` not installed.** It was nobody's dependency until 1.0.2 and the
  scripts called it by bare name, so `create:package` and `publish` worked only
  on a machine that happened to have it globally. It is a devDependency now.
- **`yarn workspace dbml-studio publish` for the Marketplace.** Step 7 used to
  say so, and with the script named `publish` the command ran yarn's built-in
  `publish` instead: for 1.2.2 it tried to put the extension on
  registry.yarnpkg.com as an npm package, and only its size (a 413 from the
  registry) stopped it. The Marketplace still had 1.2.1. The script is
  `publish:marketplace` now, which yarn cannot mistake for its own command.
- **A stale `out/`.** Unrelated to releasing, but it is how the integration
  suite in step 2 once failed on a working tree containing nothing wrong. See
  `docs/testing.md`.
