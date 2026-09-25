/**
 * @jest-environment node
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";

const SCRIPT = path.join(__dirname, "..", "..", "scripts", "vendor-frame.mjs");

/**
 * A built `packages/web/dist` in miniature, shaped like the real one: the
 * frame's entry imports one chunk, which carries the stylesheet; the site's
 * own entry reaches an editor chunk nobody else does.
 */
const MANIFEST = {
  "embed.html": {
    file: "assets/embed-A.js",
    src: "embed.html",
    isEntry: true,
    imports: ["_index-B.js"],
  },
  "_index-B.js": {
    file: "assets/index-B.js",
    css: ["assets/index-C.css"],
  },
  "index.html": {
    file: "assets/main-F.js",
    src: "index.html",
    isEntry: true,
    imports: ["_index-B.js", "_monaco-G.js"],
  },
  "_monaco-G.js": { file: "assets/monaco-G.js" },
};

/** What Vite writes: one module script, one preload, one stylesheet. */
const EMBED_HTML = [
  "<!doctype html>",
  '<html lang="en">',
  "  <head>",
  '    <meta charset="UTF-8" />',
  "    <title>DBML Diagram</title>",
  '    <script type="module" crossorigin src="./assets/embed-A.js"></script>',
  '    <link rel="modulepreload" crossorigin href="./assets/index-B.js">',
  '    <link rel="stylesheet" crossorigin href="./assets/index-C.css">',
  "  </head>",
  "  <body>",
  '    <div id="app"></div>',
  "  </body>",
  "</html>",
].join("\n");

const FILES: Record<string, string> = {
  "embed.html": EMBED_HTML,
  "index.html": "<!doctype html><title>site</title>",
  // Calls across the chunk boundary: the inlined script only works if
  // esbuild really brought the imported chunk in.
  "assets/embed-A.js":
    'import { draw } from "./index-B.js";\nglobalThis.drawn = draw("rd.dbml");\n',
  "assets/index-B.js": 'export const draw = (name) => "drawn " + name;\n',
  "assets/index-C.css": "#app { color: rebeccapurple; }\n",
  "assets/main-F.js": "SITE_ENTRY_MARKER;\n",
  "assets/monaco-G.js": "MONACO_MARKER;\n",
};

interface DistOptions {
  manifest?: Record<string, unknown> | null;
  files?: Record<string, string>;
  skip?: string[];
}

let work = "";

beforeEach(() => {
  work = mkdtempSync(path.join(tmpdir(), "vendor-frame-"));
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

const makeDist = (options: DistOptions = {}): string => {
  const dist = path.join(work, "dist");
  const files = { ...FILES, ...options.files };

  mkdirSync(path.join(dist, "assets"), { recursive: true });

  if (options.manifest !== null) {
    mkdirSync(path.join(dist, ".vite"));
    writeFileSync(
      path.join(dist, ".vite", "manifest.json"),
      JSON.stringify(options.manifest ?? MANIFEST),
    );
  }

  for (const [file, text] of Object.entries(files)) {
    if (!(options.skip ?? []).includes(file)) {
      writeFileSync(path.join(dist, file), text);
    }
  }

  return dist;
};

const vendor = (dist: string, out: string): SpawnSyncReturns<string> =>
  spawnSync(process.execPath, [SCRIPT, "--dist", dist, "--out", out], {
    encoding: "utf8",
  });

/** Runs the vendor script on a dist and returns the frame document it wrote. */
const frameOf = (options: DistOptions = {}): string => {
  const out = path.join(work, "frame");
  const result = vendor(makeDist(options), out);

  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);

  return readFileSync(path.join(out, "embed.html"), "utf8");
};

/** The same manifest with one chunk's entry changed. */
const withChunk = (
  key: keyof typeof MANIFEST,
  change: Record<string, unknown>,
): Record<string, unknown> => ({
  ...MANIFEST,
  [key]: { ...MANIFEST[key], ...change },
});

const listFiles = (dir: string, prefix = ""): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? listFiles(path.join(dir, entry.name), `${prefix}${entry.name}/`)
        : [`${prefix}${entry.name}`],
    )
    .sort();

