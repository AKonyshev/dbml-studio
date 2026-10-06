# DBML Studio for Obsidian

Draws a `.dbml` model as an ER diagram inside a note — the same diagram frame
the documentation sites embed, fed by the plugin instead of by a web server.

Desktop only: the plugin reads the model from disk with Node's `fs`, and the
models it is written for live outside the vault.

## Install

In Obsidian: **Settings → Community plugins → Browse**, search for
"DBML Studio", install it and turn it on. Obsidian keeps it up to date from
there.

By hand, for a version not in the directory yet: every release on GitHub
(tags `0.2.0` and later) carries `dbml-studio-obsidian-<version>.zip`; unzip it
into `<vault>/.obsidian/plugins/`, so that the folder
`<vault>/.obsidian/plugins/dbml-studio/` holds `main.js`, and turn the plugin
on in **Settings → Community plugins**.

## What it does outside the note

The Community plugins directory asks a plugin to say these, and they are worth
knowing anyway.

- **Files outside the vault.** A block's `model:` is a path, resolved from the
  vault's root or from the note's folder, and `..` may take it out of the
  vault — that is what it is for. The models a documentation vault draws
  usually live beside the documentation they describe (an Antora or MkDocs
  site's `models/`), not inside the vault, and copying them in would leave two
  versions to drift apart. The plugin reads only the files blocks name, only
  when a note with the block is drawn or **Refresh diagrams** runs, and never
  writes them.
- **No network.** The plugin downloads nothing and sends nothing anywhere:
  the model is read from disk and handed to the diagram frame inside
  Obsidian's own window. The frame is the documentation sites' one, which on
  a site can fetch a model by URL; hosted by the plugin, it is given the
  model in a message instead and requests nothing.
- **Its own frame, unpacked into its own folder.** The diagram is drawn by a
  page — `frame/embed.html`, about 11.6 MB — that ships inside `main.js`,
  gzipped. On the first start, and after every update, the plugin compares
  `frame/BUILD` in its plugin folder with the build it carries and, when it is
  missing or different, writes `frame/embed.html` and then `frame/BUILD`
  there. The page has to be a file in the plugin folder because an `<iframe>`
  needs a URL of its own to load it from (see "How it works"). This is not
  self-updating: nothing is fetched, and the file written is the one the
  installed version came with. A start with an up-to-date `frame/` writes
  nothing. When the write fails, each block says so.

## A block

````markdown
```dbml
model: /../antora/models/to-be/dbml/rd.dbml
tables: reference_dictionary.agent_group, reference_dictionary.agent
height: 600
```
````

- **`model`** — required. With a leading `/` the path starts at the vault's
  root, otherwise at the note's own folder; `..` is allowed and usually
  needed. When the file cannot be read, the note names the path as it was
  resolved and why: missing, no permission, or a folder where a file
  belongs.
- **`tables`** — optional. Names separated by commas, or a list, `[a, b]`.
  Full (`schema.table`) and short names both work while the short one is
  unambiguous. Without it the whole model is drawn.
- **`height`** — pixels, a whole number above zero. 500 by default.
- **`theme`** — `light` or `dark`. Without it the diagram follows Obsidian's
  theme and switches with it.

Lines starting with `#` are comments. A key the block does not know is an
error shown in the note, not something skipped.

The keys are the MkDocs plugin's (`packages/mkdocs-dbml`), and so is the rule
for which blocks are diagrams: a block is one only when it has a line
starting with `model:` and opens — past blank lines and comments — with one
of the four keys. Anything else, DBML itself included, stays code.

What is not the same: the MkDocs plugin reads the block as YAML, and this one
reads lines. Quoted values (`model: "a.dbml"`), YAML block lists (`- a` on
lines of their own instead of `[a, b]`), and a comment trailing a value on
the same line are YAML's and are not understood here — each is read as part
of the plain text after the `:`, not stripped. A block written in the form
above means the same in both.

In Live Preview the block the cursor is in shows as its source, not as a
diagram — that is how Obsidian lets any code block be edited, Mermaid
included, and a plugin cannot change it. Right after a note opens the cursor
sits at its first line, so a note that starts with a diagram shows that one
as text until the cursor leaves it. Reading view always draws every block.
When the cursor leaves a block, Obsidian renders it afresh, and its frame
loads again — about a second.

## Commands

- **Refresh diagrams** (**Обновить диаграммы** in Russian) — re-reads every
  model on screen and sends it to its diagram again. Tables keep their
  places; new ones are laid out. The plugin does not watch the files. Each
  file is read once, and one that cannot be read is one notice, however many
  blocks draw it.

## Build from source

From the repository root:

```bash
yarn install
yarn build:web
yarn build:obsidian
yarn install:obsidian /path/to/vault
```

Then turn the plugin on in Settings → Community plugins, and reload Obsidian
after every later install.

`build:web` comes first and is not run for you: the plugin's build copies the
frame out of `packages/web/dist` and fails, naming what is missing, when that
build is absent or partial. `build:obsidian` vendors the frame into `frame/`
and then bundles `main.js` with the frame inside it; `build:plugin` alone
refuses, naming the file, when `frame/` is not there. `install:obsidian`
refuses when `main.js` is not built, copies `main.js`, `manifest.json` and
`styles.css` — what the Community plugins directory installs — and removes
the vault's `frame/`, so the plugin unpacks the one it carries on the next
start.

The plugin's manifest is the repository root's `manifest.json`, not one in
this package: the Community plugins directory reads it from there, and
`versions.json` beside it maps each version to the Obsidian it needs.

A release package — a zip with a `dbml-studio/` folder inside, to unzip into
`<vault>/.obsidian/plugins/`:

```bash
yarn build:web && yarn package:obsidian
```

Releasing — the tag, the GitHub release and its files — is
`yarn workspace obsidian-plugin release:github <version>`; see
`docs/releasing.md`, "The Obsidian plugin".

## How it works

The plugin is a host, not a second visualizer. `frame/embed.html` is
`packages/web`'s frame as one self-contained document: `scripts/vendor-frame.mjs`
walks `packages/web/dist/.vite/manifest.json` by the rule in
`packages/web/README.md` ("Packaging the frame from the manifest"), bundles
the frame's chunks into one inline module script with esbuild, and puts the
stylesheet inline too. The result is about 11.6 MB of HTML and names no other
file. `frame/BUILD` names the commit it was built from.

`scripts/build-plugin.mjs` then puts both into `main.js` with esbuild's
`define` — the document gzipped and base64-encoded (about 2.4 MB of
`main.js`), `BUILD` as it is — and refuses to build when `frame/` is not
there. The directory installs `main.js`, `manifest.json` and `styles.css` and
nothing else, so the frame travels the only way it can. On load,
`src/frameArchive.ts` compares the plugin folder's `frame/BUILD` with the
carried one and, when it is missing or different, unpacks the document with
the browser's own `DecompressionStream` and writes it through the vault
adapter (the plugin folder is not a vault file, so `Vault` does not address
it), `BUILD` last: a write cut short leaves no `BUILD` claiming a whole frame.
Blocks wait for this before they create a frame element.

One file because it has to be. Obsidian serves the plugin folder through
`getResourcePath`, and a document loaded that way runs inline scripts but has
every external script it names refused (`net::ERR_BLOCKED_BY_CLIENT`, found
in the live app 2026-09-25). A `blob:` URL would run with the window's own
origin and `srcdoc` with none, so neither is used. If Obsidian ever starts
allowing an external script from a `getResourcePath` document, `frame/` could
go back to the multi-file shape `packages/mkdocs-dbml` vendors — but until
then the build refuses, naming the chunk, a frame it cannot inline: a dynamic
import, an emitted asset, `url(` in the CSS, or `</script` / `<!--` in the
JavaScript.

The plugin reads the model and hands its text to the frame with a `document`
message of the `dbml-frame` protocol; a theme change travels as `theme`, and
the frame asks to be expanded with `expand`. The vocabulary is
`packages/web/src/embed/frameHost.ts`, imported by `src/hostProtocol.ts`, so a
change to a message there breaks this package's type check. The frame is
told apart from every other window by identity — the window the plugin
created — rather than by origin, because the Obsidian window and the frame
never share one.

Each block draws in its own window: a note opened in a popout keeps its own
document, and the block's frame, its message listener and its expand lock
all live there rather than in Obsidian's main window. At most one diagram is
expanded per window at a time — a second expand in the same window puts the
first back; Escape does too.

An expanded diagram covers the note's pane, not the whole window. Its box is
`position: fixed`, and Obsidian's workspace leaf contains `fixed` (found in
the live app, Obsidian 1.13.7), so the pane is what it fills; the frame's
toolbar stays visible, and puts it back. That is accepted: the spec asks for
a diagram expanded over the workspace, and the note's pane is where the
reader was working.

