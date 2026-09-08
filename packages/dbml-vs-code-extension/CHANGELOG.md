# Change Log

All notable changes to the "dbml-studio" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added

- **A renamed table keeps its place.** It jumped to the top-left corner instead. A table reads its position once, when it is drawn, and the rename drew it under its new name before the saved position had been moved there — so it found nothing and used the origin. The position, the detail level and the hidden-relations flag now move before the write, and go back if the write is refused.

- **`F2` aims at what the pointer is on.** Clicking a column left it pointed at until something else took over, and the key checked that before anything else — so after one click on any column, `F2` re-opened that column wherever you pressed it, and renaming a table appeared not to work at all. The pointer now decides: a column under it edits that column, a table under it renames the table, and the clicked column is only a fallback for a pointer that is off the diagram.

- **Renaming a table needs nothing but the pointer.** It used to want the table _selected_, and a table can only be selected in select mode — so renaming meant pressing `V`, clicking the table, renaming, and pressing `V` back, which is not a sequence anyone guesses. `F2` now renames the table under the pointer, the way `H` and `T` already act on the table you are hovering. A single selected table still works.

- **The diagram shows an edit straight away.** A changed column or table name only appeared after the file was saved. The write was being marked as the diagram's own — a mark that exists so the diagram does not redraw from its own write-back of table positions — and that mark suppressed the redraw a field edit needs. Editing a field no longer claims it, so the name changes under the pointer while the file is still unsaved.

- **Clicking away closes the edit box.** It applied only on `Enter` before, so a click elsewhere left the box open over the diagram. It now behaves like a spreadsheet cell: clicking anywhere else applies what you typed and closes, `Escape` still throws it away, and text that will not parse keeps the box open with its reason rather than losing your typing.

- **Editing understands the schemas people actually write.** Three shapes a hand-written test schema never has and a real one always does. A table whose whole qualified name is one quoted string (`Table "sch.orders"`) is renamed without losing the schema or the quotes. Relations written as `"sch.a"."id" < "sch.b"."a_id"` are found and follow the rename; before they were invisible, and a rename left the file unparseable. And a file carrying an index that names a column nobody declared — which the diagram has always drawn without complaint — no longer refuses every edit in it with an error about a table you never touched.

- **Edit a column, or rename a table, from the diagram.** Changing a schema used to mean leaving the diagram, finding the table in the `.dbml`, finding the line, editing it and coming back. Click a column to point at it and press `F2`, or double-click it, and a small box opens on the column holding the line exactly as it is in the file. `Enter` applies, `Escape` throws the edit away, `Shift+Enter` adds a line break inside a note. `Ctrl+Enter` adds a column below, `Ctrl+Delete` removes one, and `Ctrl+Up` / `Ctrl+Down` move one. With one table selected and no column pointed at, `F2` renames the table instead, and the rename follows through to every relation that refers to it by name and to the layout the file carries. The command is **DBML: Edit the column, or rename the table** in the palette and can be rebound like every other. Only the ranges you actually changed are written, so one undo takes back one edit, and text that would not parse is refused before it reaches the file rather than after. The diagram on the website is unchanged: editing is something the extension lends it, and the website lends nothing.

## [1.2.1] - 2026-09-08

### Fixed

- **Every diagram command works again.** In 1.2.0 none of them did anything inside VS Code: not a single keyboard shortcut and not a single **DBML** entry in the command palette. The diagram on the website was unaffected, which is why this looked at first like one new key being broken rather than all twelve. The page was refusing the message the extension sends it, on a check that asked the message to come from the frame directly above the page — and inside a webview it never does. It comes from the shell VS Code puts in between, which the page cannot name. The check could only ever reject, and it did so in silence.

## [1.2.0] - 2026-09-07

### Added

- **Set one table's detail level apart from the rest.** `D` has always moved the whole diagram at once, so following one table through a large schema meant reading every table in full or none of them. Hover a table and press `T`, or double-click its header, and that table alone cycles full detail, header only, key columns only. It then keeps the level you gave it while `D` moves everything around it, so you can leave one table open in a diagram of headers. `U`, the button beside the detail-level toggle in the toolbar, or **DBML: Give every table the shared detail level back** in the palette returns them all; the button is dimmed while there is nothing to return. The levels are remembered with the file and nothing is written to the `.dbml`, the same as hiding a table's relations. Cycling the hovered table is kept out of the palette for the reason hiding relations is: from there the pointer is not on a table.

