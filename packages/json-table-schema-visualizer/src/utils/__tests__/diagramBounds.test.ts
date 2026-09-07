import { computeDiagramBounds } from "../diagramBounds";

import type { JSONTableField, JSONTableTable } from "shared/types/tableSchema";
import type { XYWHPosition } from "@/types/positions";

import { DIAGRAM_PADDING } from "@/constants/sizing";
import { TableDetailLevel } from "@/types/tableDetailLevel";

const tableWith = (name: string, columns: number): JSONTableTable =>
  ({
    name,
    fields: Array.from(
      { length: columns },
      (_, i) =>
        ({
          name: `c${i}`,
          type: { type_name: "int", is_enum: false },
          is_relation: false,
        }) as unknown as JSONTableField,
    ),
    indexes: [],
    x: 0,
    y: 0,
  }) as unknown as JSONTableTable;

// What the layout stored: full-detail heights, computed once and never revised.
// A ten-column table is 36 + 10 * 30 = 336 tall there.
const coordsOf = (
  entries: Array<[string, XYWHPosition]>,
): Map<string, XYWHPosition> => new Map(entries);

describe("computeDiagramBounds", () => {
  test("has nothing to frame before the tables are measured", () => {
    expect(
      computeDiagramBounds(
        coordsOf([["a", { x: 0, y: 0, w: 0, h: 0 }]]),
        [tableWith("a", 10)],
        () => TableDetailLevel.FullDetails,
      ),
    ).toBeNull();
  });

  test("frames every table, in stage coordinates", () => {
    const bounds = computeDiagramBounds(
      coordsOf([
        ["a", { x: 0, y: 0, w: 200, h: 336 }],
        ["b", { x: 500, y: 100, w: 300, h: 336 }],
      ]),
      [tableWith("a", 10), tableWith("b", 10)],
      () => TableDetailLevel.FullDetails,
    );

    // The tables are drawn inside a group offset by `DIAGRAM_PADDING`, so the
    // box has to be offset with them or fit-to-view centres on the wrong point.
    // 10 columns draw 36 + 300 + 8 = 344 tall, eight more than the layout's 336.
    expect(bounds).toEqual({
      x: 0 + DIAGRAM_PADDING,
      y: 0 + DIAGRAM_PADDING,
      width: 800,
      height: 444,
    });
  });

  test("measures a table at the level it is drawn at", () => {
    const coords = coordsOf([["a", { x: 0, y: 0, w: 200, h: 336 }]]);
    const tables = [tableWith("a", 10)];

    const framed = computeDiagramBounds(
      coords,
      tables,
      () => TableDetailLevel.HeaderOnly,
    );

    // The stored height is the layout's, and the layout never changes with the
    // detail level. Headers only draws 36 + 8 = 44 — a box seven times shorter
    // than the one the coordinates still describe, and the whole of why
    // fit-to-view came out at the old level's scale.
    expect(framed?.height).toBe(44);
    expect(
      computeDiagramBounds(coords, tables, () => TableDetailLevel.FullDetails)
        ?.height,
    ).toBe(344);
  });

  test("keeps the stored height for a box with no table behind it", () => {
    // A layout recovered from storage can name a table this document no longer
    // has — a filtered frame, or a model edited since. There are no columns to
    // count for it, so the only height there is is the one that was stored.
    const bounds = computeDiagramBounds(
      coordsOf([["gone", { x: 0, y: 0, w: 200, h: 336 }]]),
      [],
      () => TableDetailLevel.HeaderOnly,
    );

    expect(bounds?.height).toBe(336);
  });
  test("two tables at different levels are each measured at their own", () => {
    const coords = coordsOf([
      ["tall", { x: 0, y: 0, w: 200, h: 336 }],
      ["short", { x: 0, y: 0, w: 200, h: 336 }],
    ]);
    const tables = [tableWith("tall", 10), tableWith("short", 10)];

    const mixed = computeDiagramBounds(coords, tables, (name) =>
      name === "short"
        ? TableDetailLevel.HeaderOnly
        : TableDetailLevel.FullDetails,
    );

    // The collapsed table stops 44 below the top while the other still runs to
    // 344, so the box is the taller of the two — which is the point: one table
    // set apart must not drag the frame back to the level it left.
    expect(mixed?.height).toBe(344);
  });
});
