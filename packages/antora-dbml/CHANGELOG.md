# Changelog

## [0.1.1] - 2026-10-07

### Fixed

- A playbook or block value given as a mapping where a single value belongs —
  `theme: {mode: dark}` — is quoted as written in the error, as
  `{"mode":"dark"}`, instead of as `[object Object]`.

### Changed

- The diagram frame is built with current libraries, among them version 10
  of the DBML parser. Diagrams draw as before, but every page with one now
  downloads about 2.8 MB of compressed script in place of 1.8, and the package
  is 5.5 MB in place of 3.5.

## [0.1.0] - 2026-10-06

### Added

- `dbml::<model>[tables=…,height=…,theme=…]` draws a DBML Studio diagram of a
  model from the folder named by `models` in the playbook.
- The frame, its host script and the named models go into the site under
  `_dbml/`; pages link to them relatively, so the site works from a sub-path.
- Every drawn block is checked at build time; findings are warnings, or stop
  the build with `validate: error`.
