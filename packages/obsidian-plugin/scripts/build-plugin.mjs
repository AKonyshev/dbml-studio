// Bundles src/main.ts into the main.js Obsidian loads from the plugin folder.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// `obsidian` is provided by the application at run time, and the Node builtins
// resolve inside Electron: bundling either one produces a plugin that fails to
// load with no message anywhere.
await build({
  entryPoints: [path.join(root, "src/main.ts")],
  outfile: path.join(root, "main.js"),
  bundle: true,
  format: "cjs",
  target: "es2022",
  platform: "browser",
  external: [
    "obsidian",
    "electron",
    "node:fs",
    "node:fs/promises",
    "node:path",
  ],
  logLevel: "info",
});
