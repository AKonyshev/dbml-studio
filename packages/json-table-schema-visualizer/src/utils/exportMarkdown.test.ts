import { generateMarkdown } from "./exportMarkdown";

const tables = [
  {
    name: "users",
    note: "People",
    x: 0,
    y: 0,
    fields: [
      {
        name: "id",
        type: { type_name: "int", is_enum: false },
        is_relation: false,
        note: "Primary key",
      },
    ],
    indexes: [],
  },
];

const refs = [
  {
    endpoints: [
      { relation: "1", tableName: "users", fieldNames: ["id"] },
      { relation: "*", tableName: "orders", fieldNames: ["user_id"] },
    ],
  },
];

describe("generateMarkdown", () => {
  test("generates table and relation sections", () => {
    const result = generateMarkdown(tables, refs);

    expect(result).toContain("## Table reference");
    expect(result).toContain("### users");
    expect(result).toContain("People");
    expect(result).toContain("| id | int | Primary key |");
    expect(result).toContain("#### Relations:");
    expect(result).toContain("- id -> orders.user_id");
  });

  test("emits the header separator that makes a Markdown table render", () => {
    // Without this row the columns render as plain text, not a table — the one
    // structural difference from the AsciiDoc export.
    const result = generateMarkdown(tables, refs);
    const lines = result.split("\n");
    const headerIndex = lines.findIndex((line) =>
      line.startsWith("| Name | Type | Description |"),
    );

    expect(headerIndex).toBeGreaterThan(-1);
    expect(lines[headerIndex + 1]).toBe("| --- | --- | --- |");
  });

  test("falls back to a placeholder when a table has no note", () => {
    const result = generateMarkdown(
      [{ ...tables[0], note: undefined }] as never,
      [] as never,
    );

    expect(result).toContain("No description");
  });

  test("omits the relations section for a table with no refs", () => {
    const result = generateMarkdown(tables, [] as never);

    expect(result).not.toContain("#### Relations:");
  });
});
