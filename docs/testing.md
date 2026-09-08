# Tests

`yarn test` runs every package's suite, one package at a time
(`scripts/test.js`). A single package on its own is still
`yarn workspace <name> test` — the sweep runs exactly that command for each
package, so there is no second way to invoke a suite that could drift from the
first.

It runs on every commit, from `.husky/pre-commit` — after `lint-staged`, not
inside it. The suites are repo-wide, so there is no file list to give them and
nothing about which files are staged narrows what has to run. That costs ~25
seconds per commit, most of it `ts-jest` compiling.

Two things follow from where it sits:

- The hook needs `set -e`. A shell script exits with the status of its last
  command, so without it a `lint-staged` failure followed by a passing test run
  would exit 0 and commit the type errors anyway.
- `lint-staged` stashes unstaged changes for the duration of its own run; this
  does not. `yarn test` tests the working tree rather than the staged snapshot,
  so with a dirty tree it can pass on code the commit does not contain.

## Two suites want a database, and skip without one

`packages/db-to-dbml` and `packages/schema-diff` each have a
`liveDatabase.test.ts` that talks to a real PostgreSQL. Everything else in those
packages hands the connector a fixture, which proves the translation and nothing
about the query that feeds it — the shape of `information_schema`, that a column
written `serial` comes back as `int4` with `increment`, that a foreign key
arrives with the table it points at. Those are the things a fixture agrees with
by construction.

They are skipped unless `DBML_TEST_DATABASE_URL` is set, so the sweep on every
commit stays offline and needs nothing installed. To run them:

```bash
docker run -d --name dbml-test-pg -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=dbmltest -p 55432:5432 postgres:16-alpine

docker exec -i dbml-test-pg psql -U postgres -d dbmltest <<'SQL'
CREATE TABLE authors (
  id serial PRIMARY KEY,
  email varchar(255) NOT NULL UNIQUE,
  bio text
);
CREATE TABLE books (
  id serial PRIMARY KEY,
  author_id integer NOT NULL REFERENCES authors(id),
  title varchar(255) NOT NULL
);
-- A second schema, and a reference that leaves it: what an export of one
-- schema drops and an export of both keeps.
CREATE SCHEMA audit;
CREATE TABLE audit.logs (
  id serial PRIMARY KEY,
  author_id integer NOT NULL REFERENCES authors(id),
  action varchar(255) NOT NULL
);
SQL

# A second database on the same server: what `listDatabases` is for.
docker exec -i dbml-test-pg psql -U postgres -d postgres \
  -c 'CREATE DATABASE dbmlother'

DBML_TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/dbmltest \
  yarn workspace db-to-dbml test
DBML_TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/dbmltest \
  yarn workspace schema-diff test

docker rm -f dbml-test-pg
```

The schema above is what the assertions are written against; changing it means
changing them.

## One suite in the sweep is not pure

`packages/web/src/catalog/__tests__/schemaManifestScript.test.ts` runs the
container's manifest scanner — a shell script — by spawning `sh` against fixture
folders under the system temp directory. It is in the sweep, and therefore on
every commit, which is a deliberate trade: the script decides what the site
shows, and reimplementing its extraction in TypeScript to keep the suite pure
would test a second copy of the logic rather than the one that ships.

What it cannot see is BusyBox. The `sh` and `awk` it runs are the developer
machine's; the image serves Alpine's. That gap is closed by hand, against a
built container, and by nothing else.

## Each package owns its own suite

A package's `test` script and its `jest.config.js` are the package's business.
Most pass `--collectCoverage`; `dbml-schema-visualizer` and `web` do not.
`dbml-schema-visualizer` also has a `pretest` script that yarn runs first, which
is where the eslint pass in its output comes from — the sweep does not add it.
`scripts/test.js` runs the declared script rather than invoking jest itself, so
those choices keep working and adding a package needs no change here.

The output is passed straight through instead of being buffered and summarized.
A sweep whose result you have to trust rather than read is how the failure below
survived.

## The trap: a package with tests and no `test` script

`packages/shared` had a correct `jest.config.js` and three passing tests, and no
`scripts` block at all. `yarn workspace shared test` therefore failed to find a
script, and because every suite was invoked by hand there was no aggregate run
to notice. The tests had not executed since they were written.

`scripts/test.js` treats a package that contains `*.test.ts` or `*.test.tsx`
files and declares no `test` script as an error, names it, and exits before
running anything. This
is the same call `scripts/typecheck.js` makes for a package that contains
TypeScript and has no `tsconfig.json` — see trap 4 in
[typecheck.md](./typecheck.md). In both cases the alternative is a green summary
that quietly means "passed, except the ones I skipped".

The two sweeps share their package discovery (`scripts/workspace-packages.js`)
so that "which packages exist" cannot answer differently for tests than it does
for types.

## The browser tests, and why they are not in the sweep

`packages/web` has a second suite that `yarn test` does not run:

```bash
yarn build:web && yarn test:e2e
```

Playwright, against the built site, in two files.

`e2e/site.spec.ts` is the smoke test, and the only check here that can catch an
editor fetched over the network at run time instead of bundled — the failure
where the types compile, every unit test passes, the container starts, and half
the page is empty on a closed network. It asserts the editor is really there,
that typed DBML reaches the diagram, and that no request leaves the origin.

