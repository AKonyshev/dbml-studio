# antora-dbml

A `dbml::` block in an Antora page becomes an interactive entity-relationship
diagram. The diagram frame from [DBML
Studio](https://github.com/AKonyshev/dbml-studio) ships inside the package, so
neither building nor reading the site needs the network.

## Install

```bash
npm install antora-dbml
```

```yaml
# antora-playbook.yml
antora:
  extensions:
    - require: antora-dbml
      models: ./models
```

`models` is the folder of `.dbml` files, relative to the playbook.

## A block

```asciidoc
dbml::acl[tables="analysis, analysis_liquid",height=600,theme=dark]
```

- **target** — the model, as a path inside the `models` folder. `.dbml` is
  added unless the target already ends in it, so `dbml::acl[]` and
  `dbml::acl.dbml[]` are the same block, and `dbml::billing/invoices[]` reads
  `billing/invoices.dbml`. A target that leaves the folder (a leading `/`, a
  drive letter, a backslash, a `..` segment) is refused.
- **`tables`** — a slice of the schema, comma-separated. Both full
  (`acl.analysis`) and short (`analysis`) names work, as long as a short name
  is unambiguous in the file.
- **`height`** — the frame's height in pixels.
- **`theme`** — `light` or `dark`.

A block's attributes override the settings of the playbook. A `height` or
`theme` that is not valid is a warning and the setting is ignored. A block
whose model is missing, or outside the folder, shows an error in the page in
place of the diagram and logs an error.

## Configuration

```yaml
antora:
  extensions:
    - require: antora-dbml
      models: ./models # required
      height: 500 # default for every block
      theme: dark # unset: a block's own, else light
      validate: true # true (default), false, or error
```

- **`models`** — required. The folder the blocks' models are read from. It
  must exist, or the build stops.
- **`height`** — the default when a block does not set its own: a positive
  whole number of pixels. Default 500.
- **`theme`** — `light` or `dark`. Every diagram opens in it unless its block
  names its own. Left unset, a block without a `theme` opens light.
- **`validate`** — `true` (the default), `false` or `error`; see below.

A setting this extension does not know, or one with a value it cannot use,
stops the build with a message naming it.

## Checking models

Once every page is converted, every model a block names is checked by the same
rules the frame itself draws by. Each finding is logged naming the page and the
block, `<page id>, block <n>: …`, where the page id is Antora's own
(`component:ROOT:index.adoc`, with `version@` in front when the component has a version).

- With `validate: true` (the default) findings are warnings. Antora's
  `--log-failure-level=warn` turns any warning into a failed build, the same
  flag it uses for a broken cross reference:

  ```bash
  antora --log-failure-level=warn antora-playbook.yml
  ```

- With `validate: error` findings are errors and the build stops, listing
  how many problems there were.
- With `validate: false` nothing is checked.

`validate: error` does not stop on a block whose model is missing or outside
the folder: that is logged as an error, and Antora's default failure level is
`fatal`, so the build goes on and the page shows the error in place of the
diagram. `antora --log-failure-level=error` makes those fail the build too, and
`--log-failure-level=warn` fails it on any finding, including the warnings about
a bad `height` or `theme`.

The check runs in the Node that runs Antora; nothing else needs installing. A
validator that cannot run — it exits with an error, or answers in a shape the
extension does not know — is an error that stops the build, under `true` as
under `error`: the models were not checked, which is not the same as fine.

The check is stricter than the frame: a saved table position for a table the
model no longer has is a finding too, even though the frame simply ignores it.
That is usually the trace of a rename, and the sooner it is seen the better.

## What goes into the site

The frame, its host script and its stylesheet go into `_dbml/` at the site
root. Only the models the blocks name are copied, to `_dbml/models/<path in
the models folder>`; the rest of the folder stays out of the site.

Pages reach all of it by Antora's own `rootPath` (`..`, `../../..`), so the
site works from any path it is served under, a sub-path included.

## Themes

A diagram opens in its block's `theme`, else the configuration's, else light,
and stays there: Antora's default UI has no theme toggle for a frame to
follow, so a diagram does not change with the page.

## Known limits

- A model is not an Antora resource: it is read from the `models` folder of
  the playbook, not from a component's `modules/` folder, and it does not take
  part in Antora's content aggregation or versioning.
- The frame is about 11 MB. A reader loads it on the first page with a
  diagram, and the browser serves it from its cache on every page after.

## License

MIT. See
[LICENSE](https://github.com/AKonyshev/dbml-studio/blob/main/LICENSE) in the
repository root.
