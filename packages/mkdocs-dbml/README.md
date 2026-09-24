# mkdocs-dbml

A ` ```dbml ` block in a MkDocs page becomes an interactive
entity-relationship diagram. The diagram frame from [DBML
Studio](https://github.com/AKonyshev/dbml-studio) ships inside the package, so
neither building nor reading the site needs the network.

## Install

```bash
pip install mkdocs-dbml
```

```yaml
plugins:
  - dbml
```

## A block

````markdown
```dbml
model: /models/acl.dbml
tables: analysis, analysis_liquid
height: 600
```
````

- **`model`** — the `.dbml` file to draw. A leading `/` starts at the docs
  root (`docs_dir`); anything else starts at the current page's own folder.
  `..` is allowed, for a model that lives beside the documentation rather than
  inside it.
- **`tables`** — a slice of the schema, comma-separated or as a YAML list.
  Both full (`acl.analysis`) and short (`analysis`) names work, as long as a
  short name is unambiguous in the file.
- **`height`** — the frame's height in pixels. Default 500.
- **`theme`** — `light` or `dark`.

A ` ```dbml ` block with no `model:` line is left as highlighted code —
that is what the fence has always meant on a page documenting the DBML
language itself, and this plugin does not touch it.

## Configuration

```yaml
plugins:
  - dbml:
      height: 500 # default for every block
      theme: null # null follows the page's own theme
      validate: true # check every model at build time
```

- **`height`** — the default when a block does not set its own.
- **`theme`** — set, every diagram opens in that theme and does not follow the
  page's theme toggle. Left unset (the default), a block without its own
  `theme:` follows the page.
- **`validate`** — see below.

## Checking models

At build time, every model a block names is checked by the same rules the
frame itself draws by. Each finding is a warning naming the page and the
block, `some/page.md, block 2: …`; `mkdocs build --strict` turns those
warnings into a failed build, the same flag MkDocs already uses for a broken
link.

This needs `node` on `PATH`. Without it, the build prints one warning that
models were not checked and the pages come out whole — the diagrams are still
there, just unverified. Under `--strict` that one warning also fails the
build, which is the point for a CI pipeline that expects `node` to be present.

The check is stricter than the frame: a saved table position for a table the
model no longer has is a finding too, even though the frame simply ignores it.
That is usually the trace of a rename, and the sooner it is seen the better.

## Themes

With `mkdocs-material`, a diagram opens in the palette's current theme and
follows the toggle afterward, without reloading the frame; the name of the
dark palette is read from `palette` in `mkdocs.yml`. A block that names its
own `theme:` is fixed and does not follow the toggle.

With any other theme, there is no toggle the plugin knows how to watch. The
diagram opens in the theme the block or the config names, or light by default.

## What goes into the site

The diagram frame and the host script go into `_dbml/` at the site root — that
path is reserved; a `docs_dir` that already has a file there fails the build.
A model outside `docs_dir` is copied to
`_dbml/models/<path from mkdocs.yml's folder>`; a model inside `docs_dir`
is left where MkDocs already copies it.

## Known limits

- A block is only recognised at the top level of a page — not indented inside
  a list item or an admonition.
- `mkdocs serve` watches the folders of models outside `docs_dir`, but only
  once it has seen them in a first build; a block naming a new outside folder
  needs the server restarted.
- An unclosed `/*MetaInfo` comment is reported as a DBML parse error, not as a
  layout problem — the parser fails before the layout check ever runs.

## License

MIT. See [LICENSE](../../LICENSE) in the repository root.
