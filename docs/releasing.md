# Releasing

What a release is here, in the order it happens. Written down because the steps
are not derivable from the code: nothing automates them, there are no release
workflows, and two of them are outside this repository altogether.

A release is the extension's release. `packages/dbml-vs-code-extension/package.json`
carries the version everything else is named after; the root `package.json`
version is unrelated and is not touched.

The MkDocs plugin and the Obsidian plugin each have their own version and
their own release, below.

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

Two files, and only two:

- `packages/dbml-vs-code-extension/package.json` — the version;
- `packages/dbml-vs-code-extension/CHANGELOG.md` — an entry under the new
  version, in the `Added` / `Changed` / `Fixed` sections
  [Keep a Changelog](http://keepachangelog.com/) uses.

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

The file is git-ignored; delete it when you are done or leave it, either way it
will not be committed.

### 7. The Marketplace

```bash
yarn workspace dbml-studio publish
```

Separate, last, and **only when somebody decides to**. It is irreversible and
it reaches every installed copy. The publisher has been blocked once, in July
2026, for an extension resembling another one; the listing and the identifiers
are what got it back. Nothing about a GitHub release requires this to follow
immediately — a release that only exists as a tag and a `.vsix` is a complete
release for anyone reading the repository.

## Releasing a plugin

Each plugin is released on its own, by the steps above with three differences:

- **The release commit** changes the plugin's version file and its
  `CHANGELOG.md` (below, per plugin), not the extension's, and is committed as
  `chore(release): <plugin> <version>`. Two plugins released together share one
  commit and one pull request.
- **The tag** names the plugin, so it cannot be mistaken for an extension
  version: `mkdocs-dbml-v<version>`, on the merge commit, annotated like the
  extension's. The Obsidian plugin is the exception: its tag is the bare
  version, because Obsidian's Community plugins directory requires it (below).
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

## The Obsidian plugin

The plugin is listed in Obsidian's Community plugins directory, and the
directory sets the rules this section follows. It reads the repository root's
`manifest.json` from the default branch; for a version it installs a GitHub
release whose tag is exactly that version, and from that release it takes
three files and nothing else: `main.js`, `manifest.json`, `styles.css`.

The plugin is versioned on its own, in the repository root's `manifest.json`,
by the same rule: what would a user of the previous version notice? The entry
goes in `packages/obsidian-plugin/CHANGELOG.md`. The release commit also adds
the version to the root `versions.json`, mapped to the manifest's
`minAppVersion` — the Obsidian version the plugin is checked on, raised only
after checking on the newer one. Obsidian uses it to offer an older Obsidian
the last release that still runs there.

**The tag is the bare version** — `0.2.0`, not `obsidian-plugin-v0.2.0` —
because the directory looks the release up by the manifest's version. The
first release, `obsidian-plugin-v0.1.0`, keeps its tag as history; it was
never in the directory.

The diagram frame travels inside `main.js` (the plugin writes it into its
folder on first start; `packages/obsidian-plugin/README.md`), so the three
files are the whole plugin. The release also carries
`dbml-studio-obsidian-<version>.zip`, the same plugin as a folder, for
installing by hand.

All of it is one script, run on `main` once the release commit is merged:

```bash
yarn workspace obsidian-plugin release:github <version> --check   # checks and build only
yarn workspace obsidian-plugin release:github <version>
```

The script (`packages/obsidian-plugin/scripts/release-github.sh`) refuses
unless the tree is clean, on `main`, and the same commit as `origin/main`;
unless the root manifest is at `<version>`, `versions.json` lists it with the
manifest's `minAppVersion`, and the changelog has its entry; and when the tag
exists already. It then builds the site, the plugin and the zip (`yarn
build:web`, `yarn package:obsidian`) and checks `main.js` carries the frame it
just vendored — by the frame's `BUILD` string — and is not too small to. With
`--check` it stops there. Otherwise it asks for the version to be typed back,
creates the annotated tag `<version>` on `HEAD`, pushes it, and creates the
GitHub release with `main.js`, `manifest.json`, `styles.css` and the zip
attached, its notes the changelog entry, and `--latest=false`: "latest" on
the repository's page is the extension's. The tag goes on `HEAD`, which is
the merge commit, as for every other release. Should `gh release create` fail
after the tag is pushed, a rerun refuses the existing tag; the script prints
the `gh release create` command that finishes the release from the files the
build left in place.

**Submitting to the directory is a one-time step done by the maintainer at
community.obsidian.md**: sign in with an Obsidian account, link the GitHub
account, and submit the repository. An automated review follows; what it asks
to change is fixed in a new release with a new version. After the plugin is
listed, every release made by the script reaches Obsidian users with no
further step.

## What has gone wrong before

- **A release with no `.vsix`.** The GitHub release is easy to finish and call
  done. It is step 6 that makes the version installable.
- **`vsce` not installed.** It was nobody's dependency until 1.0.2 and the
  scripts called it by bare name, so `create:package` and `publish` worked only
  on a machine that happened to have it globally. It is a devDependency now.
- **A stale `out/`.** Unrelated to releasing, but it is how the integration
  suite in step 2 once failed on a working tree containing nothing wrong. See
  `docs/testing.md`.