describe("vendor-frame.mjs", () => {
  // Obsidian refuses every external script a plugin-folder document names,
  // so the frame is one file or nothing.
  it("writes one frame document and its build id, and nothing else", () => {
    const out = path.join(work, "frame");

    expect(vendor(makeDist(), out).status).toBe(0);
    expect(listFiles(out)).toEqual(["BUILD", "embed.html"]);
  });

  it("leaves the document naming no file at all", () => {
    const html = frameOf();

    expect(html).not.toMatch(/\b(?:src|href)=/);
    expect(html).not.toContain("modulepreload");
    expect(html).toContain('<div id="app"></div>');
  });

  it("inlines both chunks into one script that runs", () => {
    const html = frameOf();
    const script = /<script type="module">\n([\s\S]*)<\/script>/.exec(html);
    const sandbox: { drawn?: string } = {};

    expect(script).not.toBeNull();

    runInNewContext(script?.[1] ?? "", sandbox);

    expect(sandbox.drawn).toBe("drawn rd.dbml");
  });

  it("inlines the stylesheet", () => {
    expect(frameOf()).toMatch(/<style>[\s\S]*rebeccapurple[\s\S]*<\/style>/);
  });

  // The whole reason the frame is smaller than the site: not a setting, but
  // the absence of an import.
  it("carries nothing only the site reaches", () => {
    const html = frameOf();

    expect(html).not.toContain("SITE_ENTRY_MARKER");
    expect(html).not.toContain("MONACO_MARKER");
  });

  it("refuses a chunk with a dynamic import, by name", () => {
    const result = vendor(
      makeDist({
        manifest: withChunk("_index-B.js", { dynamicImports: ["src/lazy.ts"] }),
      }),
      path.join(work, "frame"),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("_index-B.js");
    expect(result.stderr).toContain("dynamic import");
  });

  it("refuses a chunk that emits assets, by name", () => {
    const result = vendor(
      makeDist({
        manifest: withChunk("_index-B.js", { assets: ["assets/font-D.woff2"] }),
      }),
      path.join(work, "frame"),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("_index-B.js");
    expect(result.stderr).toContain("assets/font-D.woff2");
  });

  it("refuses a stylesheet that points at a file", () => {
    const result = vendor(
      makeDist({
        files: {
          "assets/index-C.css": '@font-face { src: url("./font-D.woff2"); }\n',
        },
      }),
      path.join(work, "frame"),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("assets/index-C.css");
  });

  it("refuses a script holding a closing script tag", () => {
    const result = vendor(
      makeDist({
        files: {
          "assets/index-B.js":
            'export const draw = (name) => "</script>" + name;\n',
        },
      }),
      path.join(work, "frame"),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("assets/index-B.js");
    expect(result.stderr).toContain("</script");
  });

  it("refuses a script holding an HTML comment opener", () => {
    const result = vendor(
      makeDist({
        files: {
          "assets/index-B.js": 'export const draw = (name) => "<!--" + name;\n',
        },
      }),
      path.join(work, "frame"),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("assets/index-B.js");
    expect(result.stderr).toContain("<!--");
  });

  // An icon, a second script: whatever it is, the frame could not load it.
  it("refuses a document that names a file it does not inline", () => {
    const result = vendor(
      makeDist({
        files: {
          "embed.html": EMBED_HTML.replace(
            "</head>",
            '<link rel="icon" href="./favicon.svg">\n</head>',
          ),
        },
      }),
      path.join(work, "frame"),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("./favicon.svg");
  });

  it("without a manifest, says to build the site first", () => {
    const result = vendor(
      makeDist({ manifest: null }),
      path.join(work, "frame"),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("yarn build:web");
  });

  it("fails, naming a file the manifest names and dist lacks", () => {
    const result = vendor(
      makeDist({ skip: ["assets/index-C.css"] }),
      path.join(work, "frame"),
    );

    expect(result.status).toBe(1);
    // The guard's own message, not just any crash that happens to mention
    // the file: it names the missing file and points at the fix, before any
    // bundling work runs.
    expect(result.stderr).toContain(
      "is missing assets/index-C.css. Rebuild it: yarn build:web",
    );
  });

  it("leaves nothing of an earlier run behind", () => {
    const dist = makeDist();
    const out = path.join(work, "frame");

    vendor(dist, out);
    writeFileSync(path.join(out, "stale.js"), "stale");
    vendor(dist, out);

    expect(existsSync(path.join(out, "stale.js"))).toBe(false);
  });
});
