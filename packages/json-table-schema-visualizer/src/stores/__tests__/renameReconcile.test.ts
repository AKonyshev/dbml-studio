// Konva measures text through a canvas, which a node environment has none of,
// and the coordinates store reaches it through the layout helper.
import {
  forgetRenames,
  predictRenamedFullName,
  reconcileAfterSchemaChange,
  recordRename,
  renameTableState,
} from "../renameReconcile";
import { tableCoordsStore } from "../tableCoords";
import { tableDetailLevelStore } from "../tableDetailLevelStore";
import { tableRelationsVisibilityStore } from "../tableRelationsVisibilityStore";

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
  } as unknown as Storage;
};

beforeAll(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: fakeStorage(),
    configurable: true,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    value: fakeStorage(),
    configurable: true,
  });
});

describe("renameTableState", () => {
  beforeEach(() => {
    localStorage.clear();
    forgetRenames();
    tableCoordsStore.switchTo("doc-1", [], []);
    tableDetailLevelStore.switchTo("doc-1");
    tableRelationsVisibilityStore.switchTo("doc-1");
  });

  it("moves the position to the new name", () => {
    tableCoordsStore.setCoords("users", { x: 42, y: 7 });

    renameTableState("users", "accounts");

    expect(tableCoordsStore.getCoords("accounts")).toMatchObject({
      x: 42,
      y: 7,
    });
    expect(tableCoordsStore.getAllCoords().has("users")).toBe(false);
  });

  it("moves the hidden-relations flag", () => {
    tableRelationsVisibilityStore.toggleTableRelations("users");

    renameTableState("users", "accounts");

    expect(
      tableRelationsVisibilityStore.areTableRelationsHidden("accounts"),
    ).toBe(true);
    expect(tableRelationsVisibilityStore.areTableRelationsHidden("users")).toBe(
      false,
    );
  });

  it("moves the per-table detail level", () => {
    tableDetailLevelStore.cycle("users");
    const level = tableDetailLevelStore.levelFor("users");

    renameTableState("users", "accounts");

    expect(tableDetailLevelStore.levelFor("accounts")).toBe(level);
    expect(tableDetailLevelStore.levelFor("users")).toBeNull();
  });

  it("does nothing when the old name holds no state", () => {
    expect(() => {
      renameTableState("ghost", "spirit");
    }).not.toThrow();
  });

  it("does nothing when the name did not change", () => {
    tableCoordsStore.setCoords("users", { x: 1, y: 2 });

    renameTableState("users", "users");

    expect(tableCoordsStore.getCoords("users")).toMatchObject({ x: 1, y: 2 });
  });
});

describe("mirroring an undone rename", () => {
  beforeEach(() => {
    localStorage.clear();
    forgetRenames();
    tableCoordsStore.switchTo("doc-2", [], []);
    tableDetailLevelStore.switchTo("doc-2");
    tableRelationsVisibilityStore.switchTo("doc-2");
  });

  it("moves the state back when the old name returns", () => {
    tableCoordsStore.setCoords("accounts", { x: 5, y: 6 });
    recordRename("users", "accounts");

    reconcileAfterSchemaChange(["users", "posts"]);

    expect(tableCoordsStore.getCoords("users")).toMatchObject({ x: 5, y: 6 });
  });

  it("moves it forward again on redo", () => {
    tableCoordsStore.setCoords("accounts", { x: 5, y: 6 });
    recordRename("users", "accounts");

    reconcileAfterSchemaChange(["users", "posts"]);
    reconcileAfterSchemaChange(["accounts", "posts"]);

    expect(tableCoordsStore.getCoords("accounts")).toMatchObject({
      x: 5,
      y: 6,
    });
  });

  it("does nothing while both names are absent", () => {
    recordRename("users", "accounts");

    expect(() => {
      reconcileAfterSchemaChange(["posts"]);
    }).not.toThrow();
  });

  it("forgets everything when the diagram closes", () => {
    recordRename("users", "accounts");
    forgetRenames();
    tableCoordsStore.setCoords("accounts", { x: 1, y: 1 });

    reconcileAfterSchemaChange(["users"]);

    expect(tableCoordsStore.getAllCoords().has("users")).toBe(false);
  });
});

describe("carrying the position before the write", () => {
  beforeEach(() => {
    localStorage.clear();
    forgetRenames();
    tableCoordsStore.switchTo("doc-3", [], []);
    tableDetailLevelStore.switchTo("doc-3");
    tableRelationsVisibilityStore.switchTo("doc-3");
  });

  // The order is the whole point. A table reads its position once, when it is
  // drawn, and the new schema draws it under the new name — so a position moved
  // after the write is never read and the table lands in the corner.
  it("has the position under the new name before anything is written", () => {
    tableCoordsStore.setCoords("acl.analysis", { x: 300, y: 120 });

    renameTableState("acl.analysis", predictRenamedFullName("acl.analysis1"));

    expect(tableCoordsStore.getCoords("acl.analysis1")).toMatchObject({
      x: 300,
      y: 120,
    });
  });

  it("puts it back when the write is refused", () => {
    tableCoordsStore.setCoords("acl.analysis", { x: 300, y: 120 });
    const predicted = predictRenamedFullName("acl.analysis1");

    renameTableState("acl.analysis", predicted);
    renameTableState(predicted, "acl.analysis", { announce: true });

    expect(tableCoordsStore.getCoords("acl.analysis")).toMatchObject({
      x: 300,
      y: 120,
    });
    expect(tableCoordsStore.getAllCoords().has("acl.analysis1")).toBe(false);
  });

  it("corrects a guess the host disagrees with", () => {
    tableCoordsStore.setCoords("analytics.users", { x: 40, y: 50 });
    // The reader typed a bare name for a schema-qualified table.
    const predicted = predictRenamedFullName("accounts");

    renameTableState("analytics.users", predicted);
    renameTableState(predicted, "analytics.accounts", { announce: true });

    expect(tableCoordsStore.getCoords("analytics.accounts")).toMatchObject({
      x: 40,
      y: 50,
    });
  });

  it("tells the diagram to look again when it corrects late", () => {
    const listener = jest.fn();
    const unsubscribe = tableCoordsStore.subscribeToReset(listener);
    tableCoordsStore.setCoords("a", { x: 1, y: 2 });

    renameTableState("a", "b");
    expect(listener).not.toHaveBeenCalled();

    renameTableState("b", "c", { announce: true });
    expect(listener).toHaveBeenCalled();

    unsubscribe();
  });
});