- **Bring every hidden relation back at once.** Relations are hidden one table at a time, from the link glyph in the table's own header, so the way back was as many clicks as the way in — and you had to remember which tables you had silenced, which is the thing a diagram is meant to save you from. A button in the toolbar, **DBML: Show all hidden relations** in the palette, and `R` while a diagram has focus each undo all of it in one go. The button is dimmed while nothing is hidden, so it also tells you whether anything is. Nothing is written to the `.dbml` file, the same as hiding.

### Changed

- **Every diagram shortcut is a command now, and every key can be rebound.** The keys used to live inside the webview, where VS Code could not see them: nothing appeared in Keyboard Shortcuts, nothing appeared in the palette, and `Alt+H` — the one chord among them — collided with the menu bar on Windows and Linux and typed a stray character on a Mac. Colouring relations, animating them, short names, detail level, pan or select, auto-arrange, fit to view, the legend, and hiding a table's relations are now ten commands under **DBML**, each with a default key that applies only while a diagram has focus. Search for `DBML` in **Preferences: Open Keyboard Shortcuts** to change any of them. Hiding the hovered table's relations moves from `Alt+H` to `H`, in one row with the rest. The legend still lists the defaults and now says so; a key you rebind is shown by VS Code, not by the diagram. Two smaller consequences: none of these keys fires while you are typing, including in the diagram's own search box, and `H` no longer works while the legend is open — it is an overlay, and the diagram behind it is not being pointed at. One of the ten is deliberately kept out of the command palette: hiding the hovered table's relations acts on whatever the pointer is over, and opening the palette takes the pointer away, so from there it would always find nothing.

### Fixed

- **A marquee no longer catches a table that is not drawn where you dragged.** Selecting by dragging a rectangle measured tables at the size the layout gave them, which is their size at full detail and never changes. With the diagram down to headers, a drag through the empty space a tall table used to fill still selected it, and there was nothing on screen to explain why. The rectangle now measures each table as it is actually drawn.

## [1.1.1] - 2026-09-04

### Fixed

- **A column's note was unreadable in the dark theme.** Hovering a column that carries a note, or whose type is an enum, opens a bubble beside it. The bubble had no text colour of its own and borrowed one meant for the page behind it: in the dark theme that came out near-black on a near-black bubble, at a contrast of 1.13 to 1 — the text was drawn, and nothing was there to see. The bubble was also exactly the colour of a table, so it had no edge against whatever it covered. In the light theme the note itself read, but the enum listed under it did not: those colours are chosen for a white page, and this bubble is dark in both themes. Every colour the bubble draws with is now chosen against the bubble, and a test holds them there.

## [1.1.0] - 2026-09-01

### Added

- **Choose what to import from a server.** A saved connection used to mean one database and one schema — whatever the connection string named, minus every reference that left the schema you picked. It now means the server. The DBML panel opens a connection into its databases and each database into its schemas, and **DBML: Import from database** asks which databases to take and then offers their schemas in one list grouped by database. Each database becomes one `.dbml` file holding every schema chosen from it, so a reference between two of them survives the export instead of being counted and dropped — a model split across `public` and `audit` comes out whole for the first time.
- **A long import can be watched and stopped.** Databases are read one at a time and each file is written as soon as its own database is read, so cancelling leaves finished files rather than nothing, and the notification says how much was left. A database that fails no longer abandons the ones that worked: the run ends saying which succeeded and what went wrong with the rest.
- **Comparison can pick its database too.** **DBML: Compare with database** asks which database of the server to read; the comparison itself is still one schema against one file.

### Fixed

- **A database you are not allowed to read said the wrong thing.** PostgreSQL lists databases in its catalogue whether or not your user may connect to them, and being refused by one reported the same "failed to import the schema" as a wrong password or an unreachable host. It now says access to that database was denied.

## [1.0.2] - 2026-09-01

### Fixed

- **Export → SVG produced a file holding the relation lines and no tables.** The exporter records the canvas by swapping an SVG-writing context onto a layer and drawing; it took the first one, which was the whole diagram until the zoom rewrite split connections and tables onto two. It has been the connections alone since, and it shipped that way in 0.16.0, 1.0.0 and 1.0.1. Nothing caught it because nothing opened the file: the download happened, the file was not empty, and a `.svg` full of lines looks like a working export right up until somebody views it. The browser suite opens what it downloads now — every table has to be named in the SVG, the AsciiDoc and the Markdown, and the PNG has to come out at the size of the model rather than of the window.

