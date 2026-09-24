// Only per-file work belongs here. The repo-wide checks — `yarn typecheck` and
// `yarn test` — live in `.husky/pre-commit`, because neither takes a file list
// and nothing about which files are staged narrows what they need to cover.
//
// Type checking used to hang off the `*.{ts,tsx}` glob, which meant a commit
// touching only a `tsconfig.json` skipped it — the one edit most able to break
// type checking was the one edit that escaped it.
//
// Every value below must stay a plain string. When a lint-staged value is a
// FUNCTION, its return string is used verbatim and the staged filenames are
// never appended; this config once read `() => "yarn tsc-files --noEmit"`, which
// therefore ran with no input files, and `tsc-files` with no files exits 0. The
// pre-commit typecheck silently passed everything for as long as that stood.

module.exports = {
  // `cjs` and `mjs` are here because they were not, and `packages/web/jest.config.cjs`
  // slipped past both eslint and prettier as a result — the same shape of hole as
  // trap 5, one file extension over.
  "*.{ts,tsx,js,cjs,mjs}": ["eslint --fix", "prettier --write"],
  "*.{md,json}": "prettier --write",
  // Python lives in one package, and its linter in that package's own
  // environment rather than on anyone's PATH: a missing environment fails the
  // commit with "no such file", fixed by `yarn workspace mkdocs-dbml setup`.
  "*.py": [
    "packages/mkdocs-dbml/.venv/bin/ruff check --fix",
    "packages/mkdocs-dbml/.venv/bin/ruff format",
  ],
};
