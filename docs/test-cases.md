# Test cases

What this repository ships, said as things a person can check. One row per
behaviour, written so that someone who has never opened the code can run it.

Three products come out of these packages, and they share a diagram:

| Product                             | Where                              | Runs on                               |
| ----------------------------------- | ---------------------------------- | ------------------------------------- |
| **Web app**                         | `packages/web`                     | a browser, at `/`                     |
| **Embedded frame**                  | `packages/web`, entry `embed.html` | an `<iframe>` in a documentation page |
| **VS Code extension** (DBML Studio) | `packages/dbml-vs-code-extension`  | VS Code                               |

The diagram itself is `packages/json-table-schema-visualizer`, and all three
hosts draw with it. A case marked **all hosts** has to hold in each of them.

**Automated** in the last column names the test that already covers the case, so
a case with a name there is not a manual chore — it is there to say what the
automation is asserting. **Manual** means nobody has automated it yet.

Run the automation with:

```bash
yarn typecheck && yarn test && yarn build:web && yarn test:e2e
```

and the extension's own suite, which is not in that sweep, with:

```bash
yarn workspace dbml-studio test:integration
```

---

## 1. Reading a schema

| #   | Case                                   | Steps                                            | Expected                                                                      | Automated                                  |
| --- | -------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------ |
| 1.1 | A valid file draws                     | Open a `.dbml` file with two related tables      | Both tables are drawn, with a line between them                               | `site.spec.ts` — built site works          |
| 1.2 | A syntax error is named, not swallowed | Type `Table {` into the editor                   | The message names the line and column; the last good diagram stays on screen  | Manual                                     |
| 1.3 | An empty file                          | Open a file with no tables                       | An empty-state message, no canvas errors                                      | Manual                                     |
| 1.4 | Enums draw                             | Open a file with an `Enum` used by a column      | The column's type shows the enum name; hovering it lists the values           | Manual                                     |
| 1.5 | Notes draw                             | Give a column a `note`                           | Hovering the column shows the note                                            | Manual                                     |
| 1.6 | Schema-qualified names                 | Two tables of the same name in different schemas | Both are drawn, each headed with its schema                                   | `dbml-to-json-table-schema` unit tests     |
| 1.7 | A large model opens                    | Open a model of 150 tables                       | Every table is laid out, in a shape that is not a strip, inside a time budget | `embed.spec.ts` — hundred and fifty tables |

## 2. Column notation — all hosts

The marks a reader sees on a column. Their meanings are also listed in the
legend; case 6.3 checks the two agree.

| #   | Case                                    | Steps                                                    | Expected                                                                          | Automated             |
| --- | --------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------- |
| 2.1 | Primary key                             | A column with `[pk]`                                     | Name in bold in the table's colour, and a `PK` pill                               | `fieldMarks.test.ts`  |
| 2.2 | Foreign key                             | The many side of a `Ref`                                 | An `FK` pill on that column and not on the one it points at                       | `foreignKeys.test.ts` |
| 2.3 | Unique                                  | A column with `[unique]` and no `[pk]`                   | A `UK` pill                                                                       | `fieldMarks.test.ts`  |
| 2.4 | A primary key is not also badged unique | `[pk, unique]`                                           | `PK` only — the second pill would say nothing                                     | `fieldMarks.test.ts`  |
| 2.5 | Mandatory                               | A column with `[not null]`                               | `*` after the type                                                                | `fieldMarks.test.ts`  |
| 2.6 | Optional                                | A column with neither                                    | No mark at all, and the legend says an unmarked column may be null                | `fieldMarks.test.ts`  |
| 2.7 | One-to-one is not guessed               | `Ref: a.id - b.id`, both primary keys                    | Neither column is badged `FK`                                                     | `foreignKeys.test.ts` |
| 2.8 | A badge never overhangs                 | A table whose widest column carries `PK FK`              | The pill's right edge is inside the table's box                                   | `fieldMarks.test.ts`  |
| 2.9 | Badges survive a filtered diagram       | Embed frame with `tables=` naming one side of a relation | The kept table draws, and no badge claims a relation to a table that is not there | `foreignKeys.test.ts` |

## 3. Moving about the diagram — all hosts

