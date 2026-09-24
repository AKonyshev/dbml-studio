# Releasing

What a release is here, in the order it happens. Written down because the steps
are not derivable from the code: nothing automates them, there are no release
workflows, and two of them are outside this repository altogether.

A release is the extension's release. `packages/dbml-vs-code-extension/package.json`
carries the version everything else is named after; the root `package.json`
version is unrelated and is not touched.

The MkDocs plugin has its own version and its own release, below.

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

## The MkDocs plugin

The plugin is versioned on its own, in `packages/mkdocs-dbml/pyproject.toml`,
by the same rule as above: what would a user of the previous version notice?

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
the Marketplace, it cannot be taken back:

```bash
packages/mkdocs-dbml/.venv/bin/python -m twine upload packages/mkdocs-dbml/dist/mkdocs_dbml-<version>-py3-none-any.whl
```

## What has gone wrong before

- **A release with no `.vsix`.** The GitHub release is easy to finish and call
  done. It is step 6 that makes the version installable.
- **`vsce` not installed.** It was nobody's dependency until 1.0.2 and the
  scripts called it by bare name, so `create:package` and `publish` worked only
  on a machine that happened to have it globally. It is a devDependency now.
- **A stale `out/`.** Unrelated to releasing, but it is how the integration
  suite in step 2 once failed on a working tree containing nothing wrong. See
  `docs/testing.md`.
