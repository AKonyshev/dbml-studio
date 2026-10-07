import { PersistableStore } from "../PersitableStore";

import StorageBase from "@/types/storage";

class FakeStorage<T> extends StorageBase<T> {
  private readonly items = new Map<string, T>();

  getItem(key: string): object | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: T): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  keys(): string[] {
    return [...this.items.keys()];
  }

  /** What survived, for assertions. */
  contents(): string[] {
    return this.keys().sort();
  }
}

describe("PersistableStore", () => {
  test("files a document under the store's own name", () => {
    const storage = new FakeStorage<number>();
    const store = new PersistableStore("detailLevel", storage);

    store.persist("tab-1", 2);

    expect(storage.contents()).toEqual(["detailLevel:tab-1"]);
    expect(store.retrieve("tab-1")).toBe(2);
  });

  describe("clearAll", () => {
    test("forgets every document the store has filed", () => {
      const storage = new FakeStorage<number>();
      const store = new PersistableStore("detailLevel", storage);

      store.persist("tab-1", 1);
      store.persist("tab-7", 2);

      store.clearAll();

      expect(storage.contents()).toEqual([]);
    });

    // The load-bearing one. These stores share `localStorage` with everything
    // else the page keeps there — the web target's own `web:workspace` among
    // them — so a store that cleared by anything looser than its own prefix
    // would take the tab list down with the layouts.
    test("leaves keys belonging to anything else alone", () => {
      const storage = new FakeStorage<number>();
      const store = new PersistableStore("detailLevel", storage);

      store.persist("tab-1", 1);
      storage.setItem("web:workspace", 0);
      storage.setItem("tableCoords:tab-1", 0);
      storage.setItem("detailLevelLegacy:tab-1", 0);

      store.clearAll();

      expect(storage.contents()).toEqual([
        "detailLevelLegacy:tab-1",
        "tableCoords:tab-1",
        "web:workspace",
      ]);
    });

    test("removes nothing when the store has filed nothing", () => {
      const storage = new FakeStorage<number>();
      const store = new PersistableStore("detailLevel", storage);

      storage.setItem("web:workspace", 0);

      store.clearAll();

      expect(storage.contents()).toEqual(["web:workspace"]);
    });
  });
});
