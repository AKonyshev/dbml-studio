import {
  execFileSync,
  spawnSync,
  type SpawnSyncReturns,
} from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Each case is a whole Antora build, a few seconds apiece.
jest.setTimeout(60_000);

const PACKAGE = path.join(__dirname, "..", "..");
const FIXTURES = path.join(__dirname, "fixtures");
// The package's `exports` map hides `bin/`, so the script is found from its package.json.
const ANTORA = path.join(
  path.dirname(require.resolve("@antora/cli/package.json")),
  "bin",
  "antora",
);

// No GIT_* from a commit hook: git here acts on the fixture repository only
// (docs/testing.md, "Inside the hook, git's environment comes along").
const isolatedEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("GIT_")) env[name] = value;
  }
  return {
    ...env,
    GIT_AUTHOR_NAME: "test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
  };
};

let work = "";
let shim = "";

beforeAll(() => {
  work = mkdtempSync(path.join(tmpdir(), "antora-dbml-build-"));
  const lib = path.join(work, "lib");
  execFileSync(
    process.execPath,
    [
      require.resolve("typescript/bin/tsc"),
      "-p",
      path.join(PACKAGE, "tsconfig.build.json"),
      "--outDir",
      lib,
    ],
    { stdio: "pipe" },
  );
  shim = path.join(work, "shim.js");
  writeFileSync(
    shim,
    `module.exports.register = require(${JSON.stringify(path.join(lib, "extension.js"))})` +
      `.createExtension(${JSON.stringify(path.join(FIXTURES, "fake-vendor"))});\n`,
  );
}, 60_000);

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

interface Site {
  pages: Record<string, string>;
  models: Record<string, string>;
  settings?: Record<string, unknown>;
}

interface BuildResult {
  root: string;
  result: SpawnSyncReturns<string>;
  read: (file: string) => string;
  has: (file: string) => boolean;
}

/** Writes, commits and builds a site; returns its folder and Antora's result. */
const build = (site: Site): BuildResult => {
  const root = mkdtempSync(path.join(work, "site-"));
  const content = path.join(root, "content");
  const pages = path.join(content, "docs", "modules", "ROOT", "pages");
  mkdirSync(pages, { recursive: true });
  writeFileSync(
    path.join(content, "docs", "antora.yml"),
    "name: docs\nversion: ~\n",
  );
  for (const [name, text] of Object.entries(site.pages)) {
    mkdirSync(path.dirname(path.join(pages, name)), { recursive: true });
    writeFileSync(path.join(pages, name), text);
  }
  for (const [name, text] of Object.entries(site.models)) {
    mkdirSync(path.dirname(path.join(root, "models", name)), {
      recursive: true,
    });
    writeFileSync(path.join(root, "models", name), text);
  }
  mkdirSync(path.join(root, "models"), { recursive: true });
  cpSync(path.join(FIXTURES, "ui"), path.join(root, "ui"), { recursive: true });

  const git = (...args: string[]): Buffer =>
    execFileSync("git", args, {
      cwd: content,
      env: isolatedEnv(),
      stdio: "pipe",
    });
  git("init", "--quiet");
  git("add", ".");
  git("commit", "--quiet", "-m", "fixture");

  const extension = {
    require: shim,
    models: "./models",
    ...(site.settings ?? {}),
  };
  writeFileSync(
    path.join(root, "antora-playbook.yml"),
    JSON.stringify({
      site: { title: "Fixture" },
      content: {
        sources: [{ url: "./content", start_path: "docs", branches: "HEAD" }],
      },
      ui: { bundle: { url: "./ui" } },
      antora: { extensions: [extension] },
      output: { dir: "./public" },
      runtime: { log: { format: "json" } },
    }),
  );

  const result = spawnSync(process.execPath, [ANTORA, "antora-playbook.yml"], {
    cwd: root,
    encoding: "utf8",
    env: isolatedEnv(),
  });
  const read = (file: string): string =>
    readFileSync(path.join(root, "public", file), "utf8");
  return {
    root,
    result,
    read,
    has: (file: string): boolean => existsSync(path.join(root, "public", file)),
  };
};

/** The JSON log lines of a build, parsed; Antora logs one object per line. */
const logLines = (site: BuildResult): Array<{ level: string; msg: string }> =>
  (site.result.stdout + site.result.stderr)
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as { level: string; msg: string });

const MODEL = "Table a {\n  id int\n}\n";

// Built from code points because the repo keeps Cyrillic out of sources
// (the sourceLanguage test): two Russian words with a space between.
const RU = String.fromCodePoint(
  0x43c,
  0x43e,
  0x434,
  0x435,
  0x43b,
  0x44c,
  0x20,
  0x434,
  0x430,
  0x43d,
  0x43d,
  0x44b,
  0x445,
);

