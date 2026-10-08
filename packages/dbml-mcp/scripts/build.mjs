// Bundles the server into one CommonJS file with no runtime dependencies:
//   node scripts/build.mjs                         → dist/server.cjs
//   node scripts/build.mjs --outfile <path>        → <path> (the extension uses this)
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const at = process.argv.indexOf("--outfile");
const outfile =
  at >= 0
    ? path.resolve(process.argv[at + 1])
    : path.join(pkg, "dist/server.cjs");

await build({
  entryPoints: [path.join(pkg, "src/bin.ts")],
  outfile,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  // @dbml/core carries parsers for five SQL dialects; minifying takes the
  // bundle from about 27 MiB to about 16 MiB.
  minify: true,
  banner: { js: "#!/usr/bin/env node" },
  // pg tries `require("pg-native")` and falls back when it is absent.
  external: ["pg-native"],
  // db-to-dbml and schema-diff name src/index.js, which exists only as .ts.
  alias: {
    "db-to-dbml": path.join(pkg, "../db-to-dbml/src/index.ts"),
    "schema-diff": path.join(pkg, "../schema-diff/src/index.ts"),
  },
  logLevel: "warning",
});

const kib = Math.round(statSync(outfile).size / 1024);
console.log(
  `dbml-mcp bundle: ${path.relative(process.cwd(), outfile)} (${kib} KiB)`,
);
