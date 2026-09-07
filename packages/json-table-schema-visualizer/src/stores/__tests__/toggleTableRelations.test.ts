import {
  RELATIONS_TOGGLE_EVENT,
  toggleTableRelations,
} from "../toggleTableRelations";
import { tableRelationsVisibilityStore } from "../tableRelationsVisibilityStore";

import eventEmitter from "@/events-emitter";

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

describe("toggleTableRelations", () => {
  beforeEach(() => {
    tableRelationsVisibilityStore.switchTo(`doc-${Math.random()}`);
  });

  test("flips a table between hidden and shown", () => {
    expect(tableRelationsVisibilityStore.areTableRelationsHidden("users")).toBe(
      false,
    );

    toggleTableRelations("users");
    expect(tableRelationsVisibilityStore.areTableRelationsHidden("users")).toBe(
      true,
    );

    toggleTableRelations("users");
    expect(tableRelationsVisibilityStore.areTableRelationsHidden("users")).toBe(
      false,
    );
  });

  test("announces the change, which is how the outline and icon redraw", () => {
    const heard: unknown[] = [];
    const listener = (name: unknown): void => {
      heard.push(name);
    };
    eventEmitter.on(RELATIONS_TOGGLE_EVENT, listener);

    toggleTableRelations("orders");
    eventEmitter.off(RELATIONS_TOGGLE_EVENT, listener);

    expect(heard).toEqual(["orders"]);
  });

  test("leaves other tables alone", () => {
    toggleTableRelations("users");

    expect(
      tableRelationsVisibilityStore.areTableRelationsHidden("orders"),
    ).toBe(false);
  });

  test("does nothing without a table, which is H over empty canvas", () => {
    const heard: unknown[] = [];
    const listener = (): void => {
      heard.push(1);
    };
    eventEmitter.on(RELATIONS_TOGGLE_EVENT, listener);

    toggleTableRelations("");
    eventEmitter.off(RELATIONS_TOGGLE_EVENT, listener);

    expect(heard).toEqual([]);
  });
});