| #   | Case                                          | Steps                                           | Expected                                                   | Automated                                |
| --- | --------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| 3.1 | Pan                                           | Drag empty canvas in pan mode                   | The view moves; nothing is selected                        | Manual                                   |
| 3.2 | Zoom                                          | Scroll over the canvas                          | Zoom centres on the pointer                                | `computeWheelZoom` unit tests            |
| 3.3 | Scroll direction setting                      | Flip the setting, scroll again                  | Zoom goes the other way                                    | `computeWheelZoom` unit tests            |
| 3.4 | Fit to view                                   | Press `F` after panning away                    | The whole diagram is framed                                | `embed.spec.ts` — arrives already framed |
| 3.5 | Move one table                                | Drag a table                                    | It follows the pointer and its relations follow it         | `site.spec.ts` — group drag              |
| 3.6 | Auto-arrange                                  | Press `L`                                       | Tables are rearranged and the view is re-framed onto them  | Manual                                   |
| 3.7 | The container loses its size and gets it back | Hide the pane holding the diagram, then show it | The diagram is drawn again at the new size, not left blank | `site.spec.ts` — recovers after no size  |

## 4. Group selection — all hosts

| #    | Case                                      | Steps                                                      | Expected                                                                         | Automated                                  |
| ---- | ----------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------ |
| 4.1  | Enter and leave the mode                  | Press `V`, then `V` again                                  | The toolbar button reads Select, then Pan                                        | Manual                                     |
| 4.2  | The mode does not survive a reload        | Press `V`, reload                                          | Back in pan mode                                                                 | `interactionModeStore.test.ts`             |
| 4.3  | Marquee catches by overlap                | Drag a rectangle that clips a table's corner               | That table is selected                                                           | `selectionFromMarquee.test.ts`             |
| 4.4  | Marquee dragged up and left               | Drag from bottom-right to top-left                         | Same tables caught as the other way round                                        | `selectionFromMarquee.test.ts`             |
| 4.5  | Shift adds                                | Shift-drag a second rectangle                              | The first selection is kept and added to                                         | `selectionFromMarquee.test.ts`             |
| 4.6  | Click selects one                         | Click a table in select mode                               | Only it is selected                                                              | `site.spec.ts` — shift adds and takes away |
| 4.7  | Shift-click toggles                       | Shift-click a selected table                               | It leaves the selection                                                          | `site.spec.ts`                             |
| 4.8  | Click on empty canvas clears              | Click nothing                                              | Nothing is selected                                                              | `selectionFromMarquee.test.ts`             |
| 4.9  | Group move                                | Select two tables, drag one                                | Both move by the same amount, relations follow                                   | `site.spec.ts`                             |
| 4.10 | The move is stored                        | After a group move, reload                                 | The tables are where they were left                                              | `site.spec.ts`                             |
| 4.11 | Dragging an unselected table              | With a group selected, drag a table outside it             | The selection becomes that one table, and only it moves                          | Manual                                     |
| 4.12 | Escape clears                             | Press Escape with a selection, or with a column pointed at | Nothing is selected and no column is pointed at                                  | `site.spec.ts`                             |
| 4.13 | Escape with nothing selected is not taken | Press Escape with no selection, inside an expanded frame   | The frame collapses — the key was not spent                                      | `embed.spec.ts` — Escape puts it back      |
| 4.14 | Escape in the editor is not taken         | Type in the editor with a selection, press Escape          | The editor gets the key; the selection is left alone                             | Manual                                     |
| 4.15 | Leaving the mode clears                   | Select tables, press `V`                                   | Nothing is selected                                                              | `site.spec.ts`                             |
| 4.16 | Space pans without losing the selection   | Hold space, drag, release                                  | The view moves, nothing is deselected, no marquee is drawn                       | `site.spec.ts`                             |
| 4.17 | Space is left to a focused button         | Focus a toolbar button in select mode, press space         | The button activates                                                             | `isTypingTarget.test.ts`                   |
| 4.18 | Middle button pans                        | Middle-drag in select mode                                 | The view moves                                                                   | Manual                                     |
| 4.19 | A pan released off the canvas             | Middle-drag, leave the canvas, release                     | Select mode still works — the next drag draws a marquee and does not pan         | `site.spec.ts`                             |
| 4.20 | Selection does not cross documents        | Select tables, open another schema                         | Nothing is selected                                                              | Manual                                     |
| 4.21 | A column takes the selection away         | Select tables, click a column                              | The tables are deselected and the column is outlined; clicking a table undoes it | `currentTarget.test.ts`                    |

## 5. Detail levels, relations and appearance — all hosts

