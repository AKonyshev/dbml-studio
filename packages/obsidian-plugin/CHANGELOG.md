# Changelog

The Obsidian plugin's own history. The version is `manifest.json`'s; the format
is [Keep a Changelog](http://keepachangelog.com/).

## [0.1.0]

### Added

- A ` ```dbml ` block that names a `model:` is drawn as an ER diagram in
  the note: the whole model, or the tables the block lists, at the height it
  asks for.
- The diagram follows Obsidian's light and dark theme unless the block pins
  one, and keeps its view and layout when the theme changes.
- "Обновить диаграммы" re-reads every model on screen.
- A diagram can take the whole window, and Escape puts it back.
- A note opened in a popout window draws its diagrams there too.
- A diagram loads when it first comes on screen, so the copy of a note
  Obsidian keeps hidden costs no memory.
- A ` ```dbml ` block of DBML code stays code.
