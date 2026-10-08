import { Parser } from "@dbml/core";

import { validateDbml } from "../tools/validateDbml";

import { codeOf, LIBRARY_DBML, makeContext } from "./helpers";

describe("validate_dbml", () => {
  it("counts tables and refs of a valid model", async () => {
    const result = await validateDbml.run(
      { text: LIBRARY_DBML },
      await makeContext(),
    );
    expect(result.structured).toEqual({
      valid: true,
      errors: [],
      tables: 2,
      refs: 1,
    });
  });

  it("reports a syntax error with its line and column, as a result", async () => {
    const result = await validateDbml.run(
      { text: "Table member {\n  id integer [pk\n}\n" },
      await makeContext(),
    );
    expect(result.structured.valid).toBe(false);
    expect(result.structured.errors[0]).toMatchObject({ line: 3 });
    expect(result.structured.errors[0].column).toBeGreaterThan(0);
    expect(result.text).toContain("line 3");
  });

  it("reports a reference to a missing table", async () => {
    const result = await validateDbml.run(
      { text: "Table loan {\n  id integer\n}\nRef: loan.id > member.id\n" },
      await makeContext(),
    );
    expect(result.structured.valid).toBe(false);
    expect(result.structured.errors[0].message).toContain("member");
    expect(result.structured.errors[0].line).toBeGreaterThan(0);
  });

  it("reports a duplicate table", async () => {
    const result = await validateDbml.run(
      {
        text: "Table member {\n  id integer\n}\nTable member {\n  id integer\n}\n",
      },
      await makeContext(),
    );
    expect(result.structured.valid).toBe(false);
    expect(result.structured.errors.length).toBeGreaterThan(0);
  });

  it("does not report an internal failure as invalid DBML", async () => {
    const spy = jest.spyOn(Parser, "parse").mockImplementationOnce(() => {
      throw new TypeError("boom");
    });
    try {
      await expect(
        validateDbml.run({ text: LIBRARY_DBML }, await makeContext()),
      ).rejects.toThrow("boom");
    } finally {
      spy.mockRestore();
    }
  });

  it("wants exactly one of text and path", async () => {
    expect(await codeOf(validateDbml.run({}, await makeContext()))).toBe(
      "INVALID_INPUT",
    );
  });
});
