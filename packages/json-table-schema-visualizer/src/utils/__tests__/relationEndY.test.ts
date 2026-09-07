import { relationEndY } from "../relationEndY";

import { TABLE_HEADER_HEIGHT } from "@/constants/sizing";
import { TableDetailLevel } from "@/types/tableDetailLevel";

describe("relationEndY", () => {
  test("meets a drawn table at its column", () => {
    expect(relationEndY(TableDetailLevel.FullDetails, 100, 60)).toBe(160);
    expect(relationEndY(TableDetailLevel.KeyOnly, 100, 60)).toBe(160);
  });

  test("meets a collapsed table halfway down its header", () => {
    expect(relationEndY(TableDetailLevel.HeaderOnly, 100, 60)).toBe(
      100 + TABLE_HEADER_HEIGHT / 2,
    );
  });

  test("ignores the column of a collapsed table", () => {
    // The row index it would use is not merely wrong but absent: a header-only
    // table is skipped by `computeColIndexes`, so `colY` here is whatever
    // `computeColY` returns for a key it cannot find.
    expect(relationEndY(TableDetailLevel.HeaderOnly, 100, 0)).toBe(
      relationEndY(TableDetailLevel.HeaderOnly, 100, 9999),
    );
  });

  test("each end is answered on its own", () => {
    // The case the whole function exists for: one relation, two tables, two
    // levels. Before per-table levels one test served both ends.
    const collapsed = relationEndY(TableDetailLevel.HeaderOnly, 0, 300);
    const drawn = relationEndY(TableDetailLevel.FullDetails, 0, 300);

    expect(collapsed).not.toBe(drawn);
  });
});