| #    | Case                                             | Steps                                                                            | Expected                                                                                                        | Automated                                             |
| ---- | ------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 5.1  | Detail level cycles                              | Press `D` three times                                                            | Full → headers → keys → full                                                                                    | Manual                                                |
| 5.2  | Each level has its own layout                    | Arrange at full detail, press `D`, come back                                     | The arrangement you made is back, exactly                                                                       | `detailLevelLayout.test.ts`                           |
| 5.3  | Changing level re-frames                         | Press `D` in a short frame                                                       | The diagram is framed for what is now drawn                                                                     | `embed.spec.ts` — re-frames the diagram               |
| 5.4  | Table widths do not move with the level          | Press `D`                                                                        | Tables keep their width; only height changes                                                                    | `computeTableDimension.test.ts`                       |
| 5.5  | Relation style                                   | Toggle right angles / curves                                                     | Lines redraw, and auto-arrange leaves more room for right angles                                                | `computeOrthogonalEdge.test.ts`                       |
| 5.6  | Hide one table's relations                       | Click the link glyph in a table header                                           | Its relations vanish, the glyph is struck through, the table gets a dashed outline                              | `site.spec.ts` — changes the view and not the file    |
| 5.7  | `H` does the same                                | Hover a table, press `H`                                                         | Exactly as 5.6                                                                                                  | `matchShortcut.test.ts`, `site.spec.ts`               |
| 5.8  | Hiding relations writes nothing to the file      | Watch the editor through 5.6                                                     | The text is untouched; no `Ref` is commented out                                                                | `site.spec.ts`                                        |
| 5.9  | Hidden relations survive a reload                | Hide, reload                                                                     | Still hidden — remembered per document, not in the file                                                         | `site.spec.ts`                                        |
| 5.10 | Coloured relations                               | Press `C`                                                                        | Every relation takes its source table's colour                                                                  | Manual                                                |
| 5.11 | Animation                                        | Press `A`, hover a table                                                         | Its relations show travelling dashes; others stay still                                                         | Manual                                                |
| 5.12 | Short table names                                | Press `S`                                                                        | Schema prefixes drop from the headers                                                                           | Manual                                                |
| 5.13 | Hover highlight                                  | Hover a table                                                                    | It and its related columns are picked out                                                                       | `shouldHighLightCol.test.ts`                          |
| 5.14 | Always-hover setting                             | Turn it on                                                                       | Highlighting stays without the pointer                                                                          | Manual                                                |
| 5.15 | Theme                                            | Toggle light / dark                                                              | Canvas and chrome change together — the canvas has its own palette and can be wrong on its own                  | `embed.spec.ts` — theme reaches the canvas            |
| 5.16 | Jump along a relation                            | Click the disc on a relation line                                                | The view moves to the other end                                                                                 | Manual                                                |
| 5.17 | Bring every hidden relation back                 | Hide two tables' relations, click the reset button in the toolbar (or press `R`) | Both tables draw their relations again and lose the dashed outline; the file is untouched                       | `toggleTableRelations.test.ts`                        |
| 5.18 | The reset button says whether it can do anything | Open a diagram with nothing hidden                                               | The button is dimmed and does nothing; it lights up as soon as one table is hidden and dims again after a reset | `toggleTableRelations.test.ts` — `hasHiddenRelations` |
| 5.19 | A reset stays on its own document                | Hide in one file, reset in another                                               | The first file's tables are still hidden when you return to it                                                  | `toggleTableRelations.test.ts`                        |
| 5.20 | One table's detail level                         | Hover a table, press `T`                                                         | That table alone cycles full detail, headers, key columns; the rest of the diagram is untouched                 | `tableDetailLevelStore.test.ts`                       |
| 5.21 | A table set apart keeps its level                | Set one table apart, then press `D`                                              | The diagram changes level around it and that table stays as you left it                                         | `tableDetailLevelStore.test.ts`                       |
| 5.22 | Back to one level                                | Set two tables apart, press `U`                                                  | Both rejoin the diagram's level; a second press does nothing                                                    | `tableDetailLevelStore.test.ts`                       |
| 5.23 | Levels stay on their own document                | Set a table apart, open another file, come back                                  | The table is as you left it and the other file never saw it                                                     | `switchDocument.test.ts`                              |
| 5.24 | Fit to view after collapsing one table           | Collapse a tall table, press `F`                                                 | The diagram is framed for what is drawn, with no empty band where the table used to reach                       | `diagramBounds.test.ts`                               |
| 5.25 | Relation ends follow their own table             | Collapse one end of a relation                                                   | The line meets that table at its header and its other end still at the right column                             | `relationEndY.test.ts`                                |
| 5.26 | Double click the header                          | Double-click a table's header                                                    | Its level changes; the table is not dragged and the selection does not change                                   | Manual                                                |
| 5.27 | The reset button says whether it can do anything | Open a diagram with nothing set apart                                            | The button beside the level toggle is dimmed; it lights up as soon as one table is set apart and dims after `U` | `tableDetailLevelStore.test.ts` — `hasOverrides`      |
| 5.28 | A marquee misses a collapsed table               | Collapse a tall table, drag a marquee through the space it used to fill          | It is not selected; the same drag catches it while it is drawn in full                                          | `drawnBoxes.test.ts`                                  |

