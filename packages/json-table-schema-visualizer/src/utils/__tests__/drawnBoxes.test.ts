import { drawnBoxes } from "../drawnBoxes";
import { selectionFromMarquee } from "../selectionFromMarquee";

import type { JSONTableField, JSONTableTable } from "shared/types/tableSchema";
import type { XYWHPosition } from "@/types/positions";

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
// What the layout stored: a ten-column table is 36 + 10 * 30 = 336 tall.
const coords = (
  entries: Array<[string, XYWHPosition]>,
): Map<string, XYWHPosition> => new Map(entries);

describe("drawnBoxes", () => {
  test("keeps the stored position and replaces the stored height", () => {
    const boxes = drawnBoxes(
      coords([["a", { x: 40, y: 90, w: 200, h: 336 }]]),
      [tableWith("a", 10)],
      () => TableDetailLevel.HeaderOnly,
    );

    expect(boxes.get("a")).toEqual({ x: 40, y: 90, w: 200, h: 44 });
  });

  test("measures each table at its own level", () => {
    const boxes = drawnBoxes(
      coords([
        ["open", { x: 0, y: 0, w: 200, h: 336 }],
        ["shut", { x: 0, y: 0, w: 200, h: 336 }],
      ]),
      [tableWith("open", 10), tableWith("shut", 10)],
      (name) =>
        name === "shut"
          ? TableDetailLevel.HeaderOnly
          : TableDetailLevel.FullDetails,
    );

    expect(boxes.get("open")?.h).toBe(344);
    expect(boxes.get("shut")?.h).toBe(44);
  });

  test("drops a table that has never been measured", () => {
    const boxes = drawnBoxes(
      coords([["a", { x: 0, y: 0, w: 0, h: 0 }]]),
      [tableWith("a", 10)],
      () => TableDetailLevel.FullDetails,
    );

    expect(boxes.size).toBe(0);
  });

  test("keeps the stored height for a box with no table behind it", () => {
    const boxes = drawnBoxes(
      coords([["gone", { x: 0, y: 0, w: 200, h: 336 }]]),
      [],
      () => TableDetailLevel.HeaderOnly,
    );

    expect(boxes.get("gone")?.h).toBe(336);
  });

  test("a marquee under a collapsed table catches nothing", () => {
    // The bug this exists to close: the marquee used to read the stored
    // heights, so a drag through the empty space a collapsed table no longer
    // fills still caught it.
    const stored = coords([["a", { x: 0, y: 0, w: 200, h: 336 }]]);
    const tables = [tableWith("a", 10)];
    const belowTheHeader = { x: 0, y: 100, w: 200, h: 50 };

    expect(
      selectionFromMarquee(
        drawnBoxes(stored, tables, () => TableDetailLevel.HeaderOnly),
        belowTheHeader,
        false,
        new Set<string>(),
      ),
    ).toEqual(new Set());

    expect(
      selectionFromMarquee(
        drawnBoxes(stored, tables, () => TableDetailLevel.FullDetails),
        belowTheHeader,
        false,
        new Set<string>(),
      ),
    ).toEqual(new Set(["a"]));
  });
});