`e2e/catalog.spec.ts` covers the file tree: a deployment whose image was built
around a folder of `.dbml` files, the reader's own version of a project schema,
their own files, and downloading a schema too broken to draw. The catalogue is
served by the container's nginx and is not in `dist`, so the test supplies it
with `page.route` — both paths are same-origin, which is what keeps the smoke
test's promise intact rather than quietly widening it.

It is out of the sweep deliberately, and out of the pre-commit hook with it:

- **It needs a build.** The sweep has no build step, and adding one would put a
  ~15-second bundle on every commit. A browser test that quietly ran against
  last week's `dist` would be worse than not running it at all, so the test does
  not build either — a stale `dist` fails it rather than being repaired by it.
- **They are `*.spec.ts`, not `*.test.ts`.** `scripts/test.js` discovers the
  latter, so the trap described above — a package with tests and no `test`
  script — does not fire for `e2e/`. That is the intended exemption rather than
  an oversight, and this section is where it is recorded.

Its files _are_ type-checked: `packages/web/tsconfig.json` includes `e2e/**` and
`playwright.config.ts`, so `yarn typecheck` covers them. The package's `build`
script uses `tsconfig.build.json` instead, which excludes both — the container
image should not need Playwright installed to compile the site.

The smoke test's own guard was verified by breaking it: externalising the editor
and pointing an import map at a CDN made the build succeed and the test fail. See
the ticket comments in the local tracker for the measurements.

## The extension test that runs inside VS Code

`packages/dbml-vs-code-extension` has a third suite, also outside the sweep:

```bash
yarn workspace dbml-studio test:integration
```

`compile-tests` empties `out/` before it runs, which is not tidiness. `tsc`
writes into that directory and never removes anything from it, `out/` is
git-ignored, and the runner globs `out/**/*.test.js` — so a test file deleted
from the source tree goes on being compiled once and executed for ever on the
machine that built it. It happened: a suite removed with the feature it covered
kept running against an extension identifier the rename had since changed, and
failed with "extension konyshevav.dbml-schema-visualizer not found" on a working
tree that contained no such string. A fresh clone passed, which is the worst
shape a failure can take.

It launches a real VS Code with the extension loaded and drives it from the
inside — `vscode.commands.executeCommand` plus `vscode.window.tabGroups` — which
is the only way to check the thing the text/diagram toggle is for: that switching
**replaces** the tab rather than opening a second one. No unit test can see this,
because the behaviour lives in the workbench, not in our code: `vscode.openWith`
routes through `editorService.openEditor` and cannot replace an editor, so the
commands open the replacement and then close what it replaced.

Out of the sweep for the same shape of reasons as the browser tests, plus one of
its own:

- **It needs a build**, and the script does it (`yarn build && yarn compile-tests
&& vscode-test`), which puts ~20 seconds of bundling in front of the run.
- **It downloads a VS Code build** (~300 MB) into `.vscode-test/` on first use,
  and launches a GUI application. Neither belongs on a pre-commit hook.
- **It lives in `extension/test/`, not `extension/__tests__/`.** Jest's
  `testMatch` covers only the latter, so the two suites in this package do not
  collide, and `scripts/test.js` still finds the package's `test` script.

Four settings in `.vscode-test.mjs` are worth knowing. The first two were
failures first; the last two are what one test needs to see anything at all:

- **`--user-data-dir /tmp/dbml-vscode-test`.** VS Code puts its IPC socket in the
  user-data directory, and a unix socket path cannot exceed 104 bytes on macOS.
  The default inside this package is already over the limit, and the failure
  reads `listen EINVAL`, which does not name the cause.
- **`--remote-debugging-port=9333` and `--disable-site-isolation-trials`.**
  `hostRelay.test.ts` and `fieldEditing.test.ts` are the tests that watch the
  page and the extension talk to each other, and they can only do that from
  outside: the extension can post into a webview, but a test cannot read one.
  The first watches a command arrive in the page; the second sends the page's
  own edit request back the other way and checks that the document changed and
  that one undo took it back. It posts through `window.vsCodeWebviewAPI` rather
  than clicking a column, because hit-testing a canvas from a test would be
  measuring Konva's arithmetic instead of the thing at risk. So it attaches over the debugging port
  with Playwright and reads the page's `localStorage`. Two consequences worth
  writing down. The port is fixed, so two runs at once cannot both have it, and
  the number is repeated in `extension/test/helpers.ts` because a launch config
  cannot import from the build output. And with site isolation off, the suite
  runs a process model no reader has — the diagram's frame is otherwise in a
  process of its own, which the debugging port does not enumerate, so the test
  would find no frame rather than a wrong answer. That does not change how a
  message is delivered or what its `source` is, but a fault that depends on the
  process split would not show up here.
- **Current stable, not the `^1.87.0` engine floor.** An Electron from early 2024
  segfaults on macOS 26, so the oldest supported version cannot be exercised on
  this host at all. Nothing in the suite uses API newer than 1.87 —
  `window.tabGroups` landed in 1.68 — but the version actually proven is the
  current one. Running the floor needs an older macOS or a Linux CI box.
