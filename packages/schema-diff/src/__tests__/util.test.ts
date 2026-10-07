import { splitQualified, endpointsToRef, refKey, indexKey } from "../util";

describe("splitQualified", () => {
  test("uses schemaName when present", () => {
    expect(splitQualified("t", "s")).toEqual({ schema: "s", table: "t" });
  });
  test("splits combined name when schemaName is nullish", () => {
    expect(splitQualified("warehouse.shelf", null)).toEqual({
      schema: "warehouse",
      table: "shelf",
    });
  });
  test("no dot and no schema -> empty schema", () => {
    expect(splitQualified("t", undefined)).toEqual({ schema: "", table: "t" });
  });
});

describe("endpointsToRef", () => {
  test("builds a CanonRef splitting combined table names", () => {
    const r = endpointsToRef([
      { tableName: "warehouse.a", schemaName: null, fieldNames: ["x"] },
      { tableName: "warehouse.b", schemaName: null, fieldNames: ["y"] },
    ]);
    expect(r).toEqual({
      fromTable: "a",
      fromColumns: ["x"],
      toTable: "b",
      toColumns: ["y"],
    });
  });
});

describe("refKey", () => {
  test("is direction-independent", () => {
    const a = {
      fromTable: "a",
      fromColumns: ["x"],
      toTable: "b",
      toColumns: ["y"],
    };
    const b = {
      fromTable: "b",
      fromColumns: ["y"],
      toTable: "a",
      toColumns: ["x"],
    };
    expect(refKey(a)).toBe(refKey(b));
  });
});

describe("indexKey", () => {
  test("keys on sorted columns only", () => {
    expect(indexKey({ columns: ["b", "a"], unique: true })).toBe(
      indexKey({ columns: ["a", "b"], unique: false }),
    );
  });
});
