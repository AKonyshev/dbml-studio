import { drawnTableHeight } from "./drawnTableHeight";

import type { JSONTableTable } from "shared/types/tableSchema";
import type { XYWHPosition } from "@/types/positions";

import { DIAGRAM_PADDING } from "@/constants/sizing";
import { type DetailLevelResolver } from "@/types/tableDetailLevel";

/**
 * The box every table sits in, drawn or not, in stage coordinates.
 *
 * Measured from the stored coordinates rather than from the stage: with
 * off-screen tables unmounted, the stage only knows about the ones it is
 * already showing, and fitting to those would frame a fraction of the diagram
 * and call it the whole.
 *
 * The stored height is not used, though the stored position is. Coordinates are
 * computed once, by the layout, at full detail — deliberately, so that changing
 * the detail level rearranges nothing — and so the stored `h` describes the
 * table as it was laid out, not as it is drawn. Pressing `D` down to headers
 * makes a 166-column table forty-four pixels tall while its stored height stays
 * five thousand, and a fit computed from that leaves the diagram at the old
 * level's scale: the reader asks for headers, gets them, presses fit-to-view
 * and nothing moves.
 *
 * The level is asked for per table rather than given once: a table set apart
 * from the diagram is drawn at its own level, and framing it at the diagram's
 * would leave it half out of the view it was just fitted into.
 *
 * A box whose table is not in `tables` keeps its stored height. That is a
 * layout recovered from storage for a table this document no longer has, and
 * there are no columns to count for it.
 */
export const computeDiagramBounds = (
  coords: ReadonlyMap<string, XYWHPosition>,
  tables: JSONTableTable[],
  levelFor: DetailLevelResolver,
): { x: number; y: number; width: number; height: number } | null => {
  const fieldsByName = new Map(
    tables.map((table) => [table.name, table.fields]),
  );

  const boxes = [...coords.entries()]
    // A table that has never been measured has no box to contribute, and
    // treating its zeroes as a corner would drag the bounds to the origin.
    .filter(([, coord]) => coord.w > 0 && coord.h > 0)
    .map(([name, coord]) => {
      const fields = fieldsByName.get(name);

      return {
        x: coord.x,
        y: coord.y,
        w: coord.w,
        h:
          fields === undefined
            ? coord.h
            : drawnTableHeight(fields, levelFor(name)),
      };
    });

  if (boxes.length === 0) {
    return null;
  }

  const left = Math.min(...boxes.map((c) => c.x)) + DIAGRAM_PADDING;
  const top = Math.min(...boxes.map((c) => c.y)) + DIAGRAM_PADDING;
  const right = Math.max(...boxes.map((c) => c.x + c.w)) + DIAGRAM_PADDING;
  const bottom = Math.max(...boxes.map((c) => c.y + c.h)) + DIAGRAM_PADDING;

  return { x: left, y: top, width: right - left, height: bottom - top };
};
