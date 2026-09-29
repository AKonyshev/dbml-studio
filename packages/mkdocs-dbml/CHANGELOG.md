# Changelog

The MkDocs plugin's own history. The version is `pyproject.toml`'s; the format
is [Keep a Changelog](http://keepachangelog.com/).

## [0.1.0] - 2026-09-29

The first release: a wheel attached to the GitHub release, installed with
`pip install mkdocs_dbml-0.1.0-py3-none-any.whl`. Not on PyPI yet.

### Added

- A ` ```dbml ` block that names a `model:` is drawn as the interactive ER
  diagram in the page: the whole model, or the tables the block lists, at the
  height it asks for. The diagram frame ships inside the plugin, so neither the
  build nor the page needs the network.
- A model can sit beside the documentation rather than inside it: `..` is
  allowed up to the folder `mkdocs.yml` is in, and such a model — or one
  `exclude_docs:` or a dot-folder keeps out of the site — is copied into the
  site for the diagram.
- Every model is checked at build time by the same rules the diagram draws by.
  A table the page asks for and the model lacks, a model that does not parse,
  or a broken saved layout is a warning naming the page and the block, so
  `mkdocs build --strict` fails instead of publishing an error message. Without
  `node` on `PATH` the models go unchecked with one warning, and the pages are
  built as usual.
- A mistake in a block — an unknown key, a missing file — is shown in the page
  and warned about in the build log.
- With Material, a diagram opens in the page's palette and follows its light
  and dark switch; when the palette follows the reader's system, the diagram
  opens in the system's theme from the first paint. A block's `theme:` or the
  plugin's `theme` option pins it.
- A ` ```dbml ` block of DBML code, and a ` ```dbml ` example shown inside
  another fence, stay code.
