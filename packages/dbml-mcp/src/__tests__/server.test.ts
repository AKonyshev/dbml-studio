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

  it("never repeats the text of an unexpected error", async () => {
    const result = await toCallResult(async () => {
      throw new Error("postgres://u:hunter2@h/db exploded");
    });
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(result.isError).toBe(true);
  });
});
