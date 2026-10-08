import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { rootFromArgs } from "../root";

const identity = (p: string): string => p;
const HOME = "/home/reader";

describe("rootFromArgs", () => {
  it("takes the folder given with --root", () => {
    expect(rootFromArgs(["--root", "/work/library"], "/", HOME, identity)).toBe(
      "/work/library",
    );
  });

  it("resolves a relative --root against the start folder", () => {
    expect(rootFromArgs(["--root", "library"], "/work", HOME, identity)).toBe(
      "/work/library",
    );
  });

  it("honours --root even when it names the home folder", () => {
    expect(rootFromArgs(["--root", HOME], HOME, HOME, identity)).toBe(HOME);
  });

  it.each([[["--root"]], [["--root", ""]], [["--root", "--no-root"]]])(
    "has no root when --root has no folder: %j",
    (argv) => {
      expect(rootFromArgs(argv, "/work", HOME, identity)).toBeUndefined();
    },
  );

  it("has no root with --no-root", () => {
    expect(
      rootFromArgs(["--no-root"], "/work/library", HOME, identity),
    ).toBeUndefined();
  });

  it("lets --no-root win over --root", () => {
    expect(
      rootFromArgs(["--root", "/work", "--no-root"], "/work", HOME, identity),
    ).toBeUndefined();
  });

  it("uses an ordinary start folder", () => {
    expect(rootFromArgs([], "/work/library", HOME, identity)).toBe(
      "/work/library",
    );
  });

  it("has no root when started in the filesystem root", () => {
    const top = path.parse(process.cwd()).root;
    expect(rootFromArgs([], top, homedir())).toBeUndefined();
  });

  it("has no root when started in the home folder", () => {
    expect(rootFromArgs([], homedir(), homedir())).toBeUndefined();
  });

  it("compares real paths, so a link to the home folder counts as home", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dbml-mcp-home-"));
    try {
      const home = path.join(dir, "home");
      const link = path.join(dir, "link");
      await mkdir(home);
      await symlink(home, link);
      expect(rootFromArgs([], link, home)).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
