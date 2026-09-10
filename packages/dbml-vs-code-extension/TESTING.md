# Manual test plan (DBML extension)

## Getting a build in front of yourself

```bash
yarn package:dbml:local
code --install-extension dist/dbml-studio-local.vsix --force
```

Then reload the window. The local build carries a version of its own —
`1.2.2-local.<timestamp>` — because VS Code declines to reinstall a version it
already has, `--force` or not, and a rebuilt package under the released number
looks exactly like a build that did not take. Check the version in the
extensions list against what the build printed before you trust what you see.

## Switching between text and diagram

The tab bookkeeping is covered automatically — `yarn workspace dbml-studio test:integration` proves in a real VS Code that switching replaces the tab in both directions, that opening beside keeps the text, and that a plain open still gives text. Run that first; what is left below is what only eyes can check.

1. In a `.dbml` text editor exactly one title button shows — **Show diagram**, with the preview icon.
2. Alt-click it — the diagram takes over the current tab. (Plain click opens it beside.)
3. In the diagram the button has become **Show DBML source**, and **Show diagram** is gone.
4. `Reopen Editor With…` offers both the text editor and **DBML Diagram**.
5. Switch a file with unsaved changes both ways — no save prompt should appear, and the dirty marker should stay on the tab.
6. Open two different `.dbml` diagrams at once: a syntax error in one leaves the other's Problems entries alone.

## MetaInfo persistence

1. Open a `.dbml` file and launch **Show diagram**.
2. Drag a table on the diagram; wait ~0.5s.
3. Confirm `/*MetaInfo ... MetaInfo*/` appears or updates at the end of the file with table coordinates.
4. Close and reopen the diagram; positions should match MetaInfo.
5. Use editor **Undo**; MetaInfo block should revert.

## Relation visibility

One state, two ways in — the header icon and `H` — and **neither writes to the file**.

1. Hover a table that has relations; click the link icon in the **table header**. Its relations hide on the canvas, the icon gains a strike-through, and the table gets a dashed outline.
2. Click again; relations reappear and the outline goes.
3. Hover a table and press **H**: exactly the same as clicking the icon, outline included.
4. Watch the editor text through both — nothing is written to it, and no `Ref` line is commented out.
5. Reload the diagram; whatever you hid is still hidden. It is remembered per document, in the browser, not in the `.dbml`.

## One table's detail level

The diagram's own level and a single table's, side by side — and **neither writes to the file**.

1. Hover a table and press **T** three times: it goes to headers, then to key columns, then back to full detail. No other table changes.
2. Double-click that table's header: the same step again, and the table is neither dragged nor selected by the double click.
3. Set two tables apart, then press **D**: every other table changes level and those two stay where you put them.
4. Press **U**, or click the button beside the detail-level toggle in the toolbar: both rejoin the rest. The button is dimmed while nothing is set apart. Press **U** again — nothing happens and nothing flickers.
5. With one table collapsed, press **F**: the diagram is framed for what is on screen, with no empty band where the table used to reach.
6. Collapse one end of a relation: the line meets that table at its header and its other end still at the right column.
7. Collapse a tall table and drag a marquee through the space it used to fill: it is not selected. Expand it and the same drag catches it.
8. Open the legend with **?**: the notation list names the double-click gesture, and the shortcut list has **T** and **U**.
9. Reload the diagram; the levels you set are still set. Remembered per document, in the browser, not in the `.dbml`.

## Auto-arrange after a drag

1. Open a schema whose layout was made by auto-arrange (press **L**, save, reopen). Drag one table well away from where it was, then press **L** again: it returns to its place. Before, it stayed where it was dropped, because the layout put it back on the very numbers it had before the drag and nothing noticed.

## Editing from the diagram

The one thing here that **does** write to the file. Automated where it can be: the pure planning is unit-tested, the key map is unit-tested, and one integration suite proves a request from the page turns into a workspace edit that a single undo takes back. What is left below is the part that needs eyes.

