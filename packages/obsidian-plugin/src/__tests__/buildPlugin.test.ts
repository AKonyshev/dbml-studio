/**
 * @jest-environment node
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const SCRIPT = path.join(__dirname, "..", "..", "scripts", "build-plugin.mjs");

/** A frame as `vendor-frame.mjs` leaves it, past ASCII so encoding shows. */
const HTML = "<!doctype html><title>frame — café</title>";
const BUILD = "v1.2.3-4-gabc1234\n";

let work = "";

beforeEach(() => {
  work = mkdtempSync(path.join(tmpdir(), "build-plugin-"));
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

const makeFrame = (files: Record<string, string>): string => {
  const frame = path.join(work, "frame");

  mkdirSync(frame);

  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(frame, name), text);
  }

  return frame;
};

const build = (frame: string): SpawnSyncReturns<string> =>
  spawnSync(
    process.execPath,
    [SCRIPT, "--frame", frame, "--outfile", path.join(work, "main.js")],
    { encoding: "utf8" },
  );

describe("build-plugin.mjs", () => {
  // The Community plugins directory installs main.js, manifest.json and
  // styles.css: a frame that is not inside main.js is not installed at all.
  it("carries the frame inside main.js, gzipped", () => {
    const result = build(makeFrame({ "embed.html": HTML, BUILD }));

    expect(result.status).toBe(0);

    const bundle = readFileSync(path.join(work, "main.js"), "utf8");
    // Every gzip stream starts 1f 8b 08, which base64 spells "H4sI".
    const packed = /"(H4sI[A-Za-z0-9+/=]+)"/.exec(bundle);

    expect(packed).not.toBeNull();
    expect(
      gunzipSync(Buffer.from(packed?.[1] ?? "", "base64")).toString("utf8"),
    ).toBe(HTML);
  });

  it("carries the frame's BUILD exactly as written", () => {
    expect(build(makeFrame({ "embed.html": HTML, BUILD })).status).toBe(0);

    expect(readFileSync(path.join(work, "main.js"), "utf8")).toContain(
      JSON.stringify(BUILD),
    );
  });

  it("refuses to build without a frame, and says what comes first", () => {
    const result = build(path.join(work, "frame"));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(path.join(work, "frame", "embed.html"));
    expect(result.stderr).toContain("yarn build:web");
  });

  it("refuses a frame without its BUILD, by name", () => {
    const result = build(makeFrame({ "embed.html": HTML }));

    expect(result.status).toBe(1);
    // The script's own sentence, not a stack trace from reading it anyway.
    expect(result.stderr).toContain(
      `build-plugin: no ${path.join(work, "frame", "BUILD")}`,
    );
  });
});
