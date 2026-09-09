import { commitOperationFor, quickEditIntent } from "../quickEditIntent";

describe("quickEditIntent", () => {
  it("applies and closes on Enter", () => {
    expect(quickEditIntent({ key: "Enter" }, true)).toEqual({
      kind: "commitAndClose",
    });
  });

  it("lets Shift+Enter through as a line break", () => {
    expect(quickEditIntent({ key: "Enter", shiftKey: true }, true)).toEqual({
      kind: "passThrough",
    });
  });

  it("adds a column below on the chord with Enter", () => {
    expect(quickEditIntent({ key: "Enter", ctrlKey: true }, true)).toEqual({
      kind: "commitAndAddBelow",
    });
    expect(quickEditIntent({ key: "Enter", metaKey: true }, true)).toEqual({
      kind: "commitAndAddBelow",
    });
  });

  it("has nothing to add below when a table name is being edited", () => {
    expect(quickEditIntent({ key: "Enter", ctrlKey: true }, false)).toEqual({
      kind: "commitAndClose",
    });
  });

  it("deletes on the chord with Delete, for a column only", () => {
    expect(quickEditIntent({ key: "Delete", ctrlKey: true }, true)).toEqual({
      kind: "delete",
    });
    expect(quickEditIntent({ key: "Delete", ctrlKey: true }, false)).toBeNull();
  });

  it("moves a column on the chord with an arrow", () => {
    expect(quickEditIntent({ key: "ArrowUp", metaKey: true }, true)).toEqual({
      kind: "move",
      direction: "up",
    });
    expect(quickEditIntent({ key: "ArrowDown", ctrlKey: true }, true)).toEqual({
      kind: "move",
      direction: "down",
    });
  });

  it("leaves a bare arrow to the text cursor", () => {
    expect(quickEditIntent({ key: "ArrowUp" }, true)).toBeNull();
  });

  it("applies and moves to the next column on Tab", () => {
    expect(quickEditIntent({ key: "Tab" }, true)).toEqual({
      kind: "commitAndNext",
    });
  });

  it("has no next column when a table name is being edited, so Tab closes", () => {
    expect(quickEditIntent({ key: "Tab" }, false)).toEqual({
      kind: "commitAndClose",
    });
  });

  it("closes without applying on Escape", () => {
    expect(quickEditIntent({ key: "Escape" }, true)).toEqual({ kind: "close" });
  });

  it("means nothing for an ordinary character", () => {
    expect(quickEditIntent({ key: "a" }, true)).toBeNull();
  });
});

describe("commitOperationFor", () => {
  it("replaces a column when one is being edited", () => {
    expect(
      commitOperationFor(
        { table: "users", at: 1, offsetY: 30 },
        "email varchar [unique]",
      ),
    ).toEqual({
      kind: "replaceField",
      table: "users",
      at: 1,
      text: "email varchar [unique]",
    });
  });

  it("renames the table when no column is being edited", () => {
    expect(
      commitOperationFor({ table: "users", offsetY: 0 }, "accounts"),
    ).toEqual({
      kind: "renameTable",
      table: "users",
      newName: "accounts",
    });
  });
});
