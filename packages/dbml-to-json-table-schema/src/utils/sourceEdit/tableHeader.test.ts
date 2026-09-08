import { locateTableName } from "./tableHeader";

interface CutResult {
  text: string;
  declaredName: string;
  schemaName: string | null;
  alias: string | null;
}

const cut = (header: string): CutResult | null => {
  const found = locateTableName(header, 0);
  if (found === null) return null;

  return {
    text: header.slice(found.nameRange.start, found.nameRange.end),
    declaredName: found.declaredName,
    schemaName: found.schemaName,
    alias: found.alias,
  };
};

describe("locateTableName", () => {
  it("finds a bare name", () => {
    expect(cut("Table users {")).toEqual({
      text: "users",
      declaredName: "users",
      schemaName: null,
      alias: null,
    });
  });

  it("skips the schema prefix", () => {
    expect(cut("Table analytics.users {")).toEqual({
      text: "users",
      declaredName: "users",
      schemaName: "analytics",
      alias: null,
    });
  });

  it("skips the alias", () => {
    expect(cut("Table analytics.users as u {")).toEqual({
      text: "users",
      declaredName: "users",
      schemaName: "analytics",
      alias: "u",
    });
  });

  it("handles a quoted name", () => {
    expect(cut('Table "my table" as t {')).toEqual({
      text: '"my table"',
      declaredName: "my table",
      schemaName: null,
      alias: "t",
    });
  });

  it("offsets the range by the header's position in the document", () => {
    const found = locateTableName("Table users {", 100);

    expect(found?.nameRange).toEqual({ start: 106, end: 111 });
  });

  it("returns null for a line that is not a table header", () => {
    expect(locateTableName("Ref: a.b > c.d", 0)).toBeNull();
  });
});
