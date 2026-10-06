# Changelog

## [0.1.0] - 2026-10-06

### Added

- `dbml::<model>[tables=…,height=…,theme=…]` draws a DBML Studio diagram of a
  model from the folder named by `models` in the playbook.
- The frame, its host script and the named models go into the site under
  `_dbml/`; pages link to them relatively, so the site works from a sub-path.
- Every drawn block is checked at build time; findings are warnings, or stop
  the build with `validate: error`.
