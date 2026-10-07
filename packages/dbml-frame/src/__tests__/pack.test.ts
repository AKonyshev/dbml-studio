/**
 * @jest-environment node
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Only the refusal that comes before the build: pack.sh is copied into a
// throwaway tree laid out like the repository, with the two package.json files
// it compares and nothing else, so nothing is built or packed.
const SCRIPT = path.join(__dirname, "..", "..", "scripts", "pack.sh");

let root = "";

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "dbml-frame-pack-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const layout = (frame: string, extension: string): string => {
  const scripts = path.join(root, "packages", "dbml-frame", "scripts");
  mkdirSync(scripts, { recursive: true });
  mkdirSync(path.join(root, "packages", "dbml-vs-code-extension"));
  copyFileSync(SCRIPT, path.join(scripts, "pack.sh"));
  writeFileSync(
    path.join(root, "packages", "dbml-frame", "package.json"),
    JSON.stringify({ name: "dbml-frame", version: frame }),
  );
  writeFileSync(
    path.join(root, "packages", "dbml-vs-code-extension", "package.json"),
    JSON.stringify({ name: "dbml-studio", version: extension }),
  );
  return path.join(scripts, "pack.sh");
};

describe("pack.sh", () => {
  it("refuses a dbml-frame version the extension is not at", () => {
    const result = spawnSync("bash", [layout("1.2.2", "1.2.3")], {
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "dbml-frame is at 1.2.2, the extension at 1.2.3",
    );
  });
});
