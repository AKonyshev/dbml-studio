# Changelog

The Obsidian plugin's own history. The version is the root `manifest.json`'s;
the format is [Keep a Changelog](http://keepachangelog.com/).

## [0.2.0] - 2026-10-06

Made for Obsidian's Community plugins directory.

### Added

- An English interface. Block errors, notices and the command name are in
  English, and in Russian when Obsidian's own language is Russian. The
  command is "Refresh diagrams" ("Обновить диаграммы" in Russian).

### Changed

- Installed from Obsidian's Community plugins: Settings → Community plugins
  → Browse, "DBML Studio". The zip on the GitHub release still installs by
  hand.
- The diagram frame travels inside `main.js`. On the first start, and after
  each update, the plugin writes it into `frame/` in its own folder; a start
  with an up-to-date frame writes nothing. Nothing is downloaded.
- Needs Obsidian 1.13.7 or later, the version it is checked on.

## [0.1.0] - 2026-09-29

The first release. Installed by unzipping `dbml-studio-obsidian-0.1.0.zip`
into a vault's `.obsidian/plugins/`; desktop only, because models are read
from outside the vault.

### Added

- A ` ```dbml ` block that names a `model:` is drawn as an ER diagram in
  the note: the whole model, or the tables the block lists, at the height it
  asks for.
- The diagram follows Obsidian's light and dark theme unless the block pins
  one, and keeps its view and layout when the theme changes.
- "Обновить диаграммы" re-reads every model on screen.
- A diagram can be expanded over its note's pane, and Escape puts it back.
- A note opened in a popout window draws its diagrams there too, keeps
  following the theme, and keeps its diagrams when its tab moves to another
  window.
- A diagram loads when it first comes on screen, so the copy of a note
  Obsidian keeps hidden costs no memory.
- A ` ```dbml ` block of DBML code stays code.
