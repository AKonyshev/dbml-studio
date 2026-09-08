# Agent guide

Conventions agents should follow when working in this repository.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, used verbatim (`needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Releasing

`docs/releasing.md` has the order: the version lives in the extension's
`package.json`, the release commit carries it and a changelog entry, the tag
goes on the merge commit, and every release carries a `.vsix`. Publishing to the
Marketplace is the last step and a deliberate one.

## Type checking and tests

`yarn typecheck` checks every package and `yarn test` runs every package's
suite. Both run on every commit, invoked from `.husky/pre-commit` rather than
through lint-staged, because neither takes a file list.

Package `tsconfig.json` files must stay strict JSON (no comments) —
`jest.config.js` files `require()` them.

Both scripts discover packages through `scripts/workspace-packages.js`, and both
fail loudly rather than skipping: a package with TypeScript and no tsconfig, or
with test files and no `test` script, is an error and is named.

Read `docs/typecheck.md` and `docs/testing.md` before changing the tsconfigs,
the lint-staged config, the husky hook, a package's `test` script, or anything
under `scripts/`. Both documents exist because these checks have silently passed
everything before.

## Do not call a user-facing feature done until it has run in VS Code

A green suite is not evidence that a feature works. Automated tests use
fixtures, and a fixture is a schema you wrote to suit the code you were
writing — it is the one input guaranteed not to surprise you.

So, before saying that anything a reader can see or press is implemented:
build the extension, install the `.vsix` or launch the extension host, open a
**real schema from this repository or from the reader's own work**, and use the
feature by hand.

This exists because it was skipped. Editing columns from the diagram shipped
with unit tests, an integration test and a review, all green, and was broken on
the very first real file: the editing core parsed with `Parser.parse`, which
builds the DBML model, while the diagram parses with `parseDBMLToJSON`, which
does not. A model rejects things a diagram happily draws — an index naming a
column that is not declared is enough. One such flaw anywhere in a file made
every column in it uneditable, and reported the failure against a table the
reader had never touched. Every fixture in the suite was clean, so nothing
failed. Ten seconds with a real schema would have.

The general shape of the mistake is worth naming, because it is not about
parsers: **when new code re-reads something the product already reads, it must
come through the same door.** A second, stricter entry point looks correct in
isolation and disagrees with the product in the field.
