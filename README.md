# DBML Studio

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
```

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

## Extension packages

- [DBML extension](./packages/dbml-vs-code-extension/README.md)
- [The site](./packages/web/README.md)

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
