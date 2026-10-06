/**
 * @jest-environment node
 */
import {
  execFileSync,
  spawnSync,
  type SpawnSyncReturns,
} from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Only what needs no network and changes nothing: the arguments, and each
// refusal that comes before the build. The script is run from a copy inside a
// throwaway repository whose `origin` is a local bare one, so `main`, a clean
// tree and "equal to origin/main" can each be arranged — and broken — here.
const SCRIPT = path.join(__dirname, "..", "..", "scripts", "release-github.sh");

const MANIFEST = {
  id: "dbml-studio",
  name: "DBML Studio",
  version: "0.2.0",
  minAppVersion: "1.13.7",
  description: "Draws diagrams.",
  author: "AKonyshev",
  isDesktopOnly: true,
};

const CHANGELOG = [
  "# Changelog",
  "",
  "## [0.2.0] - 2026-10-06",
  "",
  "### Added",
  "",
  "- Something.",
  "",
].join("\n");

let work = "";

beforeEach(() => {
  work = mkdtempSync(path.join(tmpdir(), "release-github-"));
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

/**
 * The environment with every `GIT_*` variable taken out. Under the pre-commit
 * hook git exports GIT_DIR, GIT_INDEX_FILE and others naming the repository
 * being committed to, and a `git init` or `git add` that inherits them acts
 * on that repository instead of the throwaway one — an early version of this
 * test marked the real repository bare that way. Nothing git runs here, or in
 * the script under test, may see them.
 */
const isolatedEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {};

  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("GIT_")) {
      env[name] = value;
    }
  }

  return {
    ...env,
    GIT_AUTHOR_NAME: "test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
    // No global or system config: a user's hooks or templates stay out.
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
  };
};

const git = (cwd: string, ...args: string[]): string => {
  // A last guard: every repository this test touches is under `work`.
  if (!cwd.startsWith(work) || work === "") {
    throw new Error(`refusing to run git outside the test's folder: ${cwd}`);
  }

  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: isolatedEnv(),
  });
};

interface RepoOptions {
  manifest?: Record<string, unknown>;
  versions?: Record<string, string>;
}

/** A repository on `main`, clean, pushed to its `origin`. */
const makeRepo = (options: RepoOptions = {}): string => {
  const origin = path.join(work, "origin.git");
  const repo = path.join(work, "repo");
  const scripts = path.join(repo, "packages", "obsidian-plugin", "scripts");

  git(work, "init", "--quiet", "--bare", "--initial-branch=main", origin);
  git(work, "init", "--quiet", "--initial-branch=main", repo);
  mkdirSync(scripts, { recursive: true });
  copyFileSync(SCRIPT, path.join(scripts, "release-github.sh"));
  writeFileSync(
    path.join(repo, "manifest.json"),
    JSON.stringify(options.manifest ?? MANIFEST),
  );
  writeFileSync(
    path.join(repo, "versions.json"),
    JSON.stringify(options.versions ?? { "0.2.0": "1.13.7" }),
  );
  writeFileSync(
    path.join(repo, "packages", "obsidian-plugin", "CHANGELOG.md"),
    CHANGELOG,
  );
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "init");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "--quiet", "origin", "main");

  return repo;
};

/**
 * The script copied into a folder that is no repository at all, for the
 * argument tests: should one of them get past the arguments, the git it runs
 * has no repository to act on — not even this one.
 */
const looseScript = (): string => {
  const scripts = path.join(
    work,
    "loose",
    "packages",
    "obsidian-plugin",
    "scripts",
  );

  mkdirSync(scripts, { recursive: true });
  copyFileSync(SCRIPT, path.join(scripts, "release-github.sh"));

  return path.join(scripts, "release-github.sh");
};

const release = (
  repo: string | null,
  ...args: string[]
): SpawnSyncReturns<string> =>
  spawnSync(
    "bash",
    [
      repo === null
        ? looseScript()
        : path.join(
            repo,
            "packages",
            "obsidian-plugin",
            "scripts",
            "release-github.sh",
          ),
      ...args,
    ],
    { encoding: "utf8", input: "", env: isolatedEnv() },
  );

describe("release-github.sh, its arguments", () => {
  it("says how it is used with --help, and does nothing", () => {
    const result = release(null, "--help");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("release:github");
    expect(result.stdout).toContain("--check");
  });

  it("refuses to run without a version", () => {
    const result = release(null);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage");
  });

  it("refuses an option it does not know", () => {
    const result = release(null, "0.2.0", "--force");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--force");
  });

  // The directory wants the tag to be exactly the version: x.y.z, no "v".
  it("refuses a version that is not x.y.z", () => {
    const result = release(null, "v0.2.0");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("v0.2.0");
  });

  it("refuses two versions", () => {
    const result = release(null, "0.2.0", "0.3.0");

    expect(result.status).toBe(2);
  });
});

describe("release-github.sh, before it builds anything", () => {
  it("refuses off main", () => {
    const repo = makeRepo();

    git(repo, "checkout", "--quiet", "-b", "feature");

    const result = release(repo, "0.2.0", "--check");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("main");
    expect(result.stderr).toContain("feature");
  });

  it("refuses a tree with changes in it", () => {
    const repo = makeRepo();

    writeFileSync(path.join(repo, "stray.txt"), "left over");

    const result = release(repo, "0.2.0", "--check");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("stray.txt");
  });

  it("refuses a main that is not origin/main", () => {
    const repo = makeRepo();

    git(repo, "commit", "--quiet", "--allow-empty", "-m", "unpushed");

    const result = release(repo, "0.2.0", "--check");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("origin/main");
  });

  it("refuses a version the manifest does not have", () => {
    const repo = makeRepo();
    const result = release(repo, "0.3.0", "--check");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("manifest.json");
    expect(result.stderr).toContain("0.2.0");
  });

  it("refuses a version versions.json does not list", () => {
    const repo = makeRepo({ versions: { "0.1.0": "1.5.0" } });
    const result = release(repo, "0.2.0", "--check");

    expect(result.status).toBe(1);
    // Says what to add, not only that something is wrong.
    expect(result.stderr).toContain(
      'versions.json has no 0.2.0; add "0.2.0": "1.13.7"',
    );
  });

  it("refuses a versions.json that names another minAppVersion", () => {
    const repo = makeRepo({ versions: { "0.2.0": "1.5.0" } });
    const result = release(repo, "0.2.0", "--check");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("1.13.7");
  });

  it("refuses a version the changelog has no entry for", () => {
    const repo = makeRepo({
      manifest: { ...MANIFEST, version: "0.4.0" },
      versions: { "0.4.0": "1.13.7" },
    });
    const result = release(repo, "0.4.0", "--check");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CHANGELOG.md");
  });

  it("refuses a version already tagged", () => {
    const repo = makeRepo();

    git(repo, "tag", "0.2.0");

    const result = release(repo, "0.2.0", "--check");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("already");
  });
});
