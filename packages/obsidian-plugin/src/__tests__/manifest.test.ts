/**
 * @jest-environment node
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// The Community plugins directory reads manifest.json from the root of the
// repository's default branch, and Obsidian picks the release to install for
// an app version from versions.json beside it. Both are the plugin's, though
// they sit at the repository root: the directory decides where, not us.
const ROOT = path.join(__dirname, "..", "..", "..", "..");

const readJson = (name: string): Record<string, unknown> | null => {
  const file = path.join(ROOT, name);

  return existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>)
    : null;
};

const manifest = readJson("manifest.json");
const versions = readJson("versions.json");

describe("the plugin's manifest", () => {
  it("is the only one, at the repository root", () => {
    expect(manifest).not.toBeNull();
    expect(
      existsSync(path.join(ROOT, "packages/obsidian-plugin/manifest.json")),
    ).toBe(false);
  });

  // The directory's rule: a plugin id may not contain "obsidian".
  it("has an id without obsidian in it", () => {
    expect(manifest?.id).toBe("dbml-studio");
    expect(String(manifest?.id)).not.toMatch(/obsidian/i);
  });

  // Release tags are exactly the version, and the directory wants x.y.z.
  it("has a version of the form x.y.z", () => {
    expect(String(manifest?.version)).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("is listed in versions.json with its minAppVersion", () => {
    expect(Object.keys(versions ?? {})).toContain(manifest?.version);
    expect(versions?.[String(manifest?.version)]).toBe(manifest?.minAppVersion);
  });

  // ≤ 250 characters, ending with a period, per the directory's guidelines.
  it("has a description the directory accepts", () => {
    const description = String(manifest?.description);

    expect(description.length).toBeLessThanOrEqual(250);
    expect(description).toMatch(/\.$/);
    expect(description).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  // Models are read with Node's fs, which Obsidian on mobile does not have.
  it("is desktop only, and asks for no donations", () => {
    expect(manifest?.isDesktopOnly).toBe(true);
    expect(manifest).not.toHaveProperty("fundingUrl");
  });
});