## [1.0.1] - 2026-08-31

### Added

- **The listing shows the extension working.** A recorded demonstration — arranging a schema, cycling the detail level, finding a table by name, catching a group with a marquee and moving it, colouring and animating the relations, reading the notation up close, and turning the whole page over to the dark theme. It runs on a schema written for it, a fictional public library kept in `examples/library.dbml`: no real database of anyone's is in the picture, and nothing on screen belongs to a person. The recording lives in the repository rather than in the package, so the listing loads it without every install carrying it.
- **Categories and keywords that say what this is.** The extension was filed under `Other` alone and found by two words. It is now also under `Visualization` and `Programming Languages` — it contributes the DBML language and its grammar — and answers to the terms someone would actually search: `erd`, `entity relationship diagram`, `database schema`, `postgresql`, `schema diff`, `data model`.

## [1.0.0] - 2026-08-31

The extension is republished under its own name. What it does was never the
problem — what it was called, and what it was called underneath, was.

### Added

- **Several tables can be selected and moved together.** The toolbar carries a pan-or-select mode. In select mode a marquee catches every table it touches, a click picks one and Shift+click adds to what is already held, a selected table is outlined, and dragging any one of them moves the whole group. Holding space pans without leaving the mode, so choosing tables and getting to the part of the diagram you want to choose from are not two modes to swap between. The moved positions reach the coordinate store, which is to say they survive a reload.
- **Keys and mandatory columns are marked in a notation people already read.** A mandatory column takes a `*` after its type, which is Barker's; Barker's `o` for an optional one is left out, because a real schema is mostly optional columns and a mark on nearly every line stops being read — the legend says instead that an unmarked column may be null. `PK`, `FK` and `UK` pills sit at the right of the line, the set Mermaid's ER diagrams use, with `UK` suppressed beside `PK`, which is unique by definition. Whether a column is a foreign key is worked out from the relations rather than guessed: anything genuinely ambiguous is left unmarked. This replaces the `(!)` after a NOT NULL column, which was a notation of this diagram's own.
- **A documentation page can let the reader expand the diagram it embeds.** An embedded frame is as tall as the page's author made it. The toolbar now offers a button that asks the surrounding page for the whole viewport over a postMessage handshake, and it appears only once a host has answered — a frame in a page that does not speak the protocol offers nothing that would then do nothing. Escape puts the page back. The page's half of the protocol lives in the documentation repository.

### Changed

- **The extension is now DBML Studio, and carries its own identity throughout.** It was published as a fork that had kept the original's name, identifier, command namespace and settings keys verbatim, and the Marketplace removed it as an extension resembling another one. The identifier is now `konyshevav.dbml-studio`, the commands are `dbmlStudio.*`, the settings are `dbmlStudio.preferredTheme` and `dbmlStudio.scrollDirection`, the diagram editor's viewType is `dbml-studio-diagram`, and the listing describes what this fork actually does rather than restating the original's feature list. The upstream project is still credited, in the listing and in the repository, as the work it is built on.
- **Settings written under the old keys are not carried over.** `dbmlERDPreviewer.preferredTheme` and `dbmlERDPreviewer.scrollDirection` are read by nothing now; set the two `dbmlStudio.*` keys instead. A diagram's table positions kept in the webview's local cache are dropped for the same reason, but a layout saved into a file's `MetaInfo` block is untouched and still read.
- **The search bar hides with the toolbar in a framed diagram.** It sits over the top-right corner for the same reason the toolbar sits over the bottom, and costs the same in a frame a few hundred pixels tall. Ctrl+F now checks whether the bar can be seen before claiming the key, so in a documentation page the keypress goes to the browser's own find over the prose instead of to a box that cannot be focused. Nothing changes in the full application, where the bar is always there.
- **A framed diagram re-frames itself whenever its room changes**, rather than only when it loads, so a diagram given the whole viewport fills it instead of sitting small in the corner of a large empty one. The editor and the extension keep the old behaviour, where a resize is a dragged divider and re-framing would throw away a pan.
- **Tables are a little wider**, because a column line is now measured as widths rather than as text: a pill's padding is part of what a table must be wide enough for. Arrangements stored before this have correspondingly less room between them.

### Fixed

