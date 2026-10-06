# DBML Studio

## DBML Studio for Obsidian

Draws a DBML model as an ER diagram inside a note: a `dbml` code block names a
`.dbml` file, and the plugin draws the whole model or the tables the block
lists, in Obsidian's light or dark theme.

Install it from Obsidian, once the plugin is listed there: **Settings →
Community plugins → Browse**, search for "DBML Studio". Until then, and for
any version, the zip on its GitHub release installs by hand. Desktop only. How to write a block, and everything else:
[packages/obsidian-plugin/README.md](./packages/obsidian-plugin/README.md).

What the plugin does beyond the note:

- **It reads files outside the vault.** A block names a model file by path,
  and that path may lead out of the vault (`model: /../models/rd.dbml`): the
  models usually live beside the documentation they describe, not in the
  vault. The plugin reads only the files blocks name, and writes none of them.
- **It uses no network.** Nothing is downloaded or sent anywhere.
- **It unpacks its own diagram frame.** The diagram is drawn by a page that
  ships inside the plugin's `main.js`. On the first start, and after each
  update, the plugin writes that page to `frame/` in its own plugin folder,
  because a diagram page has to be a file there to load. Nothing is fetched.
  That page sits in `main.js` gzipped and base64-encoded, to keep the file
  small, not to hide it: it is the build of [`packages/web`](./packages/web)
  in this repository (`embed.html`, its scripts and styles inlined), and
  `yarn build:web && yarn package:obsidian` rebuilds it, with `main.js`
  around it, from source.

---

A DBML workbench for VS Code — ERD diagrams, PostgreSQL import, and live database comparison — plus the same diagram as a website you can host yourself and embed in documentation.

![DBML Studio](./assets/demo.gif)

_A fictional library schema — the model is in [`examples/library.dbml`](./examples/library.dbml)._

> **Fork notice.** This repository is a fork of [BOCOVO/db-schema-visualizer](https://github.com/BOCOVO/db-schema-visualizer), maintained independently under the [MIT License](./LICENSE). The original project and its authors are credited below; modifications in this fork are maintained by [AKonyshev](https://github.com/AKonyshev).

## Features

- Create entity-relationship diagrams from DBML code
- Light and dark themes
- DBML extension: text/diagram switching in one tab, MetaInfo layout persistence, SVG/AsciiDoc export, per-table relation visibility (icon or H)
- Colored and animated relations, plus keyboard shortcuts for the view actions with a built-in legend (`?`). The shortcuts are bare letters, so they act while the diagram has focus and stay out of the way while you are typing: click the canvas first if the caret is in the editor beside it. In the extension every one of them is a command you can rebind
- Bring back every relation you have hidden at once, from the toolbar or with `R`
- **Fork additions (DBML):** import a PostgreSQL schema to DBML, compare an open `.dbml` file with a live database

## Install

### Upstream (original author)

- [bocovo.dbml-erd-visualizer](https://marketplace.visualstudio.com/items?itemName=bocovo.dbml-erd-visualizer)
- [bocovo.prisma-erd-visualizer](https://marketplace.visualstudio.com/items?itemName=bocovo.prisma-erd-visualizer)

### From source

```bash
git clone https://github.com/AKonyshev/dbml-studio.git
cd dbml-studio
yarn install
yarn workspace mkdocs-dbml setup
```

The last line creates the MkDocs plugin's Python environment (Python 3.10 or
later). Every commit runs every package's tests, the plugin's among them, so
without it the first commit stops and says to run exactly this.

Open the repo in VS Code or Cursor, then **Run and Debug → Debug DBML Extension** (`F5`). See [packages/dbml-vs-code-extension/TESTING.md](./packages/dbml-vs-code-extension/TESTING.md) for manual test steps.

## The site

The same viewer runs as a web page — a DBML editor beside the diagram it
describes — for people who will not be installing an editor to read a schema
someone sent them. It has no backend: nothing you open leaves the browser, which
is what lets it be deployed inside a closed network.

```bash
docker compose up --build
```

See [packages/web/README.md](./packages/web/README.md) for local development,
the container image, and the tests.

## In a MkDocs site

The same diagram as a block in a MkDocs page. A plugin puts the frame into the
site and checks every model against the rules the frame draws by, so a page
that names a table the model does not have fails `mkdocs build --strict`
instead of shipping an error message.

See [packages/mkdocs-dbml/README.md](./packages/mkdocs-dbml/README.md).

## In an Obsidian vault

The same diagram in a note: a `dbml` block names a model on disk, and a
desktop plugin reads it and hands it to the frame. Theme, table filter,
height and expanding to the whole window work as they do on a documentation
page.

It is installed from Obsidian's Community plugins (see the top of this page).
See [packages/obsidian-plugin/README.md](./packages/obsidian-plugin/README.md).

## Extension packages

- [DBML extension](./packages/dbml-vs-code-extension/README.md)
- [The site](./packages/web/README.md)
- [MkDocs plugin](./packages/mkdocs-dbml/README.md)
- [Obsidian plugin](./packages/obsidian-plugin/README.md)

## Attribution & license

This software is licensed under the [MIT License](./LICENSE). Per the license, the copyright notice and permission notice are included in distributions of this project.

|                     |                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Upstream**        | [BOCOVO/db-schema-visualizer](https://github.com/BOCOVO/db-schema-visualizer) — original ERD visualizer for DBML and Prisma  |
| **Original author** | [@BOCOVO](https://github.com/BOCOVO)                                                                                         |
| **This fork**       | [AKonyshev/dbml-studio](https://github.com/AKonyshev/dbml-studio) — maintained by [@AKonyshev](https://github.com/AKonyshev) |

Upstream tutorials (still useful for core diagram features):

- [Preview DBML from VS Code](https://juste.bocovo.me/preview-dbml-code-from-vscode)

## Contribute

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). For upstream changes, consider contributing to [BOCOVO/db-schema-visualizer](https://github.com/BOCOVO/db-schema-visualizer) first when the change is not fork-specific.
