import { columnFocusStore } from "../columnFocusStore";
import {
  clearColumnFocus,
  focusColumn,
  selectTables,
  toggleTableSelection,
} from "../currentTarget";
import { selectionStore } from "../selectionStore";

describe("current target", () => {
  beforeEach(() => {
    clearColumnFocus();
    selectionStore.clear();
  });

  it("focusing a column clears the table selection", () => {
    selectTables(new Set(["users", "posts"]));
    focusColumn("users", 1, 30);

    expect(selectionStore.getSelected().size).toBe(0);
    expect(columnFocusStore.get()).toEqual({
      table: "users",
      at: 1,
      offsetY: 30,
    });
  });

  it("selecting tables clears the column focus", () => {
    focusColumn("users", 1, 30);
    selectTables(new Set(["posts"]));

    expect(columnFocusStore.get()).toBeNull();
    expect(selectionStore.isSelected("posts")).toBe(true);
  });

  it("toggling a table into the selection clears the column focus", () => {
    focusColumn("users", 1, 30);
    toggleTableSelection("posts");

    expect(columnFocusStore.get()).toBeNull();
    expect(selectionStore.isSelected("posts")).toBe(true);
  });

  it("notifies subscribers only when the focus actually changes", () => {
    const listener = jest.fn();
    const unsubscribe = columnFocusStore.subscribe(listener);

    focusColumn("users", 1, 30);
    focusColumn("users", 1, 30);

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