1. Click a column: it gets an outline, and any selected tables lose theirs. Click a table, click empty canvas, or press **Escape**: the column loses its outline. To rename the table you do not need to: point at its header and press **F2**, the pointer wins over the outlined column.
2. Press **F2**, or double-click the column. A box opens on the column holding the line exactly as it stands in the file, indentation stripped, comment and inline `ref` and all.
3. Type a change and press **Enter**. Only that line changes in the text editor beside it; nothing else moves and the file stays dirty rather than saving itself.
4. Press **Ctrl/Cmd+Z** in the text editor: one press takes the whole edit back.
5. Open the box again, type something DBML cannot parse, press **Enter**. The box stays open with your text, the parser's own message under it in English, and the file is untouched.
6. Press **Escape** with the text changed: nothing is written.
7. Click anywhere else — another column, an empty part of the canvas, the toolbar. The box closes and what you typed is applied, the same as **Enter**. If the text does not parse, the box stays open with the reason instead.
   7a. Point at a column with no box open and press **Ctrl+Enter**: a column is added below it and the box opens on the new one, ready to name. Press it twice more: three columns, called `new_column`, `new_column_2` and `new_column_3`, and the outline is on the last of them alone.
   7aa. Click a table's header, or just point at it, with no column pointed at, and press **Ctrl+Enter**: a column is added at the end of that table and the box opens on it.
   7ab. Click a column and press **Ctrl+Delete** with no box open — the column goes. On a MacBook press **Cmd+Backspace**, which is the key that is actually there. Point at a table rather than a column and press it: nothing is written and VS Code says to point at a column. Try it on a column another table's `Ref` points at: refused, with the parser's reason.
   7b. Press **T** on the table until it shows key columns only, then press **Ctrl+Enter** on one of the rows left drawn. The column reaches the file and VS Code says so, naming what to do to see it — without that, the key looks like it did nothing.
8. **Shift+Enter** adds a line break rather than applying. **Ctrl+Enter** applies and opens a new column below, ready to type into — also after you renamed the column in the same breath. **Tab** applies and opens the row drawn below; from the last row it closes. **Ctrl+Delete** removes the column. **Ctrl+Up** and **Ctrl+Down** move it, and the box moves with it.
9. While the box is open, press **T** or **D**: the letters go into the text and the diagram does not toggle anything.
10. Delete a column another table's `Ref` points at: refused, with the parser's message, and the file is untouched.
    10a. Click a table in pan mode: it is outlined, and a column you had pointed at lets go. Click empty canvas: the outline goes. Hold **Shift** and click a second table — still one outline, because pan mode holds one table. Press **V** and try again: now both are outlined and dragging one moves both.
11. Hover a table's header and press **F2**: the table's name opens. Hover one of its columns and press **F2**: that column opens. Both work in either interaction mode and need no selection. Click a column first, then hover a different table and press **F2** — the table opens, not the column you clicked. Rename it. Every `Ref` that named it follows, the table keeps its position and its detail level, its colour changes because the colour is derived from the name. Undo: the name goes back and the position comes back with it.
12. Rename a table that has an alias (`Table users as u`) with relations written through the alias: the alias is untouched and those relations still draw.
13. Rename a table onto a name another table already has: refused before anything is written, and **the other table does not move** — its position and settings are untouched.
14. Open a `.dbml` that has never been saved (**File → New**, paste a schema, show the diagram): double-clicking a column gives no editing box at all. A file the filesystem will not let you write refuses on **Enter** instead, with a message.
15. The site is unaffected. Open the same schema at the web app: columns do not take a focus outline and **F2** does nothing.

## Colored relations

1. With **Colored relations** off, relations are grey; hovering a table colours only its own relations.
2. Turn it on — every relation is permanently painted in its source table's colour.
3. Reload the webview; the setting survives.

## Relation animation