## 6. Search and legend — all hosts

| #   | Case                               | Steps                           | Expected                                                                                   | Automated                                         |
| --- | ---------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| 6.1 | Find a table                       | `Ctrl/Cmd+F`, type a table name | It is listed; choosing it centres the diagram on it and flashes its border                 | Manual                                            |
| 6.2 | Find a column                      | Type a column name              | Listed with its table; choosing it highlights the column                                   | Manual                                            |
| 6.3 | Legend matches the diagram         | Press `?`                       | Two sections — Notation and Keyboard shortcuts — and every mark in section 2 above appears | `embed.spec.ts` — legend says what the marks mean |
| 6.4 | Every shortcut in the legend fires | Press each key the legend lists | Each does what its row says                                                                | `matchShortcut.test.ts`                           |
| 6.5 | The legend fits a short frame      | Open it in a 420px-tall frame   | It scrolls inside the frame rather than overflowing                                        | `embed.spec.ts`                                   |
| 6.6 | Escape closes the legend           | Press Escape                    | It closes, and nothing else reacts to that keypress                                        | Manual                                            |

## 7. Export and layout — web app and extension

| #    | Case                                                | Steps                                                     | Expected                                                                                  | Automated                                        |
| ---- | --------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 7.1  | PNG                                                 | Export → PNG                                              | A `.png` downloads showing the whole diagram, not just the visible part                   | `site.spec.ts` — exported image                  |
| 7.2  | SVG                                                 | Export → SVG                                              | A `.svg` downloads naming every table                                                     | `site.spec.ts` — exported file names every table |
| 7.3  | AsciiDoc                                            | Export → AsciiDoc                                         | Tables and columns are listed as an AsciiDoc table                                        | `exportAsciiDoc.test.ts`, `site.spec.ts`         |
| 7.4  | Markdown                                            | Export → Markdown                                         | The same, as Markdown                                                                     | `exportMarkdown.test.ts`, `site.spec.ts`         |
| 7.5  | Download the schema                                 | Web app → Download                                        | The `.dbml` matches the editor's text                                                     | Manual                                           |
| 7.6  | Save the layout                                     | Arrange tables, Save layout                               | A `/*MetaInfo … MetaInfo*/` block appears at the end of the text with the coordinates     | `writeLayoutIntoText.test.ts`                    |
| 7.7  | A layout is per detail level                        | Save at two levels                                        | The block holds a set of coordinates for each                                             | `tableCoordsMetaInfo.test.ts`                    |
| 7.8  | A saved layout is read back                         | Reopen a file carrying MetaInfo                           | Tables are where they were saved                                                          | `catalog.spec.ts` — layout saved and says so     |
| 7.9  | A layout written at another level is not misapplied | Open a file whose MetaInfo is header-only, at full detail | Tables are arranged afresh, not piled on each other                                       | `detailLevelLayout.test.ts`                      |
| 7.10 | Undo                                                | In the extension, save a layout then press Undo           | The MetaInfo block reverts                                                                | Manual                                           |
| 7.11 | Auto-arrange returns a dragged table                | Drag a table, press `L`                                   | It goes back to where the layout has it, also when that is where it stood before the drag | `autoArrange.test.ts`                            |

## 8. Web app — files and sessions

