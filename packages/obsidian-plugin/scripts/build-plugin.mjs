// Bundles src/main.ts into the main.js Obsidian loads from the plugin folder,
// with the diagram frame inside it.
//
// The Community plugins directory installs a plugin as main.js, manifest.json
// and styles.css, and nothing else, so frame/ (scripts/vendor-frame.mjs's
// output) rides in main.js: embed.html gzipped and base64-encoded, and BUILD
// as it is, through esbuild's `define` (src/globals.d.ts). On load the plugin
// writes them back into its folder (src/frameArchive.ts).
//
// Refuses, naming the file, a frame/ that is not there: run `yarn build:web`,
// then `yarn build:obsidian`, which vendors the frame before it bundles.
//
//   node scripts/build-plugin.mjs [--frame <dir>] [--outfile <file>]
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { build } from "esbuild";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : path.resolve(process.argv[index + 1]);
};

const frame = option("--frame", path.join(root, "frame"));
const outfile = option("--outfile", path.join(root, "main.js"));

const fail = (message) => {
  console.error(`build-plugin: ${message}`);
  process.exit(1);
};

const htmlPath = path.join(frame, "embed.html");
const buildPath = path.join(frame, "BUILD");

for (const file of [htmlPath, buildPath]) {
  if (!existsSync(file)) {
    fail(
      `no ${file}. The frame is vendored first: run \`yarn build:web\`, ` +
        "then `yarn build:obsidian`",
    );
  }
}

// Level 9: built once, unpacked once per update, and every byte saved is a
// byte less of main.js for Obsidian to parse on each start.
const packed = gzipSync(readFileSync(htmlPath), { level: 9 }).toString(
  "base64",
);

// `obsidian` is provided by the application at run time, and the Node builtins
// resolve inside Electron: bundling either one produces a plugin that fails to
// load with no message anywhere.
await build({
  entryPoints: [path.join(root, "src/main.ts")],
  outfile,
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
  define: {
    DBML_FRAME_BUILD: JSON.stringify(readFileSync(buildPath, "utf8")),
    DBML_FRAME_GZIP: JSON.stringify(packed),
  },
  logLevel: "info",
});