1. Turn on **Animation** and hover a table with relations — its relations show travelling dashes; all other relations stay static.
2. **Check the direction:** the dashes must travel from the source table towards the target. If they run backwards, flip the sign of the `dashOffset` step in `ConnectionPath.tsx`. A confidently wrong direction is worse than no animation, since reading direction is the whole point of the feature.
3. Confirm the cardinality symbols (crow's foot) at both ends stay intact while the dashes move.
4. Turn the setting off — the dashes disappear, and hovering/clicking relations behaves as before.

## Keyboard shortcuts and legend

Every one of these is a command now, so each key is a default the reader can change, and none of them may fire while anyone is typing.

1. Press `C`, `A`, `S`, `D`, `V`, `L`, `F`, `H`, `R` with the diagram focused — each produces the same result as its toolbar button, and each acts **once**. Two toggles that cancel out is the failure this arrangement exists to prevent.
2. Open the search with `Ctrl/Cmd+F` and type `casual` — the view modes must **not** toggle and the text must type normally. Clear the box, click the canvas, press `C`: it toggles again. This is the one the workbench cannot work out for itself, because a webview forwards a keystroke without saying what it landed in.
3. Click into the filter box of the DBML side bar while a diagram is the active editor and type the same letters — again nothing may toggle.
4. Put the caret in a `.dbml` text editor and type those same letters — nothing on any open diagram may change.
5. Type in the search box, then close the diagram tab without clicking anywhere else. Open a diagram again and press `C`: it must toggle. A guard left standing would kill every shortcut for the rest of the session.
6. Press `?` — the legend opens, lists every shortcut and says the keys are defaults the editor owns. Close it with `Esc`, then reopen it with the keyboard button in the toolbar and close it by clicking the dimmed backdrop.
7. While the legend is open, press `L` and `D` — nothing behind the overlay may change.
8. Open the command palette with the diagram focused and type `DBML` — every view action is listed and running one works. Hiding the hovered table's relations is deliberately **not** there: the palette takes the pointer off the diagram, so it would have nothing to act on. Close the diagram and look again: the rest are gone.
9. In **Preferences: Open Keyboard Shortcuts**, search `DBML`, rebind **Fit to view** to something else, and check that the new key works and `F` no longer does.

## Toolbar tooltips

1. Hover any toolbar button — a dark tooltip appears above it immediately, styled like the rest of the interface.
2. Keep hovering for a few seconds — no second, system-styled tooltip appears on top of it.
3. Auto-arrange shows `(L)`, Fit to view `(F)`, the keyboard button `(?)`.
4. Export and the theme toggle have no shortcut — their tooltips show the label alone, with no empty brackets and no `undefined`.
5. The tooltip does not block the pointer: moving across a button and onto its neighbour switches tooltips cleanly, without flicker.

## Toolbar labels

1. Buttons that hold a state show their name: detail level, short table names, colored relations, relation animation.
2. One-shot actions show only an icon: auto-arrange, fit to view, export, the keyboard button.
3. The theme toggle is the stated exception — stateful but icon-only, because the icon itself swaps between a sun and a moon.
4. **Recognisability check:** look at auto-arrange and fit to view, which no longer carry a label. Are both still recognisable from the icon alone? If either is not, the icon is the thing to replace — do not restore the label, which would turn the rule back into a case-by-case argument.
5. At a normal window width the toolbar stays on a single line — no button wraps to a second row. (This replaces "no wider than before": with the change already made there is nothing left to compare against, and staying on one line is what the width actually had to protect.)

## Export

1. The toolbar has one export button, not three.
2. Click it — a menu lists PNG, SVG, AsciiDoc and Markdown by name. The entries name the format only, without repeating the word "Export".
3. Pick PNG — the image downloads and the menu closes.
4. Pick SVG (`.svg`), AsciiDoc (`.adoc`) and Markdown (`.md`) in turn; each downloads and closes the menu.
5. Open the `.md` file in a Markdown preview — the column lists render as real tables, not as rows of pipe characters.
6. Open the menu and press `Esc` — it closes and nothing is exported.
7. Open the menu and click elsewhere on the diagram — it closes and nothing is exported.
8. Move the pointer across the export button on the way to a neighbouring button — the menu must not open on hover alone.
9. Keyboard only: Tab to the export button and press Enter — the list opens. Tab moves through all four formats; Enter on one exports it. `Esc` closes the list. (Arrow keys are deliberately not wired: the list is plain buttons, not an ARIA menu.)

## Import from database (PostgreSQL)

1. Command palette → **DBML: Import from database**.
2. Choose **New connection**, enter a `postgres://` connection string. The database it names is only the entry point — the import can reach the server's other databases.
3. When the server holds several databases, pick one or more; the schema list that follows is grouped by database, with everything ticked. Untick some and continue.
4. One database chosen: choose a save location; confirm the `.dbml` file is written and the diagram opens.
5. Several databases chosen: choose a folder; confirm one `<database>.dbml` per database is written, that no editor opens by itself, and that the closing notice counts the files. Re-run into the same folder and confirm the single "these files already exist" confirmation, and that declining writes nothing.
6. Two schemas of one database chosen with a foreign key between them: confirm the reference is in the file (`Ref` naming both `schema.table` ends) rather than counted as omitted.
7. If cross-schema foreign keys leave the chosen set, confirm the "N cross-schema references were omitted" notice, summed across every file.
8. Cancel the progress notification during a multi-database import: confirm the databases already finished keep their files, the run stops, and the closing notice says "Cancelled after importing N of M databases" rather than reporting a complete run.
9. Re-run the command; confirm the saved connection appears in the list and works.
10. Error cases: wrong password, unreachable host, and a non-`postgres://` string each show a clear message with no password leaked. On a server holding a database your user may not connect to, choosing it alongside a readable one imports the readable one and reports "Imported 1 of 2 databases. <name>: Access to this database is denied."

## Compare with database (PostgreSQL)

1. Open a `.dbml` file; command palette → **DBML: Compare with database**.
2. Choose a connection; when the server holds several databases, pick one; when that database has several schemas, pick one.
3. Confirm a Markdown report opens beside the editor with tables/columns/enums/FK/index differences (or "Schemas are identical").
4. On a `.dbml` file with a syntax error, confirm a clear "DBML parse error at line N:M" message and no crash.
5. Wrong password / unreachable host each show a clear message with no password leaked.

## Sidebar panel (Activity Bar)

1. Click the DBML icon in the Activity Bar — the panel opens with **Actions** and **Connections** groups.
2. Under Actions, click **Show diagram** / **Import from database** / **Compare with database** — each runs the same command as the palette.
3. Click **＋** in the panel title, enter a name + `postgres://` string — the connection appears under Connections (name only; no password shown).
4. Expand a connection — its databases load on demand; expand a database — its schemas load. Neither `pg_catalog`/`information_schema` nor `template0`/`template1` are listed.
5. On a connection, use the inline **Import** / **Compare** icons — the flow runs against that server without asking which connection. On a database node, both skip the database question; on a schema node, **Import** asks nothing at all and writes that one schema.
6. Point a connection at a server that is down, or delete a connection while its node is expanded, then expand it: the child says "Could not read the list of databases" / "This connection is no longer available" instead of the node silently coming up empty. Bring the server back and collapse/expand the same node — it retries and succeeds, without needing ⟳.
7. Expand a connection, collapse it, expand it again — the databases come back instantly and the server is not asked a second time. **⟳** is what re-reads it.
8. Use the inline **Delete** icon — confirm the modal; the connection disappears. Click **⟳** to refresh.
9. With a non-English display language, the group names and the three action labels are translated, and so is "No saved connections" when there are none. A saved connection's own name is user data and must stay exactly as typed, untranslated.

## The site

Everything below is `packages/web`, not the extension. Build and serve it first —
`yarn build:web`, then either `yarn workspace web preview` or the container image
from [packages/web/README.md](../web/README.md) — and use the built output rather
than the dev server, so what is tested is what would be deployed.

1. **Live parsing.** Type a table into the editor; the diagram grows a table
   without any button being pressed. Delete it again; the table goes.
2. **A syntax error does not blank the page.** Delete a closing brace. The
   diagram is replaced by a readable parser message, the editor keeps every
   character you typed, and restoring the brace brings the diagram back.
3. **Opening a file.** Use **Open** to pick a `.dbml` file, then drag a different
   one anywhere onto the page. Both replace the editor's contents, and the
   browser never navigates away from the page or opens the file itself.
4. **Dragging tables.** Move a few tables around. The editor text does not change
   while you drag. Press Ctrl/Cmd+Z in the editor: it takes back what you typed,
   not where you dropped a table.
5. **Downloading.** Press **Download**. The file is named after the tab, keeps
   the `.dbml` extension without doubling it, and its contents match the editor
   exactly. A file opened and downloaded again without edits is unchanged.
6. **Tabs hold independent layouts.** Open two tabs with the same schema. Arrange
   the tables differently in each, switch back and forth, and both arrangements
   survive. Reload the page: the tabs, the selected one, and both layouts are
   still there.
7. **The layout round trip, both directions.** On the site, arrange a schema,
   press **Save layout**, and download it. Open that file in the extension: the
   tables are where you left them. Then move them in the extension, save, and
   open the file on the site — again, where you left them. This is the whole
   point of the shared metadata format, and it is the one thing no automated
   check in this repository covers.
8. **H.** Hover a table on the diagram and press H. The lines it drew
   disappear and the table gets a dashed outline — the same as clicking the link
   icon in its header. The editor text does not change: this is a view
   preference, kept per document, and Ctrl/Cmd+Z has nothing to undo.
9. **T and U.** Hover a table and press T: that table alone cycles full
   detail, headers, key columns. Press D and the rest of the diagram moves
   around it while it stays as you left it; press U and it rejoins them. Like
   H, this is a view preference kept per document, and the editor text does not
   change.
10. **Ctrl/Cmd+F belongs to whatever has focus.** With the caret in the editor, it
    opens the editor's own find. With focus anywhere else on the page, it puts the
    caret in the diagram's table search.
11. **Nothing leaves the browser.** With the browser's network panel open and
    recording, load the page and use it: open a file, type, download. Every
    request is to the site's own origin. Then disconnect the machine from the
    network entirely and reload — the page still works.
