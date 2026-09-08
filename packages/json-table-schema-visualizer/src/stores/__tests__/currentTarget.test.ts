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
    focusColumn("users", "email");

    expect(selectionStore.getSelected().size).toBe(0);
    expect(columnFocusStore.get()).toEqual({ table: "users", field: "email" });
  });

  it("selecting tables clears the column focus", () => {
    focusColumn("users", "email");
    selectTables(new Set(["posts"]));

    expect(columnFocusStore.get()).toBeNull();
    expect(selectionStore.isSelected("posts")).toBe(true);
  });

  it("toggling a table into the selection clears the column focus", () => {
    focusColumn("users", "email");
    toggleTableSelection("posts");

    expect(columnFocusStore.get()).toBeNull();
    expect(selectionStore.isSelected("posts")).toBe(true);
  });

  it("notifies subscribers only when the focus actually changes", () => {
    const listener = jest.fn();
    const unsubscribe = columnFocusStore.subscribe(listener);

    focusColumn("users", "email");
    focusColumn("users", "email");

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
