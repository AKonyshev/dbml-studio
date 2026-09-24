# The site

The same schema visualizer as the VS Code extension, as a web page: a tree of
schemas on the left, a DBML editor beside it, and the diagram it describes on
the right.

The tree is the whole of the navigation — one schema is open at a time, and it
is chosen there. It holds two sections. **Project** is what the image was built
with: the same for everyone who opens this deployment, read-only, and back after
every restart. **My files** are the schemas this reader opened or dropped on the
page; they live in this browser and nowhere else. Keeping them apart is the
point — merged into one list, the tree would quietly lie about which schemas
survive a cleared cache.

Editing a project file keeps your version beside its path, marked with a dot on
its row, and "Restore the project's version" in the row's menu gives the
image's back.

It is the extension's viewer, not a reimplementation of it. Both hosts mount the
same `DiagramApp` from `json-table-schema-visualizer`; the difference is only
where the schema comes from — the extension is handed messages by its extension
host, this package hands over the text in its editor.

## There is no backend

Nothing you open here leaves the browser. There is no server to talk to, no
telemetry, and nothing fetched from anywhere but the origin the page itself came
from — the editor is bundled into the page rather than pulled from a CDN, which
is what makes the site usable inside a closed network. Schemas you open, edit and
download are read and written by the page itself, and table layouts are
remembered in the browser's own storage.

The one thing the page does ask its own server for is the schema catalogue, when
the image was built with one: a manifest and the `.dbml` files behind it, static
files an operator put there. Nothing is written back — there is no endpoint that
could accept it.

The [smoke test](./e2e/site.spec.ts) asserts exactly that: it records every
request the built page makes and fails if any of them leaves the origin.

## Local development

From the repository root:

```bash
yarn install
yarn workspace web dev
```

The dev server prints a URL. Edits to this package and to the visualizer package
both hot-reload.

## Building

```bash
yarn build:web
```

Output lands in `packages/web/dist` — an entry document plus fingerprinted
assets, ready to be served by any static web server.

### What a documentation site takes from here

`yarn build:web` also leaves four files in `dist` that are not part of the
site itself, not fingerprinted:

- `frame-host.js` and `frame-host.css` — the page's half of the frame
  protocol, the script that lets a diagram expand across the page and follow
  the page's theme. Vendored by name into the Python plugin.
- `validate.mjs` — the model checks the frame makes at read time, as a program:
  a job of blocks on standard input, findings on standard output. The rules are
  `src/validate/`, tested here; the file exists because the plugin that calls it
  is written in Python. Vendored by name.
- `.vite/manifest.json` — the dependency graph of every build entry, so a
  packager can extract only what the frame needs. That is the whole mechanism
  by which the frame is smaller than the site: not a setting, but the absence
  of an import. The site's own entry and everything only it reaches — the
  editor, its worker, the icon font — stay out of the wheel.

The container image carries none of the four: they are for a documentation
site's build, not for readers of this one.

#### Packaging the frame from the manifest

Start at the manifest's `embed.html` entry and take its `file`, `css` and
`assets`; then, for every chunk reached through `imports` or `dynamicImports`,
recursively, take that chunk's `file`, `css` and `assets` too. The frame has no
dynamic imports today, which is exactly why the rule names them: the day one is
added, a packager following `imports` alone would leave its chunk behind without
a word, and the frame would fail only when the code that loads it runs.
Collecting `file` alone is not
enough: the frame's stylesheet hangs off the chunk `embed.html` imports, not off
the entry, and a frame packaged without it draws unstyled. Finally take
`embed.html` itself from the root of `dist` — the manifest's `file` for that
entry is its script, not the document.

#### The validator's contract

Standard input, one JSON object:

```json
{ "blocks": [{ "id": "…", "model": "…", "text": "…", "tables": ["…"] }] }
```

`tables` is the list of table names the block asked for, or `null` for the
whole model. Standard output, one JSON object:

```json
{ "findings": [{ "id": "…", "model": "…", "problem": "…" }] }
```

- `id` is returned untouched — whatever the caller needs to point at the block
  again. `model` is only repeated for the report.
- An empty `findings` means every block checked out.
- A non-zero exit, with a message on standard error, means the validator itself
  could not run. That is different from the models being fine, and a caller
  must not report it as such.

#### The host script's HTML contract

