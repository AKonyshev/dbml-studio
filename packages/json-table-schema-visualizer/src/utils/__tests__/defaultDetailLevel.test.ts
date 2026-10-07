import {
  FULL_DETAIL_COLUMN_BUDGET,
  FULL_DETAIL_TALLEST_TABLE_BUDGET,
  defaultDetailLevelFor,
} from "../defaultDetailLevel";

import type { JSONTableTable } from "shared/types/tableSchema";

import { TableDetailLevel } from "@/types/tableDetailLevel";

const tableWith = (columns: number, name = "t"): JSONTableTable =>
  ({
    name,
    fields: Array.from({ length: columns }, (_, i) => ({ name: `c${i}` })),
    indexes: [],
    x: 0,
    y: 0,
  }) as unknown as JSONTableTable;

describe("defaultDetailLevelFor", () => {
  test("opens an ordinary schema at full detail", () => {
    expect(defaultDetailLevelFor([tableWith(20), tableWith(30)])).toBe(
      TableDetailLevel.FullDetails,
    );
  });

  test("opens an empty schema at full detail", () => {
    expect(defaultDetailLevelFor([])).toBe(TableDetailLevel.FullDetails);
  });

  test("counts columns across tables, not tables", () => {
    // A hundred small tables are cheap; one wide table is not the only way to
    // get expensive.
    const many = Array.from({ length: 100 }, (_, i) => tableWith(5, `t${i}`));

    expect(defaultDetailLevelFor(many)).toBe(TableDetailLevel.FullDetails);
  });

  // Both budgets are probed with tables narrow enough that the other one has
  // nothing to say: a single table wide enough to reach the total on its own
  // would be over the tallest-table budget many times before it got there, and
  // the boundary under test would never be the one that decided.
  const narrowTablesTotalling = (columns: number): JSONTableTable[] => {
    const width = FULL_DETAIL_TALLEST_TABLE_BUDGET;
    const whole = Math.floor(columns / width);
    const rest = columns % width;

    return [
      ...Array.from({ length: whole }, (_, i) => tableWith(width, `t${i}`)),
      ...(rest > 0 ? [tableWith(rest, "rest")] : []),
    ];
  };

  test("holds full detail right up to the total budget", () => {
    expect(
      defaultDetailLevelFor(narrowTablesTotalling(FULL_DETAIL_COLUMN_BUDGET)),
    ).toBe(TableDetailLevel.FullDetails);
  });

  test("drops to headers one column past the total budget", () => {
    expect(
      defaultDetailLevelFor(
        narrowTablesTotalling(FULL_DETAIL_COLUMN_BUDGET + 1),
      ),
    ).toBe(TableDetailLevel.HeaderOnly);
  });

  // Probed with a second table present, because the tallest-table budget only
  // has anything to say when there is another table for the tall one to shrink.
  const withNeighbour = (columns: number): JSONTableTable[] => [
    tableWith(columns, "tall"),
    tableWith(4, "neighbour"),
  ];

  test("holds full detail right up to the tallest-table budget", () => {
    expect(
      defaultDetailLevelFor(withNeighbour(FULL_DETAIL_TALLEST_TABLE_BUDGET)),
    ).toBe(TableDetailLevel.FullDetails);
  });

  test("drops to headers one column past the tallest-table budget", () => {
    expect(
      defaultDetailLevelFor(
        withNeighbour(FULL_DETAIL_TALLEST_TABLE_BUDGET + 1),
      ),
    ).toBe(TableDetailLevel.HeaderOnly);
  });

  test("opens a lone table at full detail however tall it is", () => {
    // The tallest-table budget is there to stop one tall table from shrinking
    // every other table out of legibility when the diagram is fitted. A diagram
    // of one table has nothing else to protect, and its columns are the whole
    // of what the reader came for: 188 of the 394 diagrams in the documentation
    // this serves show a single table, and 33 of those tables are wider than
    // the budget. Headers-only leaves those pages showing a name and a coloured
    // bar.
    expect(defaultDetailLevelFor([tableWith(92, "wide")])).toBe(
      TableDetailLevel.FullDetails,
    );
  });

  test("judges the tallest table, not the average one", () => {
    // Forty small tables and one very wide one. Every count but the tallest
    // says this schema is small, and the wide table is the whole of the
    // problem: framing it is what shrinks the other forty out of legibility.
    const mixed = [
      ...Array.from({ length: 40 }, (_, i) => tableWith(8, `small${i}`)),
      tableWith(166, "history_bulk_intercept"),
    ];

    expect(defaultDetailLevelFor(mixed)).toBe(TableDetailLevel.HeaderOnly);
  });

  test("drops to headers for a handful of very wide tables", () => {
    // sales.dbml, the three result tables a documentation page embeds:
    // 458 columns between them, which is well inside the total budget, and
    // each one over six thousand pixels tall. Framing them fits the tallest
    // into the viewport and everything else goes with it — in a 500px frame,
    // three vertical hairlines with no readable character in them.
    expect(
      defaultDetailLevelFor([
        tableWith(204, "retail_sales_calc_result"),
        tableWith(136, "bulk_sales_calc_result"),
        tableWith(118, "return_sales_calc_result"),
      ]),
    ).toBe(TableDetailLevel.HeaderOnly);
  });

  test("drops to headers for a schema the size of the measured one", () => {
    // 117 tables, 5,676 columns: 46,210 nodes and ~132 ms a redraw.
    const huge = Array.from({ length: 117 }, (_, i) => tableWith(48, `t${i}`));

    expect(defaultDetailLevelFor(huge)).toBe(TableDetailLevel.HeaderOnly);
  });
});
