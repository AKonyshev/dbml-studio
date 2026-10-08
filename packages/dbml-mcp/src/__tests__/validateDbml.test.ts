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

  it("wants exactly one of text and path", async () => {
    expect(await codeOf(validateDbml.run({}, await makeContext()))).toBe(
      "INVALID_INPUT",
    );
  });
});