- **A canvas gesture now ends wherever it ended.** A middle-button pan released outside the canvas sent the stage no event at all, so the flag stayed raised and select mode silently became pan mode — the next drag drew a marquee and moved the canvas at once. Recovery was toggling the mode, and nothing on screen said so.
- **Holding space to pan no longer opens a marquee underneath it.** The tables move with the stage, so the box that came out at the end caught nothing, and committing it cleared the selection the reader was holding space to keep — which is the one thing panning inside select mode exists to make possible.

## [0.16.0] - 2026-08-30

### Added

- **A diagram can be put inside a documentation page.** A second entry point, `embed.html`, that is the diagram and nothing else — no editor, no file tree — reached with `?src=model.dbml` and, optionally, `?tables=a,b,c` to show a slice of a large model. It arrives already framed, because a page's author fixes the height and the reader cannot pan to find what was drawn off-screen, and the toolbar stays out of sight until the pointer is over the diagram, because in a 500px frame it covers the bottom fifth of the thing the page put there to be looked at. A name in `tables=` that is in no model is said out loud rather than quietly dropped. The frame leaves nothing in the browser's storage: the layout it computes is taken back out, and the reader's own theme, shared with the full application on the same origin, is not touched.
- **A file remembers an arrangement for each detail level.** The layout block a `.dbml` file carries now records which detail level each arrangement was made at, and holds one per level. Tables are placed by the height they are drawn at, so an arrangement made with only the headers showing puts tables on top of one another if it is read back at full detail; recording the level is what lets an arrangement made at any level be saved and read back safely. Moving tables about with the columns hidden is written down like any other arrangement instead of being discarded. A block written before this — every block that exists today — is read as the full-detail arrangement it is, and the block stays a flat array, which is what a reader written before this parses it as.

### Changed

- **The diagram is arranged for the detail level it is drawn at.** The room left between tables is a share of their height and the shape the whole diagram is aimed at is chosen from their sizes, and both were computed once, at full detail. Headers left in a full-detail arrangement therefore sat in a field of white with the relations running the length of it. Pressing `D` now rearranges and re-frames: on a page-sized frame showing three tables from a real model, the diagram went from 0.39 to 1.42 of full size — table names that had been a smear are now readable.
- **Whether a document opens with its columns showing is decided by how many columns it has**, and by the tallest table rather than the count alone. Three tables of 130 to 200 columns are a small schema by every measure except the one that matters: six thousand pixels tall, which in a documentation frame is three hairlines. A tall table only costs anything when there are other tables for it to shrink, so a diagram of one table opens with its columns however tall it is — 188 of the 394 diagrams in the documentation this was measured against show a single table, and a third of those are wider than the threshold.

### Fixed

- Fit-to-view measured the tables at the size the layout had made them rather than the size they were drawn at, so after switching to headers the diagram stayed at the scale computed for full detail: the reader asked for headers, got them, pressed fit-to-view and nothing moved.
- A filtered frame was arranged as though it were still part of the whole model. The coordinates a file carries describe where its tables sit among all the others, so five tables out of a hundred and thirty-one kept places three thousand units apart and the frame fitted itself to the empty rectangle between them — a page of white with something small in two of its corners. A filter that leaves tables out now arranges what remains as the diagram it now is.
- The column rows of a small schema are drawn however far out it is fitted. Hiding them as the reader zooms out is a budget for the redraw, and a schema inside the budget has nothing to save; the saving was being made exactly where it was worth least, in a frame a few hundred pixels tall showing the handful of tables a page asked for, where the reader has no way to zoom towards what was hidden.

## [0.15.0] - 2026-08-28

### Added

- **The site can be built with a project's schemas inside it.** A folder of `.dbml` files goes into the image, and the deployment opens showing them: a tree on the left, the first schema already drawn, nothing to find and drag into the window. The folder is supplied at build time (`--build-context schemas=/path/to/my-project`), as a layer on top of the published image, or mounted as a volume — the list is rebuilt at every container start, so a swapped volume needs a restart and nothing more. A row is named after the file's `Project` block, else its first `//` comment, else the file itself. Only `.dbml` is served: a README or an `.env` sitting beside the schemas stays unreachable. An image built without a folder is the site exactly as it was.
- **The site remembers which theme you chose**, and takes the system's preference on a first visit instead of always opening dark.

### Changed

