import { makeDetailLevelResolver } from "../detailLevelResolver";

import { detailLevelStore } from "@/stores/detailLevelStore";
import { tableDetailLevelStore } from "@/stores/tableDetailLevelStore";
import { TableDetailLevel } from "@/types/tableDetailLevel";

beforeAll(() => {
  const items = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, value),
    removeItem: (key: string) => items.delete(key),
    clear: () => {
      items.clear();
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    get length() {
      return items.size;
    },
  };
});

describe("makeDetailLevelResolver", () => {
  beforeEach(() => {
    detailLevelStore.set(TableDetailLevel.FullDetails);
    tableDetailLevelStore.switchTo(`doc-${Math.random()}`);
  });

  test("a table without an override is drawn at the diagram's level", () => {
    const levelFor = makeDetailLevelResolver(TableDetailLevel.KeyOnly);

    expect(levelFor("users")).toBe(TableDetailLevel.KeyOnly);
  });

  test("a table with an override is drawn at its own", () => {
    tableDetailLevelStore.cycle("users");
    const levelFor = makeDetailLevelResolver(TableDetailLevel.FullDetails);

    expect(levelFor("users")).toBe(TableDetailLevel.HeaderOnly);
    expect(levelFor("orders")).toBe(TableDetailLevel.FullDetails);
  });

  test("the resolver reads the store as it is asked, not as it was made", () => {
    const levelFor = makeDetailLevelResolver(TableDetailLevel.FullDetails);
    tableDetailLevelStore.cycle("users");

    expect(levelFor("users")).toBe(TableDetailLevel.HeaderOnly);
  });
});
