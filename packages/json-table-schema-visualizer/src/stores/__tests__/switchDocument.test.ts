import { switchDocument } from "../switchDocument";
import { detailLevelStore } from "../detailLevelStore";
import { tableCoordsStore } from "../tableCoords";
import { tableDetailLevelStore } from "../tableDetailLevelStore";

import type { JSONTableField, JSONTableTable } from "shared/types/tableSchema";

import { TableDetailLevel } from "@/types/tableDetailLevel";

jest.mock("@/utils/computeTextSize", () => ({
  computeTextSize: jest.fn((text: string) => ({
    width: text.length * 8,
    height: 10,
  })),
}));

const tableWith = (name: string, columns: number): JSONTableTable =>
  ({
    name,
    fields: Array.from(
      { length: columns },
      (_, i) =>
        ({
          name: `c${i}`,
          type: { type_name: "integer", is_enum: false },
          is_relation: false,
        }) as unknown as JSONTableField,
    ),
    indexes: [],
    x: 0,
    y: 0,
  }) as unknown as JSONTableTable;

// The stores reach for `localStorage` the moment they are asked to do
// anything, and this suite runs under Node. A map standing in for it keeps the
// test about what `switchDocument` decides, which is the only thing in
// question, and lets each case start from a reader who has never opened
// anything.
const fakeLocalStorage = (): Storage => {
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
  } as unknown as Storage;
};

describe("switchDocument", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: fakeLocalStorage(),
      configurable: true,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      value: fakeLocalStorage(),
      configurable: true,
    });
  });

  // A neighbour beside the wide one, because a table with nothing to shrink but
  // itself opens at full detail however tall it is — see `defaultDetailLevelFor`.
  const wideSchema = (): JSONTableTable[] => [
    tableWith("wide", 200),
    tableWith("neighbour", 4),
  ];

  test("opens a schema of very wide tables at its default level", () => {
    switchDocument("doc-wide", wideSchema(), []);

    expect(detailLevelStore.getCurrentDetailLevel()).toBe(
      TableDetailLevel.HeaderOnly,
    );
  });

  test("arranges the incoming document at its own level, not the last one's", () => {
    switchDocument("doc-small", [tableWith("small", 5)], []);
    expect(detailLevelStore.getCurrentDetailLevel()).toBe(
      TableDetailLevel.FullDetails,
    );

    switchDocument("doc-wide", wideSchema(), []);

    // The layout is computed from the drawn height, so a document that opens
    // with headers must be arranged for headers. Arranged at the outgoing
    // document's level it would be spaced for two hundred columns of table.
    const box = tableCoordsStore.getFullCoords("wide");
    expect(box.h).toBeLessThan(100);
  });
  test("a document's per-table levels arrive and leave with it", () => {
    switchDocument("doc-a", [tableWith("users", 3)], []);
    tableDetailLevelStore.cycle("users");

    switchDocument("doc-b", [tableWith("users", 3)], []);
    expect(tableDetailLevelStore.levelFor("users")).toBeNull();

    switchDocument("doc-a", [tableWith("users", 3)], []);
    expect(tableDetailLevelStore.levelFor("users")).not.toBeNull();
  });
});