- **The site navigates by a file tree rather than by tabs.** The tab bar and the bar above the editor are gone; one schema is open at a time and it is chosen in the tree, which has two sections. _Project_ is what the image was built with — the same for everyone who opens the deployment, read-only, back after every restart. _My files_ are the schemas this reader opened or dropped on the page, which live in that browser and nowhere else. Merging the two into one list would have been tidier and would have quietly lied about which schemas survive a cleared cache. Editing a project file keeps your version beside its path and marks the row; the row's menu gives the image's version back. Downloading and saving the layout moved into the diagram's toolbar, and downloading is also on every row — a schema with a typo in it has no diagram, so no toolbar, at exactly the moment somebody wants their text out of the page. What this costs is switching quickly between two schemas: a click on the neighbouring tab is now finding a row in the tree.
- **One palette for the diagram and everything around it.** The chrome is DOM and the diagram is a canvas, and the two had been themed by different sets of greys that nobody had compared side by side. Both now read the same values from one file, and the class that selects light or dark sits on the document root — so in the extension the page around the diagram turns over with it rather than staying in daylight colours. The extension inherits the new palette; the diagram's own colours are the same roles in new values, not a redraw.

### Fixed

- On the site, the theme toggle turned over only the half of the page the diagram owned: the editor and everything beside it stayed dark while the diagram went light. The whole page follows the toggle now, the editor included — it has a light syntax theme of its own, rather than the dark one on a white page.

## [0.14.1] - 2026-08-18

### Changed

- Auto-arrange now tucks the tables that have no relations into the space either side of the diagram, instead of gathering them in a block underneath it. A hub-and-spoke diagram is taller than it is wide, so the columns beside it are free: nothing has to reach a table with no relations and nothing is hidden by putting one there, while underneath costs their full height. On an eighteen-table schema whose four unrelated tables were the largest in the file, the arrangement went from 1518x8830 to 3012x4518 — fit-to-view doubled, from 12% to 24%. A table too tall to fit beside the diagram still goes underneath, because using the side would mean making the diagram taller than it already is.

### Fixed

- Auto-arrange aimed at a target shape that never reached the layout. The floor of its search was the tallest table in the schema, and the tallest table is often one with no relations — which is placed beside the diagram or beneath it and never enters a column, so the search had nothing it was allowed to change. Every target shape produced an identical arrangement. Separately, each group of related tables was placed under the last one, so five small groups became a ribbon four times taller than any of them. Both are fixed; on the schema they were found on the two together are worth very little, but the setting now does what it says.
- Auto-arrange left relations hidden underneath tables when the diagram was drawn with curves. Curves had been given the tighter arrangement of the two, on the reasoning that a curve sweeps through whatever space there is — which it does, including the space a table is standing in. Right angles are routed around what stands between a relation's ends; a curve takes the direct line and passes under it, and tables are drawn over relations, so what it passes under is not drawn at all. Measured on a hub-and-spoke schema, a quarter of every relation's length was hidden. Curves now get the roomier arrangement of the two, which puts them at 8% against 10% for right angles, and the arrangement is about a tenth larger in each direction as a result.

## [0.14.0] - 2026-08-18

### Added

- **A `.dbml` file switches between text and diagram in the same tab.** The diagram is now a custom editor of the file rather than a panel opened beside it, with buttons in the editor title to move between the two views. Opening a file still gives you the text; the diagram is a deliberate choice, and either view can be the one you leave open. The segmented Preview|Markdown control that Markdown has is not reachable from the extension API — this is the closest equivalent that is.
- **Syntax highlighting for DBML.** The extension declared the language and gave it a file icon but contributed no grammar, so a `.dbml` file opened as plain text. Keywords, strings including the triple-quoted note, the settings bracket with its attribute names, numbers, comments and the cardinality operators are highlighted now. Column types are deliberately left out: DBML does not close that set, so listing the common ones would leave every other type looking wrong. A language configuration comes with it, so `Ctrl+/` comments and brackets match — neither of which worked before.
- **A choice of how relations are drawn**, curves or right angles, next to auto-arrange. Curves are the default: they read well for as long as a diagram is small enough to take in, which most are, and right angles earn their keep on the large ones. Auto-arrange is told which is in use, because right angles need a corridor wide enough to run a line down while curves sweep through whatever space there is.

### Changed