- Each frame is an `<iframe>` inside `<div class="dbml-diagram">`.
- `data-dbml-theme-fixed` on that wrapper means leave this frame's theme alone:
  its block named one.
- `data-dbml-dark-scheme` on any wrapper names Material's dark palette, the
  value of `data-md-color-scheme` on `<body>` that means dark. The first one on
  the page is read; the default is `slate`.
- While a diagram is expanded, its wrapper carries `dbml-diagram--expanded` and
  `<html>` carries `dbml-diagram-host--locked`. Going Back takes both off; so
  does the expanded diagram leaving the document by any other route — a link,
  a search result, Material's `n` and `p` — which the script watches for while
  one is expanded.

## Running the container image

Built from the repository root, because the site depends on four sibling
packages by source and the build needs the whole workspace in context.

```bash
docker compose up --build
```

The equivalent without Compose:

```bash
docker build -f packages/web/Dockerfile -t dbml-schema-visualizer-web .
docker run --rm -p 8080:8080 dbml-schema-visualizer-web
```

The site is then on <http://localhost:8080>.

The image is two stages: a Node stage that installs and builds, and an nginx
stage that serves `dist` and nothing else — less the four files above, which
the build stage deletes. [`nginx.conf`](./nginx.conf) caches
the fingerprinted assets for a year and refuses to cache the entry document, so
a deployment reaches readers without anyone having to hard-refresh. There is
deliberately no single-page fallback — the site has no routing, so a catch-all
could only turn a missing asset into a 200 serving HTML.

### Project schemas inside the image

The image can be built around a folder of `.dbml` files. The site then shows them
as a tree on the left and opens the first of them the moment the container is up,
so nobody has to find a schema and drag it into the window.

```bash
docker build -f packages/web/Dockerfile --build-context schemas=/path/to/my-project -t my-schemas .
```

The folder can live anywhere on disk: it arrives as a build context of its own
rather than out of this repository. A layer on top of the published image does
the same thing:

```dockerfile
FROM dbml-schema-visualizer-web
COPY ./my-project /srv/schemas
```

And for a stand whose schemas change more often than its image, mount them:

```bash
docker run --rm -p 8080:8080 -v "$PWD/my-project:/srv/schemas:ro" dbml-schema-visualizer-web
```

The list is rebuilt at every container start, so a swapped volume needs a restart
and nothing more. A row is named after the `Project` block if the file has one,
otherwise after the file's first `//` comment, otherwise after the file itself.
`SCHEMAS_DEFAULT=billing/invoices.dbml` picks what a first visit opens; without
it that is the first file alphabetically. Sub-folders become folders in the tree,
and only `.dbml` files are served — a README or an `.env` sitting next to the
schemas stays unreachable.

The files are read-only. Edits live in the browser and leave through the download
action on the row; nothing is written back into the image or the volume. An image
built without a folder is the same site, with the sample schema sitting in "My
files" and the project section absent.

**Adding a package to the monorepo means adding it to the `Dockerfile` too.** The
dependency layer lists each workspace manifest by hand so that the install layer
is cached; a package present in the repository and missing from that list makes
the build fail on an unresolvable workspace.

## Tests

```bash
yarn workspace web test
```

Unit tests, in Node with no DOM, over the pure functions: parsing DBML text,
deriving a download filename, the session of open documents, the editor's
grammar, the browser-locale resolver, and the catalogue — its manifest, its
folder tree, and the two functions that fetch them.

One test in that suite is not over a pure function:
`src/catalog/__tests__/schemaManifestScript.test.ts` spawns `sh` on the
container's manifest scanner against fixture folders in the temp directory. It
is the only way to test the script that ships instead of a TypeScript copy of
it, and it cannot see BusyBox — the shell and awk it runs are this machine's,
not the image's, which is why the container is also checked by hand.

```bash
yarn build:web && yarn test:e2e
```

Browser tests, against the built output rather than the dev server. The smoke
test is the only check in the repository capable of catching an editor that is
fetched at run time instead of bundled — with that mistake the types compile,
the unit tests pass, the container starts, and the left half of the page is
empty. The rest cover the file tree: opening a project schema, keeping and
restoring a reader's own version of one, adding and removing their own files,
and taking a schema away that is too broken to draw. They supply a catalogue
with `page.route`, because the built output has none — the catalogue is the
container's, not the bundle's.

It needs a build first, and deliberately does not run one: a stale `dist` should
fail the test rather than be quietly repaired by it.