describe("a site with dbml:: blocks", () => {
  it("draws a block on pages at different depths, each pointing to the frame from itself", () => {
    const site = build({
      pages: {
        "index.adoc": '= Top\n\ndbml::shop[tables="a",height=600]\n',
        "deep/er/x.adoc": "= Deep\n\ndbml::shop[]\n",
      },
      models: { "shop.dbml": MODEL },
    });

    expect(site.result.status).toBe(0);
    expect(site.read("docs/index.html")).toContain(
      'src="../_dbml/embed.html?model=models%2Fshop.dbml&amp;tables=a&amp;theme=light" width="100%" height="600"',
    );
    expect(site.read("docs/deep/er/x.html")).toContain(
      'src="../../../_dbml/embed.html?model=models%2Fshop.dbml&amp;theme=light"',
    );
    expect(site.read("docs/deep/er/x.html")).toContain(
      'href="../../../_dbml/frame-host.css"',
    );
  });

  it("ships the frame, the host script and only the models blocks name, once", () => {
    const site = build({
      pages: {
        "a.adoc": '= A\n\ndbml::shop[]\n\ndbml::shop[tables="a"]\n',
        "b.adoc": `= B\n\ndbml::draft/${RU}[]\n`,
      },
      models: {
        "shop.dbml": MODEL,
        [`draft/${RU}.dbml`]: MODEL,
        "unused.dbml": MODEL,
      },
    });

    expect(site.result.status).toBe(0);
    expect(site.has("_dbml/embed.html")).toBe(true);
    expect(site.has("_dbml/assets/frame.js")).toBe(true);
    expect(site.has("_dbml/frame-host.js")).toBe(true);
    expect(site.has("_dbml/frame-host.css")).toBe(true);
    expect(site.has("_dbml/models/shop.dbml")).toBe(true);
    expect(site.has(`_dbml/models/draft/${RU}.dbml`)).toBe(true);
    expect(site.has("_dbml/models/unused.dbml")).toBe(false);
    // The host script once per page, before the first diagram.
    expect(site.read("docs/a.html").match(/frame-host\.js/g)).toHaveLength(1);
  });

  it("adds nothing when the only dbml:: lines are inside a listing", () => {
    const site = build({
      pages: { "a.adoc": "= A\n\n----\ndbml::shop[]\n----\n" },
      models: { "shop.dbml": MODEL },
    });

    expect(site.result.status).toBe(0);
    expect(site.has("_dbml")).toBe(false);
  });

  it("warns about a finding by page and block, and still builds", () => {
    const site = build({
      pages: { "a.adoc": "= A\n\ndbml::ok[]\n\ndbml::bad[]\n" },
      models: { "ok.dbml": MODEL, "bad.dbml": "BROKEN" },
    });

    expect(site.result.status).toBe(0);
    const line = logLines(site).find((entry) =>
      entry.msg.includes("docs:ROOT:a.adoc, block 2: the model is BROKEN"),
    );
    expect(line?.level).toBe("warn");
  });

  it("stops the build on a finding with validate: error", () => {
    const site = build({
      pages: { "a.adoc": "= A\n\ndbml::bad[]\n" },
      models: { "bad.dbml": "BROKEN" },
      settings: { validate: "error" },
    });

    expect(site.result.status).not.toBe(0);
    const line = logLines(site).find((entry) =>
      entry.msg.includes("the model is BROKEN"),
    );
    expect(line?.level).toBe("error");
  });

  it("checks nothing with validate: false", () => {
    const site = build({
      pages: { "a.adoc": "= A\n\ndbml::bad[]\n" },
      models: { "bad.dbml": "BROKEN" },
      settings: { validate: false },
    });

    expect(site.result.status).toBe(0);
    expect(site.result.stdout + site.result.stderr).not.toContain("BROKEN");
  });

  it("puts a visible error in place of a missing model, and logs it", () => {
    const site = build({
      pages: { "a.adoc": "= A\n\ndbml::nope[]\n" },
      models: {},
    });

    expect(site.result.status).toBe(0);
    expect(site.read("docs/a.html")).toContain("dbml-diagram-error");
    expect(site.read("docs/a.html")).not.toContain("<iframe");
    const line = logLines(site).find((entry) =>
      entry.msg.includes(
        "docs:ROOT:a.adoc, block 1: no model nope.dbml in the models folder",
      ),
    );
    expect(line?.level).toBe("error");
  });

  it("stops the build on a missing model with validate: error", () => {
    const site = build({
      pages: { "a.adoc": "= A\n\ndbml::ok[]\n\ndbml::nope[]\n" },
      models: { "ok.dbml": MODEL },
      settings: { validate: "error" },
    });

    expect(site.result.status).not.toBe(0);
    expect(site.result.stdout + site.result.stderr).toContain(
      "1 block(s) without a model",
    );
  });

  it("stops the build when the only block is missing, with validate: error", () => {
    const site = build({
      pages: { "a.adoc": "= A\n\ndbml::nope[]\n" },
      models: {},
      settings: { validate: "error" },
    });

    expect(site.result.status).not.toBe(0);
  });

  it("treats a folder named like a model as no model", () => {
    const site = build({
      pages: { "a.adoc": "= A\n\ndbml::dir[]\n" },
      models: { "dir.dbml/keep.txt": "x" },
    });

    expect(site.result.status).toBe(0);
    expect(site.read("docs/a.html")).toContain("dbml-diagram-error");
    expect(site.result.stdout + site.result.stderr).toContain(
      "no model dir.dbml in the models folder",
    );
  });

  it("refuses a path out of the models folder", () => {
    const site = build({
      pages: { "a.adoc": "= A\n\ndbml::../secret[]\n" },
      models: {},
    });

    expect(site.read("docs/a.html")).toContain("leaves the models folder");
  });

  it("falls back from a bad height or theme, with a warning naming the block", () => {
    const site = build({
      pages: { "a.adoc": "= A\n\ndbml::shop[height=abc,theme=blue]\n" },
      models: { "shop.dbml": MODEL },
      settings: { height: 420, theme: "dark" },
    });

    const page = site.read("docs/a.html");
    expect(page).toContain('height="420"');
    expect(page).toContain("theme=dark");
    expect(site.result.stdout + site.result.stderr).toContain(
      "docs:ROOT:a.adoc, block 1: height",
    );
    expect(site.result.stdout + site.result.stderr).toContain(
      "docs:ROOT:a.adoc, block 1: theme",
    );
  });

  it("stops the build when models is not set", () => {
    const site = build({
      pages: { "a.adoc": "= A\n" },
      models: {},
      settings: { models: undefined },
    });

    expect(site.result.status).not.toBe(0);
    expect(site.result.stdout + site.result.stderr).toContain("set `models`");
  });
});