- **Hiding a table's relations no longer edits the file.** `Alt+H` used to comment `Ref:` lines out of the `.dbml` and mark the table in MetaInfo, while the icon in the table header hid the same relations on the canvas alone — two mechanisms for one idea, and only the destructive one drew the dashed outline. They are one view preference now, remembered per machine and never written to the file. Two consequences worth knowing: the state no longer travels between people through the file, and relations that an earlier version already commented out stay commented out — the extension leaves them alone, and they have to be restored by hand.
- **Auto-arrange rearranges the schema around its busiest table** instead of drawing layers. The most-connected table sits in the middle and the rest fan out left and right by level; tables with no relations — including those whose relations are hidden — are grouped into a compact block below. The height is chosen so the result fits on screen.
- **A schema too big to draw at full detail opens with table headers.** Every column row is about eight Konva nodes, so a 5,676-column schema arrived as 46,210 nodes and about 155 ms a frame; the same schema with headers only is 821 nodes and about 3 ms. Full detail is still one keypress away.
- **Only what is on screen is drawn, at the size it is seen.** Tables outside the view are no longer mounted, and column rows are drawn while a row is at least six screen pixels tall. Zoomed out past that, a table keeps its size and its header but not its rows — long before a name can be read, the rows still say how big a table is and where a relation arrives.
- **More room between tables at full detail.** Fifty pixels was most of a table when tables were small; at full detail they are around 450 wide and over a thousand tall, and the same fifty pixels left the relation lines lost somewhere behind a wall of blocks.
- Auto-arrange now reframes the view on the result. Pressing `L` while zoomed in could put the whole new arrangement off screen with nothing on screen changing to say why.
- A diagram now belongs to its document instead of there being one for the whole window, so several `.dbml` files can be open as diagrams at once.

### Fixed

- `Alt+H` did nothing in the extension while it worked on the site. Three things stood between the chord and the toggle: a workbench binding matching on the language alone consumed it while the diagram had focus, the command posted from inside the webview never reached the page, and once the diagram became a custom editor a single keypress reached both the in-webview shortcut and the extension command — two toggles that cancelled each other out.
- Hovering a table on a large schema cost about 100 ms. The column map was rebuilt on every pointer move, by an algorithm that was quadratic in the number of columns; it now depends only on the schema and the detail level, as it always did in principle.
- A hover re-rendered the whole diagram — 117 headers, 93 connections and, at full detail, 5,676 column rows — almost none of which were affected by the table under the pointer. Two tables wake up now.
- Zoom lagged behind the wheel. Wheel events are coalesced into one frame, and tables and connections are drawn on a layer each so dragging one no longer redraws the other.
- Auto-arrange could produce an unusable strip. On a 117-table schema the old layout came out 1,980 wide and 145,826 tall, which fit-to-view could only answer by shrinking everything to a blank canvas.
- Switching a file to the diagram left the original tab open beside it instead of taking it over.

## [0.13.0] - 2026-07-21

### Added

- **Export to Markdown** — the same table reference the AsciiDoc export produces, in Markdown: a section per table with its description, a column table and its relations.

## [0.12.0] - 2026-07-21

### Added

- Toolbar tooltips that appear immediately and are styled like the rest of the editor, replacing the native ones that took about a second and looked out of place. Where an action has a keyboard shortcut the tooltip names it, read from the same registry the shortcut fires from. The shortcut is part of each button's accessible name too, so it reaches screen-reader users as well.

### Changed

- Toolbar labels now follow one rule: a control that holds a state shows its name, so its value can be read at a glance; a one-shot action shows only an icon and explains itself through its tooltip. **Auto-arrange** and **Fit to view** therefore lost their labels, and the toolbar is narrower than before. The theme toggle is the one exception — it holds state but stays icon-only, because its icon already switches between a sun and a moon.
- The three export buttons (PNG, SVG, AsciiDoc) had near-identical icons and gave no way to tell the formats apart. They are now one **Export** button opening a menu that names each format; it closes on `Esc` or a click outside.

### Fixed

- The Activity Bar panel kept its group names, action labels and empty-state text in English while the command palette and the diagram followed the display language. All of them are translated now. A saved connection's own name is user data and is deliberately left as typed.

## [0.11.0] - 2026-07-20

### Added

- Localized interface following the VS Code display language: English, Russian and Simplified Chinese. Other display languages fall back to English, including Traditional Chinese. The Chinese translation is a community contribution and has not been reviewed by a native speaker.
- Keyboard shortcuts for the view actions, with an on-screen legend: `C` colored relations, `A` relation animation, `S` short table names, `D` detail level, `L` auto-arrange, `F` fit to view, `?` legend. The legend is generated from the same registry the shortcuts fire from, so it cannot drift from the actual bindings.
- **Relation animation** — when enabled, the relations of the table under the cursor animate as travelling dashes, showing the direction of each relation.

