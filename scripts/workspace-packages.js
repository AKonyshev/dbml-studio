// Package discovery shared by the repo-wide sweeps (`scripts/typecheck.js`,
// `scripts/test.js`).
//
// Both sweeps ask the same two questions of every workspace package: what is in
// its package.json, and does it contain files of some kind (TypeScript sources,
// test files). Both also have to answer "which packages did I skip, and should
// I have?" — a sweep that quietly drops a package reports success it did not
// earn. Keeping the walk in one place keeps those answers consistent.

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const packagesDir = path.join(repoRoot, "packages");

// Build output, not sources: `coverage/` is here because `jest --collectCoverage`
// creates one in most packages.
const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "out",
  ".turbo",
  "coverage",
  // A Python environment is thousands of files of someone else's packages,
  // and one stray `.ts` among them would make `typecheck.js` call the
  // package "TypeScript without a tsconfig".
  ".venv",
  "__pycache__",
  ".pytest_cache",
  ".ruff_cache",
]);

/** Absolute paths of every directory directly under `packages/`. */
const packageDirs = () =>
  fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !IGNORED_DIRS.has(entry.name))
    .map((entry) => path.join(packagesDir, entry.name));

/**
 * True when any file below `dir` has a name `matches` accepts. Recurses past
 * build output and dependencies, so it sees only files the package owns.
 */
const containsFile = (dir, matches) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      if (containsFile(path.join(dir, entry.name), matches)) return true;
      continue;
    }
    if (matches(entry.name)) return true;
  }

  return false;
};

/** The package's parsed manifest, or null when it has no package.json. */
const readPackageJson = (dir) => {
  const manifest = path.join(dir, "package.json");
  if (!fs.existsSync(manifest)) return null;

  return JSON.parse(fs.readFileSync(manifest, "utf8"));
};

module.exports = { repoRoot, packageDirs, containsFile, readPackageJson };