| #   | Case                                      | Steps                                          | Expected                                                       | Automated                                       |
| --- | ----------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------- |
| 8.1 | Open a local file                         | Open `.dbml`                                   | It is added to the tree and drawn                              | Manual                                          |
| 8.2 | Project catalogue                         | Deploy with `/schemas/`                        | The tree lists the project's models, and choosing one opens it | `catalog.spec.ts`                               |
| 8.3 | A reader's edit of a project file is kept | Edit a project file, reload                    | The edit is still there, marked as the reader's own            | `catalog.spec.ts`                               |
| 8.4 | Give a project file back                  | Use the revert action                          | The project's version returns                                  | `catalog.spec.ts`                               |
| 8.5 | Remove a file                             | Remove one from the tree                       | It goes, including one that never parsed                       | `catalog.spec.ts`                               |
| 8.6 | The tree can be hidden                    | Collapse the tree                              | The diagram takes the room, and the collapse survives a reload | Manual                                          |
| 8.7 | The session survives a reload             | Open two files, reload                         | Both are still open, with the same one active                  | `session.test.ts`                               |
| 8.8 | Nothing is fetched from the network       | Load the site with devtools open               | No request leaves the origin                                   | `site.spec.ts`                                  |
| 8.9 | Interface language                        | Set the browser to ru / zh-CN / something else | The interface follows, falling back to English                 | `resolveBrowserLocale.test.ts`, `embed.spec.ts` |

## 9. Embedded frame

The host page's half of this lives in the documentation repository
(`antora/docs/lib/dbml-frame-host.js`); cases 9.7–9.10 need both halves
deployed.

| #    | Case                                        | Steps                                      | Expected                                                                          | Automated             |
| ---- | ------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- | --------------------- |
| 9.1  | Draw one model                              | `embed.html?src=acl.dbml`                  | The model is drawn, and nothing but that one file is fetched                      | `embed.spec.ts`       |
| 9.2  | Filter tables                               | `&tables=a,b`                              | Only those tables and the relations between them                                  | `embed.spec.ts`       |
| 9.3  | A filtered diagram is arranged as itself    | Filter two tables out of an arranged model | They are placed near each other, not at the coordinates the whole model gave them | `embed.spec.ts`       |
| 9.4  | Theme from the query                        | `&theme=dark`                              | The frame opens dark, before the first paint                                      | Manual                |
| 9.5  | A path that leaves the catalogue is refused | `?src=../secret`                           | An error, and no request for that path                                            | `embedParams.test.ts` |
| 9.6  | Missing model, missing table                | `?src=nope.dbml`, `&tables=nope`           | Each is named on screen                                                           | `embed.spec.ts`       |
| 9.7  | Controls stay out of the way                | Load the frame, do not touch it            | No toolbar, no search box; both appear when the pointer is over the diagram       | `embed.spec.ts`       |
| 9.8  | `Ctrl/Cmd+F` while the search is hidden     | Press it without hovering                  | The browser's own find opens — the diagram does not take the key                  | `embed.spec.ts`       |
| 9.9  | Expand across the page                      | Hover, press the expand button             | The frame covers the page; the diagram re-frames to the new size                  | `embed.spec.ts`       |
| 9.10 | Escape collapses                            | Press Escape while expanded                | Back to the author's height                                                       | `embed.spec.ts`       |
| 9.11 | No button without a host                    | Open `embed.html` directly                 | No expand button — nothing would answer it                                        | `embed.spec.ts`       |
| 9.12 | The frame stores nothing                    | Use the frame, then read `localStorage`    | No key for this frame, and the full app's theme is untouched                      | `embed.spec.ts`       |
| 9.13 | Several frames on one page                  | A page with two `dbml::` blocks            | Both draw; expanding one collapses the other                                      | Manual                |

## 10. VS Code extension — DBML Studio

