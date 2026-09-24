// Copies what the MkDocs plugin ships out of packages/web/dist, by the rule
// packages/web/README.md states ("Packaging the frame from the manifest").
//
// Fails, and names what is missing, rather than packaging what it can find: a
// stale or partial `dist` must break the build, not quietly ship a frame that
// does not draw. Empties the output first, so a chunk renamed by a later build
// cannot ride along beside its replacement.
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(here, "..");

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : path.resolve(process.argv[index + 1]);
};

const dist = option("--dist", path.join(packageRoot, "..", "web", "dist"));
const out = option(
  "--out",
  path.join(packageRoot, "src", "mkdocs_dbml", "_vendor"),
);

const fail = (message) => {
  console.error(`vendor: ${message}`);
  process.exit(1);
};

const manifestPath = path.join(dist, ".vite", "manifest.json");
if (!existsSync(manifestPath)) {
  fail(`no ${manifestPath}. Build the site first: yarn build:web`);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (manifest["embed.html"] === undefined) {
  fail(`${manifestPath} has no embed.html entry`);
}

const frameFiles = new Set(["embed.html"]);
const seen = new Set();
const walk = (key) => {
  if (seen.has(key)) return;
  seen.add(key);
  const chunk = manifest[key];
  if (chunk === undefined)
    fail(`${manifestPath} names ${key} but has no entry for it`);
  for (const file of [
    chunk.file,
    ...(chunk.css ?? []),
    ...(chunk.assets ?? []),
  ]) {
    if (file) frameFiles.add(file);
  }
  for (const next of [
    ...(chunk.imports ?? []),
    ...(chunk.dynamicImports ?? []),
  ])
    walk(next);
};
walk("embed.html");

const byName = ["frame-host.js", "frame-host.css", "validate.mjs"];
const missing = [...frameFiles, ...byName].filter(
  (file) => !existsSync(path.join(dist, file)),
);
if (missing.length > 0) {
  fail(`${dist} is missing ${missing.join(", ")}. Rebuild it: yarn build:web`);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, "frame"), { recursive: true });

for (const file of frameFiles) {
  // Chunks sit in `assets/`, a folder the output does not have yet.
  const target = path.join(out, "frame", file);
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(path.join(dist, file), target);
}
for (const file of byName) {
  cpSync(path.join(dist, file), path.join(out, file));
}

let build = "unknown";
try {
  build = execFileSync("git", ["describe", "--always", "--dirty", "--tags"], {
    cwd: packageRoot,
    encoding: "utf8",
  }).trim();
} catch {
  // Not a checkout: the files are still right, only unnamed.
}
writeFileSync(path.join(out, "BUILD"), `${build}\n`);

console.log(
  `vendor: ${frameFiles.size} frame files and ${byName.length} more into ${out} (${build})`,
);
