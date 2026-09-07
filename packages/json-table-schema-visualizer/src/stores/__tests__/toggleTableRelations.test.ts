import {
  RELATIONS_TOGGLE_EVENT,
  showAllTableRelations,
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

describe("showAllTableRelations", () => {
  beforeEach(() => {
    tableRelationsVisibilityStore.switchTo(`doc-${Math.random()}`);
  });

  test("brings back every table at once", () => {
    toggleTableRelations("users");
    toggleTableRelations("orders");

    showAllTableRelations();

    expect(tableRelationsVisibilityStore.areTableRelationsHidden("users")).toBe(
      false,
    );
    expect(
      tableRelationsVisibilityStore.areTableRelationsHidden("orders"),
    ).toBe(false);
  });

  test("announces once, however many tables it brought back", () => {
    toggleTableRelations("users");
    toggleTableRelations("orders");

    const heard: unknown[] = [];
    const listener = (): void => {
      heard.push(1);
    };
    eventEmitter.on(RELATIONS_TOGGLE_EVENT, listener);

    showAllTableRelations();
    eventEmitter.off(RELATIONS_TOGGLE_EVENT, listener);

    expect(heard).toHaveLength(1);
  });

  test("says nothing when there was nothing hidden", () => {
    const heard: unknown[] = [];
    const listener = (): void => {
      heard.push(1);
    };
    eventEmitter.on(RELATIONS_TOGGLE_EVENT, listener);

    showAllTableRelations();
    eventEmitter.off(RELATIONS_TOGGLE_EVENT, listener);

    expect(heard).toEqual([]);
  });

  test("leaves another document's hidden tables alone", () => {
    tableRelationsVisibilityStore.switchTo("doc-a");
    toggleTableRelations("users");

    tableRelationsVisibilityStore.switchTo("doc-b");
    toggleTableRelations("orders");
    showAllTableRelations();

    tableRelationsVisibilityStore.switchTo("doc-a");
    expect(tableRelationsVisibilityStore.areTableRelationsHidden("users")).toBe(
      true,
    );
  });
});

describe("hasHiddenRelations", () => {
  beforeEach(() => {
    tableRelationsVisibilityStore.switchTo(`doc-${Math.random()}`);
  });

  test("is what the toolbar button reads to know whether it can do anything", () => {
    expect(tableRelationsVisibilityStore.hasHiddenRelations()).toBe(false);

    toggleTableRelations("users");
    expect(tableRelationsVisibilityStore.hasHiddenRelations()).toBe(true);

    showAllTableRelations();
    expect(tableRelationsVisibilityStore.hasHiddenRelations()).toBe(false);
  });
});

describe("switching document", () => {
  test("announces, so a reader that came first is corrected", () => {
    tableRelationsVisibilityStore.switchTo("doc-with-hidden");
    toggleTableRelations("users");

    tableRelationsVisibilityStore.switchTo("doc-elsewhere");

    // Standing in for a component that mounted and read the store before
    // anything had switched it to the document being drawn.
    let seen = tableRelationsVisibilityStore.hasHiddenRelations();
    const listener = (): void => {
      seen = tableRelationsVisibilityStore.hasHiddenRelations();
    };
    eventEmitter.on(RELATIONS_TOGGLE_EVENT, listener);

    expect(seen).toBe(false);

    tableRelationsVisibilityStore.switchTo("doc-with-hidden");
    eventEmitter.off(RELATIONS_TOGGLE_EVENT, listener);

    expect(seen).toBe(true);
  });
});