| #     | Case                                    | Steps                                    | Expected                                                      | Automated                                             |
| ----- | --------------------------------------- | ---------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| 10.1  | `.dbml` opens as text                   | Open the file                            | Text editor, language `dbml`, one title button — Show diagram | `test:integration`                                    |
| 10.2  | Open the diagram in place               | Alt-click the button                     | The diagram replaces the tab                                  | `test:integration`                                    |
| 10.3  | Open beside                             | Plain click                              | Text and diagram side by side                                 | `test:integration`                                    |
| 10.4  | Back to source                          | Show DBML source                         | The text replaces the diagram tab                             | `test:integration`                                    |
| 10.5  | Reopen Editor With…                     | Use the menu                             | Both the text editor and DBML Diagram are offered             | `test:integration`                                    |
| 10.6  | A dirty file switches without prompting | Edit, then switch views both ways        | No save prompt, and the dirty marker stays                    | Manual                                                |
| 10.7  | Two diagrams at once                    | Open two files, break one                | The other's Problems entries are untouched                    | Manual                                                |
| 10.8  | Live update                             | Edit the text with the diagram beside it | The diagram follows the text                                  | Manual                                                |
| 10.9  | Theme setting                           | Change `dbmlStudio.preferredTheme`       | The diagram follows                                           | Manual                                                |
| 10.10 | Scroll direction setting                | Change `dbmlStudio.scrollDirection`      | Zoom direction follows                                        | Manual                                                |
| 10.11 | Add a connection                        | Add a PostgreSQL connection              | It appears in the DBML Studio view                            | `connectionStore.test.ts`                             |
| 10.12 | Import from a database                  | Import from a connection                 | A `.dbml` is produced from the live schema                    | `importFromDatabase.test.ts`, `liveDatabase.test.ts`  |
| 10.13 | A bad connection is explained           | Import with wrong credentials            | The message says what failed, without the password in it      | `dbImportErrorMessage.test.ts`                        |
| 10.14 | Compare with a database                 | Compare a file against a connection      | A Markdown report of what differs                             | `compareWithDatabase.test.ts`, `liveDatabase.test.ts` |
| 10.15 | Delete a connection                     | Delete it                                | It goes from the view and from storage                        | `connectionStore.test.ts`                             |
| 10.16 | Commands are namespaced                 | Open the palette, type "DBML"            | Every command is `dbmlStudio.*`                               | Manual                                                |
| 10.17 | A command reaches the diagram           | Run any diagram command with one open    | The page acts on it — keys and the palette both go this way   | `hostRelay.test.ts` (`test:integration`)              |

## 10a. Editing from the diagram — VS Code extension

The only behaviour in this document that writes to the schema file. It exists in
the extension alone: the diagram is shared, but editing is a capability the host
lends it and neither the web app nor the embedded frame lends one.

