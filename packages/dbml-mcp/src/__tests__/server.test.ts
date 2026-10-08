import { ToolError } from "../errors";
import { toCallResult } from "../server";

describe("toCallResult", () => {
  it("carries text and structured content", async () => {
    const result = await toCallResult(async () => ({
      text: "ok",
      structured: { a: 1 },
    }));
    expect(result).toEqual({
      content: [{ type: "text", text: "ok" }],
      structuredContent: { a: 1 },
    });
  });

  it("turns a ToolError into an error result led by its code", async () => {
    const result = await toCallResult(async () => {
      throw new ToolError("FILE_EXISTS", "out.dbml exists");
    });
    expect(result).toEqual({
      isError: true,
      content: [{ type: "text", text: "FILE_EXISTS: out.dbml exists" }],
    });
  });

  describe("on an unexpected error", () => {
    let written: string[];
    let spy: jest.SpyInstance;

    beforeEach(() => {
      written = [];
      spy = jest
        .spyOn(process.stderr, "write")
        .mockImplementation((chunk: string | Uint8Array) => {
          written.push(String(chunk));
          return true;
        });
    });

    afterEach(() => {
      spy.mockRestore();
    });

    it("never repeats the text of an unexpected error", async () => {
      const result = await toCallResult(async () => {
        throw new Error("postgres://u:hunter2@h/db exploded");
      });
      expect(JSON.stringify(result)).not.toContain("hunter2");
      expect(result.isError).toBe(true);
    });

    it("writes one stderr line with the error's name and code, not its text", async () => {
      await toCallResult(async () => {
        throw Object.assign(
          new TypeError("postgres://u:hunter2@h/db exploded"),
          { code: "ERR_INVALID_URL" },
        );
      });
      expect(written).toEqual([
        "dbml-mcp: unexpected TypeError ERR_INVALID_URL\n",
      ]);
    });

    it("leaves the code out when there is none", async () => {
      await toCallResult(async () => {
        throw new RangeError("hunter2");
      });
      expect(written).toEqual(["dbml-mcp: unexpected RangeError\n"]);
    });

    it("writes nothing for a ToolError", async () => {
      await toCallResult(async () => {
        throw new ToolError("FILE_EXISTS", "out.dbml exists");
      });
      expect(written).toEqual([]);
    });
  });
});