A note's tab dragged into another window takes its blocks along without
rendering them again, and each frame reloads there. The plugin follows through
the element's `onWindowMigrated` hook. Each diagram:

- is released from the old window's expand lock, so that window is unlocked
  and an expanded diagram arrives collapsed
- moves its listener and poster to the new window
- reloads in the application's theme, and greets the reloaded frame with its
  model in that theme

The plugin's code, though, runs in the main window, and a browser stamps a
message's `event.source` with the window of the code that calls
`postMessage` — so a popout's frame, posted to directly, would hear the main
window and drop everything, since it accepts only its parent. Each
`FrameView` therefore posts through a one-line function compiled by its own
window's `Function` constructor, which speaks as that window whoever calls it.

A frame loads only when its block first comes on screen. Obsidian renders
every block twice while a note is open — reading view, and the Live Preview
editor it keeps hidden — and each frame is the 11.6 MB document above, some
70 MB once running. The frame element is placed at its full height at once,
but gets its `src` from an `IntersectionObserver` of the block's own window,
so the hidden copy never loads. The model sent before then waits for the
frame's hello. The theme in the frame's URL, which it paints in before the
hello, is read when `src` is written, not when the block rendered: a diagram
scrolled to after a theme switch loads in the new theme.

Measured in Obsidian 1.13.7 with four diagrams in a note: the frames load in
0.5–1.4 s and the diagrams are visible about 1.8 s after the note opens.
Obsidian's main window never stalls (worst 1 ms), because the frames run out
of process; each loaded frame costs about 70 MB.

All the text a reader of a note sees — block errors, the read failure, the
command name — is English, or Russian when Obsidian's own language is
Russian. The plugin asks Obsidian with `getLanguage()` on load (Obsidian
restarts to change language). The two catalogs are `src/i18n/locales/en.ts`
and `ru.ts`, one shape (`src/i18n/catalog.ts`); `src/i18n/locales/` is the one
path the repository's Cyrillic guard
(`packages/json-table-schema-visualizer/src/i18n/__tests__/sourceLanguage.test.ts`)
excludes from its "no Cyrillic outside a locale file" rule. Everywhere else
in this package's source stays English.

## Tests

```bash
yarn workspace obsidian-plugin test
```

Jest in jsdom, over the pure modules and the frame's side of the
conversation; one test spawns `scripts/vendor-frame.mjs` against a fixture
`dist` and runs the script it inlines. `main.test.ts` runs the plugin itself
against a stand-in for the `obsidian` module, which ships types only. The
wiring into Obsidian — windows, views, scrolling, the theme — is checked by
hand, against a real vault: `docs/test-cases.md`, section 14.
