# DBML Studio for Obsidian

Draws a `.dbml` model as an ER diagram inside a note — the same diagram frame
the documentation sites embed, fed by the plugin instead of by a web server.

Desktop only: the plugin reads the model from disk with Node's `fs`, and the
models it is written for live outside the vault.

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

## Commands

- **Обновить диаграммы** — re-reads every model on screen and sends it to its
  diagram again. Tables keep their places; new ones are laid out. The plugin
  does not watch the files.

## Build and install

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
build is absent or partial. `install:obsidian` likewise refuses, naming the
file, when `main.js` or `frame/embed.html` is not built, rather than install a
plugin that turns on and draws nothing.

A release package — a zip with a `dbml-studio/` folder inside, to unzip into
`<vault>/.obsidian/plugins/`:

```bash
yarn build:web && yarn package:obsidian
```

## How it works

The plugin is a host, not a second visualizer. `frame/embed.html` is
`packages/web`'s frame as one self-contained document: `scripts/vendor-frame.mjs`
walks `packages/web/dist/.vite/manifest.json` by the rule in
`packages/web/README.md` ("Packaging the frame from the manifest"), bundles
the frame's chunks into one inline module script with esbuild, and puts the
stylesheet inline too. The result is about 11.6 MB of HTML and names no other
file. `frame/BUILD` names the commit it was built from.

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
all live there rather than in Obsidian's main window. A diagram taking the
whole window covers only the window it is in, and at most one diagram is
expanded per window at a time — a second expand in the same window puts the
first back; Escape does too.

A note's tab dragged into another window takes its blocks along without
rendering them again, and each frame reloads there. The plugin follows through
the element's `onWindowMigrated` hook. Each diagram:

- is released from the old window's expand lock
- moves its listener and poster to the new window
- greets the reloaded frame with its model, in the application's theme

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
frame's hello.

All the text a reader of a note sees — block errors, the read failure, the
command name — is Russian and lives in `src/i18n/locales/ru.ts`, the one path
the repository's Cyrillic guard
(`packages/json-table-schema-visualizer/src/i18n/__tests__/sourceLanguage.test.ts`)
excludes from its "no Cyrillic outside a locale file" rule. Everywhere else
in this package's source stays English.

## Tests

```bash
yarn workspace obsidian-plugin test
```

Jest in jsdom, over the pure modules and the frame's side of the
conversation; one test spawns `scripts/vendor-frame.mjs` against a fixture
`dist` and runs the script it inlines. The wiring into Obsidian itself is
checked by hand, against a real vault: `docs/test-cases.md`, section 14.
