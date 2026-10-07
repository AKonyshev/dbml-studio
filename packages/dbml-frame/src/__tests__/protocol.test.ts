/**
 * @jest-environment node
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// The protocol the package ships is frameHost.ts compiled, not a copy: built
// here into a scratch folder with the package's own tsconfig, then loaded.
const PACKAGE = path.join(__dirname, "..", "..");
let out = "";

beforeAll(() => {
  out = mkdtempSync(path.join(tmpdir(), "dbml-frame-protocol-"));
  execFileSync(
    process.execPath,
    [
      require.resolve("typescript/bin/tsc"),
      "-p",
      path.join(PACKAGE, "tsconfig.protocol.json"),
      "--outDir",
      out,
    ],
    { encoding: "utf8" },
  );
});

afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

describe("the protocol dbml-frame ships", () => {
  it("is frameHost.ts compiled to CommonJS with its declarations", () => {
    expect(existsSync(path.join(out, "frameHost.js"))).toBe(true);
    const types = readFileSync(path.join(out, "frameHost.d.ts"), "utf8");
    expect(types).toContain("export type HostMessage");
    expect(types).toContain("export type FrameMessage");
  });

  it("speaks the frame's protocol", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loading the compiled output is the test
    const protocol = require(path.join(out, "frameHost.js")) as {
      FRAME_PROTOCOL: string;
      parseHostMessage: (data: unknown) => unknown;
    };
    expect(protocol.FRAME_PROTOCOL).toBe("dbml-frame");
    expect(
      protocol.parseHostMessage({ source: "dbml-frame", type: "ready" }),
    ).toEqual({ source: "dbml-frame", type: "ready" });
    expect(
      protocol.parseHostMessage({ source: "other", type: "ready" }),
    ).toBeNull();
  });
});
