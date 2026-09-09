# DBML Studio

A DBML workbench for VS Code: read a schema as an entity-relationship diagram, import one from a live PostgreSQL database, and diff a `.dbml` file against the database it describes.

![DBML Studio: a DBML file on the left, its diagram on the right — tables chosen with a marquee and moved together, keys and mandatory columns marked, relations painted by their source table](https://raw.githubusercontent.com/AKonyshev/dbml-studio/main/assets/demo.gif)

_A fictional library schema — the model is in [`examples/library.dbml`](https://github.com/AKonyshev/dbml-studio/blob/main/examples/library.dbml)._

> **Unofficial fork.** Not affiliated with, or endorsed by, the authors of the original project. Based on [BOCOVO/db-schema-visualizer](https://github.com/BOCOVO/db-schema-visualizer) ([MIT License](./LICENCE)); maintained independently by [AKonyshev](https://github.com/AKonyshev). This is a separate extension with its own identifier, commands, and settings — installing it leaves the original alone.

## What this fork adds

- **Import from PostgreSQL** — command palette → **DBML: Import from database**. A saved connection stands for a whole server: the side bar opens it into its databases and their schemas, and one import can take several databases at once, writing one `.dbml` file per database with every schema you picked inside it. Connections live in the DBML side bar and their credentials go to the VS Code secret store.
- **Compare with a live database** — open a `.dbml` file, then **DBML: Compare with database**, and see where the file and the database have drifted apart.
- **A layout that lives in the file** — drag tables about and the positions are written into a `MetaInfo` block in the DBML itself, one arrangement per detail level, so the diagram opens as you left it on any machine.
- **Export** the diagram as PNG, SVG, AsciiDoc, or Markdown.
- **Interface in English, Russian, and Simplified Chinese**, following your VS Code display language.
- **Keyboard shortcuts** for every view action, with a built-in legend (`?`).

## Diagram

- Entity-relationship diagram from your DBML file
- Light and dark themes
- Display modes: all columns, relational columns only, or table headers only
- Hide/show relations per table via the icon in the table header, or **H** for the table under the pointer; it is a view preference and nothing is written to the file
- Bring every hidden relation back at once, from the toolbar button or **R**
- Colored relations: either one neutral colour for all of them, or each relation painted in its source table's colour
- Relation animation: the relations of the table under the cursor animate to show their direction

## Keyboard shortcuts

Every view action is a command, so the keys below are defaults rather than fixtures: rebind any of them in **Preferences: Open Keyboard Shortcuts** by searching for `DBML`, and run any of them from the command palette. They apply while the diagram has focus and nowhere else.

| Key              | Command                                        |
| ---------------- | ---------------------------------------------- |
| `C`              | Colored relations                              |
| `A`              | Relation animation                             |
| `S`              | Short table names                              |
| `D`              | Cycle detail level                             |
| `V`              | Switch between pan and select                  |
| `L`              | Auto-arrange                                   |
| `F`              | Fit to view                                    |
| `H`              | Hide/show the hovered table's relations        |
| `R`              | Show all hidden relations                      |
| `T`              | Cycle the hovered table's detail level         |
| `U`              | Give every table the shared level back         |
| `F2`             | Edit the column, or rename the table           |
| `Ctrl/Cmd+Enter` | Add a column below the one you are pointing at |
| `?`              | Show the shortcuts legend                      |

Two keys belong to the diagram itself and are not commands: `Esc` closes the legend, and `Ctrl/Cmd+F` opens the table search.

Clicking a table points at it, in either mode: it is outlined, and any column you were pointing at lets go. Clicking empty canvas or pressing `Esc` drops the outline. Adding tables to a group with `Shift` is a select-mode thing, because a group of two or more is what makes one drag move them all, and a drag in pan mode is meant to move one table or the canvas.

None of these keys fires while you are typing, in the diagram's own search box or anywhere else in the editor.

`?` is where a US layout puts it. On a layout that puts it elsewhere, use the keyboard button in the toolbar or rebind the command.

Every command is also in the palette, with one exception: hiding the hovered table's relations acts on whatever the pointer is over, and opening the palette takes the pointer away, so it would always find nothing. Use the key for that one, or rebind it.

The same list is available in the app: press `?` or use the keyboard button in the toolbar. It shows the defaults, not a key you have rebound.

## Editing from the diagram

Click a column to point at it, then press `F2` or double-click it. A box opens on the column holding the line exactly as it stands in the `.dbml` file, so anything DBML lets you write on a column you can write here.

| Key                     | What it does                               |
| ----------------------- | ------------------------------------------ |
| `Enter`                 | Apply and close                            |
| `Shift+Enter`           | Insert a line break, for a multi-line note |
| `Ctrl+Enter`            | Apply, then add a column below             |
| `Ctrl+Delete`           | Delete the column                          |
| `Ctrl+Up` / `Ctrl+Down` | Move the column                            |
| `Tab`                   | Apply and move to the row below            |
| `Escape`                | Throw the edit away                        |

Clicking anywhere else applies the edit and closes the box, the way a spreadsheet cell does. `Escape` is how you throw typing away.

`Ctrl/Cmd+Enter` adds a column below the one you are pointing at, or at the end of the table if you are pointing at a table rather than one of its columns, without opening anything first, and puts the box on the new column so you can name it. Inside the box the same chord applies what you typed and then adds one. The new column is called `new_column`, or `new_column_2` and so on where the table already holds that name.

`F2` aims at whatever the pointer is on: a column edits that column, anywhere else on a table renames the table — a column you clicked earlier and left outlined does not get in the way. Click empty canvas or press `Escape` to drop that outline. This is the same habit `H` and `T` already have. With the pointer off the diagram it falls back to the last column you clicked, or to a single selected table. The new name follows through to every relation that names it and to the layout the file carries, and the table keeps its position, its colour is recomputed from the new name.

Only the ranges you changed are written, so one undo takes back one edit and the rest of your file is untouched. Text that would not parse is refused before it reaches the file, with the parser's own message. A schema that has never been saved offers no editing at all; a file that cannot be written to says so when you apply.

## Languages

The interface follows your VS Code display language: English, Russian (`ru`) and Simplified Chinese (`zh-cn`). Any other display language falls back to English — including Traditional Chinese (`zh-tw`), because mainland and Taiwan terminology differ enough that showing Simplified would be misleading.

The Chinese translation is a community contribution and has not been reviewed by a native speaker. Corrections are welcome — the catalogs live in `packages/json-table-schema-visualizer/src/i18n/locales/` and `packages/dbml-vs-code-extension/l10n/`.

## Extension settings

- `dbmlStudio.preferredTheme` — `light` or `dark` (default: `dark`)
- `dbmlStudio.scrollDirection` — `up-out` or `up-in` (default: `up-out`)

## Release notes

[CHANGELOG.md](./CHANGELOG.md)

## Attribution

|               |                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Upstream**  | [BOCOVO/db-schema-visualizer](https://github.com/BOCOVO/db-schema-visualizer) by [@BOCOVO](https://github.com/BOCOVO) |
| **This fork** | [AKonyshev/dbml-studio](https://github.com/AKonyshev/dbml-studio) by [@AKonyshev](https://github.com/AKonyshev)       |

Licensed under the [MIT License](./LICENCE).
