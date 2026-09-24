// The Python package's tests, as the repository-wide `yarn test` sweep runs
// every package's: through its own `test` script.
//
// Fails, loudly, when the package's environment does not exist. Skipping would
// report a green sweep that never ran these tests — the exact hole
// `scripts/test.js` was written to close.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = path.join(root, ".venv", "bin", "python");

if (!existsSync(python)) {
  console.error(
    "mkdocs-dbml: there is no Python environment at packages/mkdocs-dbml/.venv.",
  );
  console.error("Create it once with:  yarn workspace mkdocs-dbml setup");
  process.exit(1);
}

const result = spawnSync(python, ["-m", "pytest", ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
