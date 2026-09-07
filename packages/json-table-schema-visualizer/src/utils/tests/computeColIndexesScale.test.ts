import { computeColIndexes, computeColIndexesKey } from "../computeColIndexes";

import type { JSONTableTable } from "shared/types/tableSchema";

import { TableDetailLevel } from "@/types/tableDetailLevel";

const schemaOf = (tables: number, columns: number): JSONTableTable[] =>
  Array.from({ length: tables }, (_, t) => ({
    name: `t${t}`,
    fields: Array.from({ length: columns }, (_, c) => ({
      name: `c${c}`,
      pk: c === 0,
      type: { type_name: "uuid", is_enum: false },
      is_relation: false,
    })),
    indexes: [],
    x: 0,
    y: 0,
  })) as unknown as JSONTableTable[];

const timeOf = (tables: JSONTableTable[]): number => {
  const runs: number[] = [];
  for (let i = 0; i < 5; i++) {
    const started = performance.now();
    computeColIndexes(tables, () => TableDetailLevel.FullDetails);
    runs.push(performance.now() - started);
  }
  runs.sort((a, b) => a - b);

  return runs[2];
};

describe("computeColIndexes", () => {
  test("indexes every column by table and name", () => {
    const result = computeColIndexes(
      schemaOf(2, 3),
      () => TableDetailLevel.FullDetails,
    );

    expect(result[computeColIndexesKey("t0", "c0")]).toBe(0);
    expect(result[computeColIndexesKey("t0", "c2")]).toBe(2);
    expect(result[computeColIndexesKey("t1", "c1")]).toBe(1);
    expect(Object.keys(result)).toHaveLength(6);
  });

  test("costs nothing when only headers are drawn", () => {
    expect(
      computeColIndexes(schemaOf(50, 50), () => TableDetailLevel.HeaderOnly),
    ).toEqual({});
  });

  // The spread-in-reduce version copied the accumulator once per column, so
  // doubling the columns roughly quadrupled the time and a real schema spent
  // ~100 ms here on every mouse move. Linear growth is the property worth
  // holding on to; the bound is loose so that a slow machine cannot fail it.
  test("grows with the number of columns, not with its square", () => {
    const small = timeOf(schemaOf(60, 60));
    const double = timeOf(schemaOf(60, 120));

    expect(double).toBeLessThan(Math.max(small, 0.5) * 8);
  });
});
