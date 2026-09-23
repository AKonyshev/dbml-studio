// What a documentation site takes from this package besides the frame itself.
//
// Built with esbuild rather than by Vite, and deliberately not fingerprinted:
// these two files are referenced by a plugin that vendors them by name, not by
// a document Vite rewrote. Run after `vite build`, which empties `dist`.
import { copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [path.join(root, "src/embed/host/main.ts")],
  outfile: path.join(root, "dist/frame-host.js"),
  bundle: true,
  format: "iife",
  target: "es2019",
  minify: true,
});

await copyFile(
  path.join(root, "src/embed/host/host.css"),
  path.join(root, "dist/frame-host.css"),
);

// `.mjs`, not `.js`: this file is vendored into a Python package, where there
// is no `package.json` for Node to read a module type out of, and a bundle
// Node decides to treat as CommonJS fails on its first `import`.
await build({
  entryPoints: [path.join(root, "src/validate/main.ts")],
  outfile: path.join(root, "dist/validate.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  // The DBML parser's ANTLR runtime is CommonJS and calls a literal
  // `require("fs")` of its own, for a `FileStream` class this bundle never
  // uses. esbuild cannot turn that into a static import inside a bundle whose
  // own output format is ESM, so it leaves a runtime `require` lookup behind
  // that a plain ES module does not have. This banner gives the bundle one,
  // built from the running Node process rather than from the bundle's own
  // (nonexistent) CommonJS scope.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