| #       | Case                                     | Steps                                                                    | Expected                                                                          | Automated                    |
| ------- | ---------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------- |
| 10a.1   | Point at a column                        | Click a column                                                           | It is outlined; any selected tables are not                                       | `currentTarget.test.ts`      |
| 10a.2   | Open the editor                          | Press `F2`, or double-click the column                                   | A box opens on the column holding that line as it stands in the file              | Manual                       |
| 10a.3   | The first column of a table              | Open the editor on a table's first column                                | The text has no leading indentation, the same as any other column                 | `fieldRange.test.ts`         |
| 10a.4   | Apply                                    | Change the text, press `Enter`                                           | Only that line changes; the file is dirty, not saved                              | `fieldEditing.test.ts`       |
| 10a.5   | One undo takes back one edit             | Press `Ctrl/Cmd+Z` in the text editor                                    | The whole edit is gone and nothing else moved                                     | `fieldEditing.test.ts`       |
| 10a.6   | Text that does not parse                 | Type something DBML cannot parse, press `Enter`                          | The box stays open with the text and the parser's message; the file is untouched  | `planEdit.test.ts`           |
| 10a.7   | Discard                                  | Change the text, press `Escape`                                          | Nothing is written                                                                | `quickEditIntent.test.ts`    |
| 10a.8   | A multi-line note                        | Press `Shift+Enter`                                                      | A line break goes into the text rather than applying                              | `quickEditIntent.test.ts`    |
| 10a.9   | Add, delete, reorder                     | `Ctrl+Enter`, `Ctrl+Delete`, `Ctrl+Up` / `Ctrl+Down`                     | A column is added below, removed, moved                                           | `columnOps.test.ts`          |
| 10a.9a  | Add below after a rename                 | Rename a column in the box, press `Ctrl+Enter`                           | A new column opens below, aimed at the renamed one                                | `QuickEditPopup.test.tsx`    |
| 10a.9b  | Tab walks the rows                       | Press `Tab` in the box                                                   | The row drawn below opens; from the last row the box closes                       | `QuickEditPopup.test.tsx`    |
| 10a.9c  | Refusal keeps the box                    | Apply text the parser rejects                                            | The box stays open with the text and the reason                                   | `QuickEditPopup.test.tsx`    |
| 10a.9d  | Clicking away applies                    | Type, then click the canvas                                              | The edit is applied and the box closes                                            | `QuickEditPopup.test.tsx`    |
| 10a.10  | Comments and inline refs survive         | Edit a column whose line carries a `//` comment and a `ref:`             | Both are still there, unchanged, in the part you did not touch                    | `columnOps.test.ts`          |
| 10a.11  | The diagram's letters stay off           | With the box open, type `t` and `d`                                      | The letters go into the text; the diagram toggles nothing                         | Manual                       |
| 10a.12  | A column a relation depends on           | Delete a column another table's `Ref` points at                          | Refused with the parser's message; the file is untouched                          | `planEdit.test.ts`           |
| 10a.13  | Rename a table                           | Select one table, no column pointed at, press `F2`, rename               | The header and every `Ref` naming it follow; the layout entry in the file follows | `renameOp.test.ts`           |
| 10a.13a | Rename needs no selection                | Hover a table in pan mode, no column pointed at, press `F2`              | The table's name opens for editing                                                | Manual                       |
| 10a.13b | The pointer wins over an old click       | Click a column, hover another table, press `F2`                          | The table opens, not the column clicked earlier                                   | `quickEditTarget.test.ts`    |
| 10a.13c | A rename reaches the document            | Rename a table in a real workbench                                       | Header, relations and both saved layout entries follow                            | `fieldEditing.test.ts`       |
| 10a.13d | A rename does not make the table flash   | Rename a table and watch it                                              | It never appears at the top-left corner, not even for a frame                     | `renameRepaint.test.ts`      |
| 10a.13e | Nor while the write is in flight         | Rename a table and watch the half second before the document comes back  | The table still drawn under the old name stays put; it does not go to the origin  | `renameRepaint.test.ts`      |
| 10a.13f | A rename right after a drag              | Drag a table, then rename it before the layout write-back has settled    | The rename reaches the file and the diagram draws the new name                    | `renameAfterDrag.test.ts`    |
| 10a.13g | The layout write-back swallows nothing   | Change the document while the diagram is writing the layout back         | The diagram redraws for that change; only its own write-back is ignored           | `diagramView.test.ts`        |
| 10a.14  | A table with an alias                    | Rename a table declared `Table users as u` with refs written via `u`     | The alias is untouched and those relations still draw                             | `renameOp.test.ts`           |
| 10a.15  | A rename keeps the table's state         | Rename a table that was moved, collapsed and had its relations hidden    | Position, detail level and hidden relations come with it; the colour changes      | `renameReconcile.test.ts`    |
| 10a.15a | The renamed table does not jump          | Rename a table that has been moved                                       | It stays where it was, no jump to the corner                                      | `renameReconcile.test.ts`    |
| 10a.16  | Undoing a rename                         | Undo the rename                                                          | The name goes back and the position comes back with it                            | `renameReconcile.test.ts`    |
| 10a.17  | A name already taken                     | Rename a table onto another table's name                                 | Refused before anything is written                                                | `renameOp.test.ts`           |
| 10a.17a | A collision leaves the other table alone | Rename onto a name another table holds                                   | Refused; the other table keeps its position and settings                          | `renameReconcile.test.ts`    |
| 10a.17b | A refused rename says why                | Rename a table the document no longer has                                | The box stays open with the reason, and the carried position goes back            | `QuickEditPopup.test.tsx`    |
| 10a.18  | The document moved underneath            | Edit the same line in the text editor, then apply the box                | Refused, and the box says the document changed                                    | `planEdit.test.ts`           |
| 10a.19  | A file that cannot be written            | Show the diagram for an unsaved (untitled) schema, click a column        | No editing box opens at all                                                       | `diagramView.test.ts`        |
| 10a.20  | The other hosts do not edit              | Open the same schema in the web app and the embedded frame               | Columns take no focus outline and `F2` does nothing                               | Manual                       |
| 10a.21  | A quoted qualified table name            | Rename a table declared `Table "sch.orders"`                             | The schema and the quotes survive; the name inside them changes                   | `realisticSchema.test.ts`    |
| 10a.21a | Renaming out of a schema prefix          | Rename `sch.orders` by typing `invoices`, without the prefix             | The position is filed under `sch.invoices`, the name the host puts back           | `QuickEditPopup.test.tsx`    |
| 10a.22  | Relations written with quotes            | Rename a table referred to as `"sch.a"."id"`                             | Every such relation follows the rename                                            | `realisticSchema.test.ts`    |
| 10a.22a | A table that is in a schema              | Rename `sch.analysis`, referred to as `sch.analysis.id`                  | Header and every relation follow; the edit is not refused as a parse error        | `renameOp.test.ts`           |
| 10a.22b | The same name in another schema          | Rename `sch.analysis` while a plain `analysis` also exists               | Only the relations that name it through `sch.` change                             | `renameOp.test.ts`           |
| 10a.22c | A schema rename reaches the document     | Rename `sch.analysis` in a real workbench                                | The header, the inline ref and the standalone `Ref` all follow                    | `fieldEditing.test.ts`       |
| 10a.22d | A quoted relation into another schema    | Rename plain `users` while `"sch"."users"."id"` names the other one      | That relation is untouched; only the plain one follows                            | `renameOp.test.ts`           |
| 10a.22e | A half-quoted relation                   | The same, with the relation written `sch."users"."id"`                   | Still untouched; the quotes do not hide the schema in front of them               | `renameOp.test.ts`           |
| 10a.22f | Both names exist on both sides           | Rename `users` to `people` while `sch.users` and `sch.people` both exist | No relation is moved from one schema's table onto the other's                     | `renameOp.test.ts`           |
| 10a.22g | A quoted relation through its own schema | Rename `sch.users`, referred to as `"sch"."users"."id"`                  | That relation follows, and the plain `users` one does not                         | `renameOp.test.ts`           |
| 10a.23  | An index naming a missing column         | Edit any column in a file whose index names an undeclared column         | The edit applies; the index does not hold the file hostage                        | `realisticSchema.test.ts`    |
| 10a.24  | The diagram redraws before a save        | Edit a column, do not save                                               | The new name is on the diagram at once, and the file is still dirty               | `diagramEditRefresh.test.ts` |

