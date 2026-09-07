import { detailLevelStore } from "../detailLevelStore";
import { tableDetailLevelStore } from "../tableDetailLevelStore";

import { TableDetailLevel } from "@/types/tableDetailLevel";

// The store is a module singleton that reaches for the real `localStorage`,
// so there is nothing to inject a fake into — the global is the seam.
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

describe("tableDetailLevelStore", () => {
  beforeEach(() => {
    detailLevelStore.set(TableDetailLevel.FullDetails);
    tableDetailLevelStore.switchTo(`doc-${Math.random()}`);
  });

  test("a table with no override follows the diagram", () => {
    expect(tableDetailLevelStore.levelFor("users")).toBeNull();
    expect(tableDetailLevelStore.hasOverrides()).toBe(false);
  });

  test("the cycle starts from the level the table is drawn at", () => {
    detailLevelStore.set(TableDetailLevel.HeaderOnly);

    tableDetailLevelStore.cycle("users");

    expect(tableDetailLevelStore.levelFor("users")).toBe(
      TableDetailLevel.KeyOnly,
    );
  });

  test("three turns bring a table back where it started", () => {
    tableDetailLevelStore.cycle("users");
    tableDetailLevelStore.cycle("users");
    tableDetailLevelStore.cycle("users");

    expect(tableDetailLevelStore.levelFor("users")).toBe(
      TableDetailLevel.FullDetails,
    );
  });

  test("one table's level says nothing about another's", () => {
    tableDetailLevelStore.cycle("users");

    expect(tableDetailLevelStore.levelFor("orders")).toBeNull();
  });

  test("a reset drops every override and says it changed something", () => {
    tableDetailLevelStore.cycle("users");

    expect(tableDetailLevelStore.resetAll()).toBe(true);
    expect(tableDetailLevelStore.levelFor("users")).toBeNull();
  });

  test("a reset over a diagram with nothing set changes nothing", () => {
    expect(tableDetailLevelStore.resetAll()).toBe(false);
  });

  test("overrides come back with the document they were made on", () => {
    // Named per run rather than fixed, so that this case cannot inherit what an
    // earlier one left under the same key — the store is a module singleton and
    // its storage outlives every test in this file.
    const first = `doc-${Math.random()}`;
    const second = `doc-${Math.random()}`;

    tableDetailLevelStore.switchTo(first);
    tableDetailLevelStore.cycle("users");

    tableDetailLevelStore.switchTo(second);
    expect(tableDetailLevelStore.levelFor("users")).toBeNull();

    tableDetailLevelStore.switchTo(first);
    expect(tableDetailLevelStore.levelFor("users")).toBe(
      TableDetailLevel.HeaderOnly,
    );
  });

  test("a reset leaves storage as a document never opened", () => {
    const key = `doc-${Math.random()}`;
    tableDetailLevelStore.switchTo(key);
    tableDetailLevelStore.cycle("users");
    tableDetailLevelStore.resetAll();

    // Read back through a fresh switch, which is the only way this store ever
    // reads its own storage.
    tableDetailLevelStore.switchTo(key);
    expect(tableDetailLevelStore.hasOverrides()).toBe(false);
  });

  test("a change is announced once, and a no-op reset not at all", () => {
    let heard = 0;
    const unsubscribe = tableDetailLevelStore.subscribe(() => {
      heard += 1;
    });

    tableDetailLevelStore.cycle("users");
    tableDetailLevelStore.resetAll();
    tableDetailLevelStore.resetAll();
    unsubscribe();

    expect(heard).toBe(2);
  });

  test("an empty name is not a table", () => {
    tableDetailLevelStore.cycle("");

    expect(tableDetailLevelStore.hasOverrides()).toBe(false);
  });
});
