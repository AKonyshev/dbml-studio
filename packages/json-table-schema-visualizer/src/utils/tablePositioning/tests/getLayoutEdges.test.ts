import { getLayoutEdges } from "../getLayoutEdges";

import type { JSONTableRef, JSONTableTable } from "shared/types/tableSchema";

const tables = [{ name: "a" }, { name: "b" }] as unknown as JSONTableTable[];
const ref = (s: string, t: string): JSONTableRef => ({
  endpoints: [
    { tableName: s, fieldNames: ["id"], relation: "1" },
    { tableName: t, fieldNames: ["id"], relation: "*" },
  ],
});

describe("getLayoutEdges", () => {
  test("keeps edges between two real tables", () => {
    expect(getLayoutEdges(tables, [ref("a", "b")])).toEqual([["a", "b"]]);
  });
  test("drops refs to a table not in the schema", () => {
    expect(getLayoutEdges(tables, [ref("a", "ghost")])).toEqual([]);
  });
  test("drops self-referential edges", () => {
    expect(getLayoutEdges(tables, [ref("a", "a")])).toEqual([]);
  });
});