## 11. Libraries

Covered by their own suites; listed so the coverage is visible in one place.

| #    | Package                     | What it must do                                                                    | Automated                      |
| ---- | --------------------------- | ---------------------------------------------------------------------------------- | ------------------------------ |
| 11.1 | `dbml-to-json-table-schema` | Turn parsed DBML into the diagram's schema — tables, columns, enums, indexes, refs | 21 tests                       |
| 11.2 | `dbml-to-json-table-schema` | Read and write the `MetaInfo` block without disturbing the rest of the file        | `metainfo.test.ts`             |
| 11.3 | `db-to-dbml`                | Read a live PostgreSQL schema and render it as DBML                                | 25 tests                       |
| 11.4 | `db-to-dbml`                | Filter to the schemas the reader asked for                                         | `filterDatabaseSchema.test.ts` |
| 11.5 | `schema-diff`               | Compare a DBML model against a database and render the difference                  | 22 tests                       |
| 11.6 | `schema-diff`               | Treat equivalent type spellings as equal                                           | `canonicalizeType.test.ts`     |
| 11.7 | `shared`                    | Build the key that ties a column to its table                                      | 3 tests                        |

## 12. Build and packaging

| #    | Case                                    | Steps                                          | Expected                                                                                | Automated                                                       |
| ---- | --------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 12.1 | Everything typechecks                   | `yarn typecheck`                               | Eight packages pass, and a package with TypeScript and no tsconfig is named as an error | `scripts/typecheck.js`                                          |
| 12.2 | Every suite runs                        | `yarn test`                                    | Seven packages pass, and a package with tests and no `test` script is named as an error | `scripts/test.js`                                               |
| 12.3 | The site builds and needs no CDN        | `yarn build:web`, then load it offline         | The editor works with the network down                                                  | `site.spec.ts`                                                  |
| 12.4 | The container serves the catalogue      | Build the image, run it                        | `/schemas/` lists the models the image was built with                                   | `schemaManifestScript.test.ts`, plus a run against a real image |
| 12.5 | The extension packages                  | `yarn workspace dbml-studio create:package`    | A `.vsix` is produced                                                                   | Manual                                                          |
| 12.6 | Stale test output cannot fail the suite | Delete a test's source, run `test:integration` | Its compiled copy does not run                                                          | `compile-tests` empties `out/`                                  |

---

## Gaps worth closing

All six this catalogue opened with are closed, and closing the first found a
bug: Export → SVG had been writing a file with the relation lines and no tables
since the zoom rewrite split the canvas onto two layers. What is left is
thinner:

1. **The extension's own features are still mostly manual** — 10.6 to 10.10 and
   10.16. The integration suite can drive a real VS Code, so they are reachable;
   nobody has written them. 10.17 is the first one written, and it was written
   after the thing it covers shipped broken: every piece of that relay had a
   test and every piece was green while the whole did nothing.
2. **The live-database suites are opt-in.** They pass, but only when somebody
   remembers to raise a database. In CI they would run on every change; see
   `docs/testing.md`.
3. **The container is only checked by its manifest script.** 12.4 asserts what
   the scanner produces, not that a built image serves it.
