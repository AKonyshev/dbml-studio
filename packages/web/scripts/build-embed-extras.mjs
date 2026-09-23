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
