import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// English is the source language of this repository. Anything else in the
// sources is either an untranslated comment or a hardcoded user-facing string
// that bypassed the message catalog — both are defects.
//
// The scan runs in Node rather than through `git grep` deliberately: this
// repo's git build silently matches NOTHING for \p{Script=...} patterns, and
// byte-matches false positives when given a literal non-ASCII character range.
// Either behaviour would make this test permanently green and useless. Node's
// RegExp with the `u` flag handles Unicode script properties correctly.
//
// If you change this guard, first verify it still FAILS on known-bad input.
const NON_ENGLISH = /[\p{Script=Cyrillic}\p{Script=Han}]/u;

const EXCLUDED = ["src/i18n/locales/", "/l10n/", "package.nls"];

// The repository is the one this file sits in, not whichever one the caller's
// environment names. Git exports GIT_DIR and GIT_INDEX_FILE to its hooks, and
// every child of the pre-commit hook inherits them. In a linked worktree that
// GIT_DIR comes without a GIT_WORK_TREE, so git takes the current directory —
// this package, where jest runs — for the top level: `rev-parse --show-toplevel`
// answered with the package, `ls-files` still printed every path, each of them
// joined to the wrong root was missing on disk, and the scan read nothing and
// passed. On every commit made from a worktree, for as long as that stood.
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..", "..");
const thisFile = path.relative(repoRoot, __filename).split(path.sep).join("/");

// So git is asked with none of the caller's GIT_* variables, and finds the
// repository and its index from `repoRoot` the way it would in a shell.
const gitEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

function listSourceFiles(): string[] {
  // Every tracked TypeScript file under `packages/`, rather than a list of the
  // directories that happened to exist when this was written. That list named
  // `src` and `extension`, and a browser test added later under `packages/web/e2e`
  // sat outside it with three translations of a button label inlined in a
  // selector — the rule broken with nothing to catch it. Naming directories
  // meant the guard's reach had to be remembered; naming the language does not.
  const output = execFileSync(
    "git",
    ["ls-files", "packages/**/*.ts", "packages/**/*.tsx"],
    {
      cwd: repoRoot,
      env: gitEnv,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  return output
    .split("\n")
    .filter((file) => file.trim() !== "")
    .filter((file) => !EXCLUDED.some((excluded) => file.includes(excluded)));
}

describe("source language", () => {
  test("sources contain no Cyrillic or CJK outside locale files", () => {
    const offenders: string[] = [];
    const files = listSourceFiles();

    // A scan of nothing finds nothing, and reads as a pass. Before trusting the
    // result, prove the list is this repository's: it must contain this very
    // file. An empty list fails here, and so does a list read from some other
    // index or relative to some other root.
    if (!files.includes(thisFile)) {
      throw new Error(
        `The source list is not this repository's (${files.length} files, ${thisFile} not among them) — refusing to report a pass on it.`,
      );
    }

    for (const file of files) {
      const absolute = path.join(repoRoot, file);

      // `git ls-files` reads the index, so a file deleted but not yet staged is
      // still listed while being gone from disk. That is an ordinary working
      // state; reading it threw ENOENT and took the whole guard down with a
      // message about the wrong thing entirely.
      if (!existsSync(absolute)) {
        continue;
      }

      const contents = readFileSync(absolute, "utf-8");
      contents.split("\n").forEach((line, index) => {
        if (NON_ENGLISH.test(line)) {
          offenders.push(`${file}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    // The failure must name file, line and the offending text: a bare count
    // gives a developer nothing to act on.
    if (offenders.length > 0) {
      throw new Error(
        `English is the source language, but non-English text was found:\n${offenders.join("\n")}`,
      );
    }
    expect(offenders).toEqual([]);
  });
});
