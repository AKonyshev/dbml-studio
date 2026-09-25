// Builds the frame Obsidian can load — one self-contained frame/embed.html,
// its JavaScript and CSS inline — out of packages/web/dist.
//
// Why one file: a document served from the plugin folder through
// `getResourcePath` runs inline scripts, but Obsidian refuses every external
// script it names, module or classic (`net::ERR_BLOCKED_BY_CLIENT`, probe of
// 2026-09-25). `blob:` and `srcdoc` would run, but with the window's origin
// or with none.
//
// Which files: the rule packages/web/README.md states ("Packaging the frame
// from the manifest"), which packages/mkdocs-dbml/scripts/vendor.mjs follows
// too. The whole graph is walked, although only its entry is handed to
// esbuild, so that a change in the graph breaks this loudly instead of
// shipping a frame that does not draw.
//
// Refuses, naming the chunk or file, what inlining cannot carry: a dynamic
// import or an emitted asset (a file one document cannot reach), `url(` in
// the CSS (the same), `</script` or `<!--` in the JS (either would end or bend
// an inline script), and any `src=` or `href=` left in the document. Empties
// the output first, so nothing of an earlier run rides along.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(here, "..");

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : path.resolve(process.argv[index + 1]);
};

const dist = option("--dist", path.join(packageRoot, "..", "web", "dist"));
const out = option("--out", path.join(packageRoot, "frame"));

const fail = (message) => {
  console.error(`vendor-frame: ${message}`);
  process.exit(1);
};

const manifestPath = path.join(dist, ".vite", "manifest.json");
if (!existsSync(manifestPath)) {
  fail(`no ${manifestPath}. Build the site first: yarn build:web`);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const entry = manifest["embed.html"];
if (entry === undefined) {
  fail(`${manifestPath} has no embed.html entry`);
}

// The README's walk, with two refusals of its own: what it would copy as a
// separate file, a single document has no way to load.
const scripts = [];
const styles = [];
const seen = new Set();
const walk = (key) => {
  if (seen.has(key)) return;
  seen.add(key);
  const chunk = manifest[key];
  if (chunk === undefined)
    fail(`${manifestPath} names ${key} but has no entry for it`);
  if ((chunk.dynamicImports ?? []).length > 0) {
    fail(
      `${key} has a dynamic import (${chunk.dynamicImports.join(", ")}); ` +
        "a single-file frame cannot load it",
    );
  }
  if ((chunk.assets ?? []).length > 0) {
    fail(
      `${key} emits assets (${chunk.assets.join(", ")}); ` +
        "a single-file frame cannot load them",
    );
  }
  if (chunk.file) scripts.push(chunk.file);
  styles.push(...(chunk.css ?? []));
  for (const next of chunk.imports ?? []) walk(next);
};
walk("embed.html");

const missing = ["embed.html", ...scripts, ...styles].filter(
  (file) => !existsSync(path.join(dist, file)),
);
if (missing.length > 0) {
  fail(`${dist} is missing ${missing.join(", ")}. Rebuild it: yarn build:web`);
}

// Either would end an inline script early, or put the HTML parser into a
// state the script's own text does not expect.
const unsafeInScript = (text) =>
  /<\/script/i.test(text) ? "</script" : text.includes("<!--") ? "<!--" : null;

for (const file of scripts) {
  const found = unsafeInScript(readFileSync(path.join(dist, file), "utf8"));
  if (found !== null) {
    fail(`${file} contains "${found}", which an inline script cannot hold`);
  }
}

const css = styles
  .map((file) => {
    const text = readFileSync(path.join(dist, file), "utf8");
    if (/url\(/i.test(text)) {
      fail(
        `${file} points at a file with url(); a single-file frame cannot load it`,
      );
    }
    if (/<\/style/i.test(text)) {
      fail(
        `${file} contains "</style", which an inline stylesheet cannot hold`,
      );
    }
    return text;
  })
  .join("\n");

let bundle;
try {
  // The Vite chunks on disk are already minified, but esbuild does not copy
  // their bytes through: bundling re-parses each one to an AST and reprints
  // it, so without `minify: true` here the output is a full, unminified
  // reprint of already-minified code — bigger than the sum of the chunks it
  // came from. Minifying again on the way out keeps the frame the size the
  // build actually promises.
  const result = await build({
    entryPoints: [path.join(dist, entry.file)],
    bundle: true,
    format: "esm",
    minify: true,
    write: false,
    logLevel: "silent",
  });
  bundle = result.outputFiles[0].text;
} catch (error) {
  fail(`esbuild could not bundle ${entry.file}: ${error.message}`);
}

// Run on the final (minified) text, not the pre-minify one: minification can
// in principle fold string literals in ways that only spell "</script" or
// "<!--" once identifiers are shortened and whitespace is dropped, so the
// scan has to see exactly what gets embedded.
const bundled = unsafeInScript(bundle);
if (bundled !== null) {
  fail(`the bundle of ${entry.file} contains "${bundled}"`);
}

const html = readFileSync(path.join(dist, "embed.html"), "utf8");

const MODULE_SCRIPT = /<script\b[^>]*\bsrc=["'][^"']*["'][^>]*>\s*<\/script>/g;
const external = html.match(MODULE_SCRIPT) ?? [];
if (external.length !== 1) {
  fail(
    `${dist}/embed.html has ${external.length} external scripts; expected one`,
  );
}
if (!html.includes("</head>")) {
  fail(`${dist}/embed.html has no </head> to put the stylesheet before`);
}

// A slot no document contains, so the script goes in last: it is 11 MB of
// text that may well hold "</head>" in a string, and nothing is searched for
// after it is in.
const SLOT = "\u0000dbml-frame-script\u0000";
const shell = html
  .replace(MODULE_SCRIPT, SLOT)
  .replace(/<link\b[^>]*\brel=["']modulepreload["'][^>]*>\s*/g, "")
  .replace(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>\s*/g, "");

const leftover = shell.match(/\b(?:src|href)=["'][^"']*["']/g);
if (leftover !== null) {
  fail(
    `${dist}/embed.html still names ${leftover.join(", ")}, which the frame could not load`,
  );
}

// Functions rather than strings as replacements: a `$` in the bundle or the
// CSS would otherwise be read as a replacement pattern.
const frame = shell
  .replace("</head>", () => `<style>\n${css}</style>\n</head>`)
  .replace(SLOT, () => `<script type="module">\n${bundle}</script>`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "embed.html"), frame);

let buildId = "unknown";
try {
  buildId = execFileSync("git", ["describe", "--always", "--dirty", "--tags"], {
    cwd: packageRoot,
    encoding: "utf8",
  }).trim();
} catch {
  // Not a checkout: the frame is still right, only unnamed.
}
writeFileSync(path.join(out, "BUILD"), `${buildId}\n`);

console.log(
  `vendor-frame: ${scripts.length} scripts and ${styles.length} stylesheets into ${path.join(out, "embed.html")} (${buildId})`,
);
