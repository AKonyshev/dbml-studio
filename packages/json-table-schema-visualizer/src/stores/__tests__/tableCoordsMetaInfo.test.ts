import { detailLevelStore } from "../detailLevelStore";
import { tableCoordsStore } from "../tableCoords";

import type { JSONTableTable } from "shared/types/tableSchema";

import { TableDetailLevel } from "@/types/tableDetailLevel";

jest.mock("@/utils/computeTextSize", () => ({
  computeTextSize: jest.fn((text: string) => ({
    width: text.length * 8,
    height: 10,
  })),
}));

const fakeStorage = (): Storage => {
  const items = new Map<string, string>();

  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
    clear: () => {
      items.clear();
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    get length() {
      return items.size;
    },
  };
};

const tableFrom = (
  name: string,
  columns: number,
  fromFile?: { x: number; y: number; detailLevel: string },
): JSONTableTable => ({
  name,
  fields: Array.from({ length: columns }, (_, i) => ({
    name: `c${i}`,
    type: { type_name: "integer", is_enum: false },
    is_relation: false,
  })),
  indexes: [],
  x: fromFile?.x ?? 0,
  y: fromFile?.y ?? 0,
  fromMetaInfo: fromFile !== undefined,
  metaInfoPositions:
    fromFile === undefined
      ? undefined
      : { [fromFile.detailLevel]: { x: fromFile.x, y: fromFile.y } },
});

describe("the layout a file is given, and the one it is read back from", () => {
  // A document key per case. The store is a singleton and carries the previous
  // case's map into the next one, where saving it under a key that case then
  // reads would hand it back a layout it never made.
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: fakeStorage(),
      configurable: true,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      value: fakeStorage(),
      configurable: true,
    });
  });

  test("offers the arrangement in hand, saying which level it was made at", () => {
    detailLevelStore.set(TableDetailLevel.HeaderOnly);
    tableCoordsStore.switchTo("doc-offered", [tableFrom("t", 80)], []);

    const entries = tableCoordsStore.getCoordEntriesForMetaInfo();

    // Moving a table about with only the headers showing is an arrangement like
    // any other, and it goes into the file like any other — carrying the level
    // it was made at, which is what makes it safe to read back.
    expect(entries).toEqual([
      expect.objectContaining({
        name: "t",
        detailLevel: TableDetailLevel.HeaderOnly,
      }),
    ]);
  });

  test("uses a file's coordinates when they were arranged for the level in force", () => {
    detailLevelStore.set(TableDetailLevel.HeaderOnly);
    tableCoordsStore.switchTo(
      "doc-same-level",
      [tableFrom("t", 80, { x: 4242, y: 2424, detailLevel: "HeaderOnly" })],
      [],
    );

    expect(tableCoordsStore.getFullCoords("t")).toEqual(
      expect.objectContaining({ x: 4242, y: 2424 }),
    );
  });

  test("passes over a file's coordinates arranged for another level", () => {
    detailLevelStore.set(TableDetailLevel.FullDetails);
    tableCoordsStore.switchTo(
      "doc-other-level",
      [tableFrom("t", 80, { x: 4242, y: 2424, detailLevel: "HeaderOnly" })],
      [],
    );

    // Eighty rows of table laid out on coordinates spaced for eighty headers is
    // eighty rows of table on top of the next one along.
    expect(tableCoordsStore.getFullCoords("t").x).not.toBe(4242);
  });

  test("offers every arrangement it has, full detail last", () => {
    detailLevelStore.set(TableDetailLevel.FullDetails);
    tableCoordsStore.switchTo("doc-three", [tableFrom("t", 80)], []);

    // `D` to headers: a second arrangement, computed and stored under its own
    // key, with the full-detail one saved on the way out.
    detailLevelStore.set(TableDetailLevel.HeaderOnly);
    tableCoordsStore.switchToDetailLevel([tableFrom("t", 80)], []);

    const entries = tableCoordsStore.getCoordEntriesForMetaInfo();
    const levels = entries.map((entry) => entry.detailLevel);

    // Both go into the file. Holding only the one on screen would throw the
    // reader's other arrangement away every time they pressed `D`.
    expect(new Set(levels)).toEqual(
      new Set([TableDetailLevel.HeaderOnly, TableDetailLevel.FullDetails]),
    );

    // And full detail is written last, because a reader that predates the
    // level field keeps whichever entry it saw last, and that one is the only
    // arrangement safe to draw at any level.
    expect(levels[levels.length - 1]).toBe(TableDetailLevel.FullDetails);
  });
});
