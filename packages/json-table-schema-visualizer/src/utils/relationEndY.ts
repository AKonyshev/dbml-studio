import { TABLE_HEADER_HEIGHT } from "@/constants/sizing";
import { TableDetailLevel } from "@/types/tableDetailLevel";

/**
 * Where a relation line meets one table, in stage coordinates.
 *
 * Asked once per end rather than once per line. A table can be collapsed on its
 * own now, so the two ends of one relation are not drawn the same way: a line
 * can run from the middle of a header to a column three rows down.
 *
 * A table drawn as a header has no rows to point at, and no row index either —
 * `computeColIndexes` skips it — so the line meets it halfway down the header
 * instead. Every other level has the column, and `colY` is where it sits inside
 * the table.
 */
export const relationEndY = (
  detailLevel: TableDetailLevel,
  tableY: number,
  colY: number,
): number =>
  detailLevel === TableDetailLevel.HeaderOnly
    ? tableY + TABLE_HEADER_HEIGHT / 2
    : tableY + colY;
