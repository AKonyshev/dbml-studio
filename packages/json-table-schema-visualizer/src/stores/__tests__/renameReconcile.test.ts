// Konva measures text through a canvas, which a node environment has none of,
// and the coordinates store reaches it through the layout helper.
import {
  forgetRenames,
  isTableKnown,
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

describe("what a re-key tells the diagram", () => {
  beforeEach(() => {
    localStorage.clear();
    forgetRenames();
    tableCoordsStore.switchTo("doc-3", [], []);
    tableDetailLevelStore.switchTo("doc-3");
    tableRelationsVisibilityStore.switchTo("doc-3");
  });

  // A table reads its position when it is drawn and then listens. A rename
  // that happened after it was drawn under the new name has to be heard by it,
  // or it sits in the corner — but the *reset* event re-frames the whole
  // view, which a rename must not do.
  it("reaches the tables without re-framing the view", () => {
    const tables = jest.fn();
    const framing = jest.fn();
    const stopTables = tableCoordsStore.subscribeToPositions(tables);
    const stopFraming = tableCoordsStore.subscribeToReset(framing);
    tableCoordsStore.setCoords("a", { x: 1, y: 2 });

    renameTableState("a", "b");

    expect(tables).toHaveBeenCalled();
    expect(framing).not.toHaveBeenCalled();

    stopTables();
    stopFraming();
  });

  it("says whether the diagram already files state under a name", () => {
    tableCoordsStore.setCoords("taken", { x: 1, y: 2 });

    expect(isTableKnown("taken")).toBe(true);
    expect(isTableKnown("free")).toBe(false);
  });

  // The rename is carried ahead of the write only onto a free name. Carried
  // onto a name another table holds, it would overwrite that table's state
  // before the host had a chance to refuse the collision.
  it("is not carried onto another table's name", () => {
    tableCoordsStore.setCoords("a", { x: 1, y: 2 });
    tableCoordsStore.setCoords("b", { x: 9, y: 9 });

    // What the popup does: ask first, carry only when free.
    if (!isTableKnown("b")) {
      renameTableState("a", "b");
    }

    expect(tableCoordsStore.getCoords("b")).toMatchObject({ x: 9, y: 9 });
    expect(tableCoordsStore.getCoords("a")).toMatchObject({ x: 1, y: 2 });
  });
});
