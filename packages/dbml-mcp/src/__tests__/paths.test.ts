import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { readSource, resolveInsideRoot, writeOutput } from "../paths";

let root: string;
let outside: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "dbml-mcp-root-"));
  outside = await mkdtemp(path.join(tmpdir(), "dbml-mcp-outside-"));
  await writeFile(
    path.join(root, "library.dbml"),
    "Table branch {\n  id int\n}\n",
  );
  await writeFile(
    path.join(outside, "secret.dbml"),
    "Table x {\n  id int\n}\n",
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

const codeOf = async (p: Promise<unknown>): Promise<string> =>
  await p.then(
    () => "resolved",
    (error: { code?: string }) => error.code ?? "no code",
  );

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await lstat(filePath);
    return true;
  } catch {
    return false;
  }
};

describe("resolveInsideRoot", () => {
  it("resolves a relative path inside the root", async () => {
    // realpath: on macOS tmpdir() is a symlink into /private.
    const resolved = await resolveInsideRoot(root, "library.dbml");
    expect(
      resolved.endsWith(path.join(path.basename(root), "library.dbml")),
    ).toBe(true);
  });

  it("refuses ../ escapes and absolute paths elsewhere", async () => {
    expect(await codeOf(resolveInsideRoot(root, "../x.dbml"))).toBe(
      "PATH_OUTSIDE_ROOT",
    );
    expect(
      await codeOf(resolveInsideRoot(root, path.join(outside, "secret.dbml"))),
    ).toBe("PATH_OUTSIDE_ROOT");
  });

  it("refuses a symlink that points out of the root", async () => {
    await symlink(outside, path.join(root, "link"));
    expect(await codeOf(resolveInsideRoot(root, "link/secret.dbml"))).toBe(
      "PATH_OUTSIDE_ROOT",
    );
  });

  it("accepts a path that does not exist yet, under folders that do not either", async () => {
    expect(
      await codeOf(resolveInsideRoot(root, "schemas/generated/new.dbml")),
    ).toBe("resolved");
  });

  it("refuses any path when there is no root", async () => {
    expect(await codeOf(resolveInsideRoot(undefined, "library.dbml"))).toBe(
      "NO_ROOT",
    );
  });
});

describe("readSource", () => {
  it("returns text as given", async () => {
    expect(await readSource(undefined, { text: "Table a {\n}" })).toBe(
      "Table a {\n}",
    );
  });

  it("reads a path inside the root", async () => {
    expect(await readSource(root, { path: "library.dbml" })).toContain(
      "Table branch",
    );
  });

  it("wants exactly one of text and path", async () => {
    expect(await codeOf(readSource(root, {}))).toBe("INVALID_INPUT");
    expect(
      await codeOf(readSource(root, { text: "x", path: "library.dbml" })),
    ).toBe("INVALID_INPUT");
  });

  it("says when the file is missing", async () => {
    expect(await codeOf(readSource(root, { path: "nope.dbml" }))).toBe(
      "FILE_NOT_FOUND",
    );
  });
});

describe("writeOutput", () => {
  it("creates missing parent folders inside the root", async () => {
    const written = await writeOutput(
      root,
      "schemas/generated/out.dbml",
      "Table a {\n}\n",
      false,
    );
    expect(await readFile(written, "utf8")).toBe("Table a {\n}\n");
  });

  it("refuses to replace a file unless asked to", async () => {
    expect(await codeOf(writeOutput(root, "library.dbml", "x", false))).toBe(
      "FILE_EXISTS",
    );
    await writeOutput(root, "library.dbml", "replaced", true);
    expect(await readFile(path.join(root, "library.dbml"), "utf8")).toBe(
      "replaced",
    );
  });

  it("refuses to write through a symlink out of the root", async () => {
    await mkdir(path.join(outside, "target"));
    await symlink(path.join(outside, "target"), path.join(root, "out"));
    expect(await codeOf(writeOutput(root, "out/file.dbml", "x", true))).toBe(
      "PATH_OUTSIDE_ROOT",
    );
  });

  it("refuses to write through a dangling file link", async () => {
    const plantedPath = path.join(outside, "planted.dbml");
    await symlink(plantedPath, path.join(root, "link.dbml"));
    expect(await codeOf(writeOutput(root, "link.dbml", "x", false))).toBe(
      "PATH_OUTSIDE_ROOT",
    );
    expect(await exists(plantedPath)).toBe(false);
    // Also test with overwrite: true
    expect(await codeOf(writeOutput(root, "link.dbml", "x", true))).toBe(
      "PATH_OUTSIDE_ROOT",
    );
    expect(await exists(plantedPath)).toBe(false);
  });

  it("refuses to write through a dangling directory link", async () => {
    const targetDir = path.join(outside, "newdir");
    await symlink(targetDir, path.join(root, "dlink"));
    expect(await codeOf(writeOutput(root, "dlink/x.dbml", "x", true))).toBe(
      "PATH_OUTSIDE_ROOT",
    );
    expect(await exists(targetDir)).toBe(false);
  });

  it("refuses paths with symlink loops", async () => {
    await symlink(path.join(root, "b"), path.join(root, "a"));
    await symlink(path.join(root, "a"), path.join(root, "b"));
    expect(await codeOf(resolveInsideRoot(root, "a/x.dbml"))).toBe(
      "PATH_OUTSIDE_ROOT",
    );
  });
});

describe("nonexistent root", () => {
  it("throws NO_ROOT when the root does not exist", async () => {
    const fakePath = path.join(tmpdir(), "does-not-exist-" + Date.now());
    expect(await codeOf(resolveInsideRoot(fakePath, "file.dbml"))).toBe(
      "NO_ROOT",
    );
  });
});

describe("special file names", () => {
  it("resolves ..hidden.dbml as a normal file inside the root", async () => {
    await writeFile(path.join(root, "..hidden.dbml"), "Table a {}");
    expect(await codeOf(resolveInsideRoot(root, "..hidden.dbml"))).toBe(
      "resolved",
    );
    expect(await readSource(root, { path: "..hidden.dbml" })).toContain(
      "Table a",
    );
  });
});

describe("readSource with symlinks", () => {
  it("refuses to read through a symlink to a file outside the root", async () => {
    await symlink(
      path.join(outside, "secret.dbml"),
      path.join(root, "link.dbml"),
    );
    expect(await codeOf(readSource(root, { path: "link.dbml" }))).toBe(
      "PATH_OUTSIDE_ROOT",
    );
  });
});
