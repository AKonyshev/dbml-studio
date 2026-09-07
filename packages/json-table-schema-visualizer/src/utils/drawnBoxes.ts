import { drawnTableHeight } from "./drawnTableHeight";

import type { JSONTableTable } from "shared/types/tableSchema";
import type { XYWHPosition } from "@/types/positions";

import { type DetailLevelResolver } from "@/types/tableDetailLevel";

/**
 * Where the tables actually are on the canvas, and how big they actually look.
 *
 * The stored position is right; the stored height is not. Coordinates are
 * computed once, by the layout, at full detail — deliberately, so that changing
 * the detail level rearranges nothing — so a stored `h` describes the table as
 * it was laid out rather than as it is drawn. A 166-column table collapsed to
 * its header is forty-four pixels tall while its stored height stays five
 * thousand.
 *
 * Anything reasoning about the drawing has to correct for that, and there were
 * two such places going different ways: fit-to-view corrected, and the marquee
 * did not, so a drag through empty space below a collapsed table still caught
 * it. One answer for both now.
 *
 * A box with no size has never been measured, and treating its zeroes as a
 * corner would drag any bounds to the origin — those are dropped. A box whose
 * table is not in `tables` keeps its stored height: that is a layout recovered
 * from storage for a table this document no longer has, and there are no
 * columns to count for it.
 */
export const drawnBoxes = (
  coords: ReadonlyMap<string, XYWHPosition>,
  tables: JSONTableTable[],
  levelFor: DetailLevelResolver,
): Map<string, XYWHPosition> => {
  const fieldsByName = new Map(
    tables.map((table) => [table.name, table.fields]),
  );

  const boxes = new Map<string, XYWHPosition>();

  for (const [name, coord] of coords) {
    if (coord.w <= 0 || coord.h <= 0) {
      continue;
    }

    const fields = fieldsByName.get(name);

    boxes.set(name, {
      ...coord,
      h:
        fields === undefined
          ? coord.h
          : drawnTableHeight(fields, levelFor(name)),
    });
  }

  return boxes;
};