### Changed

- The relation-highlight toolbar option is now **Colored relations** with a palette icon. Behaviour is unchanged (off: relations are grey and colour on hover; on: every relation is permanently coloured by its source table), and the stored setting is preserved.
- Relation visibility is now toggled by an icon in the table header instead of a toolbar button.
- **Auto-arrange** now always recomputes a fresh layout instead of restoring previously saved positions, and persists the result.

### Fixed

- Toolbar settings (colored relations, short table names) now take effect immediately instead of waiting for an unrelated re-render.
- Webview styles were missing when the extension ran under the debugger (F5); the CSS is now generated on every build, including watch rebuilds.
- Auto-layout was skewed by refs pointing at tables outside the schema and by self-references, which created phantom nodes.
- A connection string with surrounding whitespace passed validation but failed at connect time.
- Import: a file-write failure (read-only path, full disk) was reported as a database error.
- Import: a failure to open the saved file no longer swallows the "save this connection" prompt or the "N cross-schema references were omitted" notice.
- A saved connection whose name matched the "New connection" entry was indistinguishable from it in the picker; a vanished connection now reports itself instead of failing silently.
- Underlying causes of import/compare failures are now logged to the Extension Host log instead of being discarded.
- Panel: per-connection commands are hidden from the command palette, and the connections tree refreshes automatically.

## [0.10.0] - 2026-07-17

### Added

- Add an Activity Bar sidebar panel with quick actions (Show diagram, Import from database, Compare with database) and a saved-connections list with per-connection import, compare, and delete.

## [0.9.0] - 2026-07-17

Fork release published under publisher `konyshevav`. Based on [BOCOVO/db-schema-visualizer](https://github.com/BOCOVO/db-schema-visualizer) (MIT).

### Added

- **DBML: Import from database** — generate a `.dbml` file from a PostgreSQL schema
- **DBML: Compare with database** — diff the active `.dbml` file against a live PostgreSQL schema (Markdown report)
- Saved PostgreSQL connection strings in VS Code SecretStorage
- MetaInfo block sync: table positions are saved into `/*MetaInfo ... MetaInfo*/` in the DBML file
- Export diagram to SVG and AsciiDoc
- Toggle relation visibility per table on the canvas
- Alt+H command to comment/uncomment refs in DBML for the hovered table
- Toolbar options: short table names and always-on relation highlighting
- Hidden refs indicator on tables when MetaInfo marks refs as hidden

### Changed

- Independent fork maintenance; see repository README for upstream attribution and license

## [0.8.0]

### Added

- Export diagram to png

## [0.7.0]

### Added

- Added search feature

## [0.6.0]

### Added

- Added support for controlling scroll behavior via the prismaERDPreviewer.scrollDirection setting
- Added an option to automatically fit the diagram to the viewport dimensions

## [0.5.0]

### Added

- Display diagnostic errors directly on code editor lines instead of displaying toast messages
- Showing `not_null` label for not null columns

## [0.4.0]

### Added

- Improve auto layout with dagrejs

## [0.3.4]

### Added

- Added DBML logo as file icon for dbml file

### Fixed

- Dependence with the `vscode-dbml` VS Code plugin

## [0.3.3]

### Fixed

- Prevent table names from being truncated for long table name
- Typo in preview tab name

## [0.3.2]

### Fixed

- Remove `languages` section from the package.json

## [0.3.1]

### Fixed

- Improved multi-schema code handling

## [0.3.0]

### Added

- Ability to toggle table visualization mode. Display all columns, relational columns only or table headers only by [@tv-long](https://github.com/tv-long)

## [0.2.0]

### Added

- Support table header customization via table settings in the dbml code by [@tv-long](https://github.com/tv-long)

## [0.1.0]

### Added

- Make the table width fit the table content
- Save and restore tables positions on exiting
- Save and restore stage position on exiting

## [0.0.3]

### Added

- Display an `empty content message` when there is no table in the schema
- Enhance message for undefined schema

### Fixed

- Remove mention of Prisma from plugin description

## [0.0.2]

### Added

- Create diagram from DBML code
- Add light and dark theme
