import { quickEditTargetFor, type QuickEditAim } from "../quickEditTarget";

const nothing: QuickEditAim = {
  hoveredColumn: null,
  hoveredTable: null,
  focusedColumn: null,
  selectedTables: [],
};

const column = { table: "users", field: "email", offsetY: 30 };

describe("quickEditTargetFor", () => {
  it("takes the column under the pointer", () => {
    expect(
      quickEditTargetFor({
        ...nothing,
        hoveredColumn: column,
        hoveredTable: "users",
      }),
    ).toEqual(column);
  });

  it("takes the table under the pointer when no column is", () => {
    expect(quickEditTargetFor({ ...nothing, hoveredTable: "users" })).toEqual({
      table: "users",
      offsetY: 0,
    });
  });

  // The bug this function exists for: a click on a column used to win over
  // everything, so hovering any table and pressing the key re-opened that
  // column and renaming a table looked broken.
  it("prefers the hovered table over a column clicked earlier", () => {
    expect(
      quickEditTargetFor({
        ...nothing,
        hoveredTable: "posts",
        focusedColumn: column,
      }),
    ).toEqual({ table: "posts", offsetY: 0 });
  });

  it("prefers the hovered column over a different one clicked earlier", () => {
    const hovered = { table: "posts", field: "title", offsetY: 60 };

    expect(
      quickEditTargetFor({
        ...nothing,
        hoveredColumn: hovered,
        hoveredTable: "posts",
        focusedColumn: column,
      }),
    ).toEqual(hovered);
  });

  it("falls back to the clicked column when the pointer is off the diagram", () => {
    expect(quickEditTargetFor({ ...nothing, focusedColumn: column })).toEqual(
      column,
    );
  });

  it("falls back to a single selected table", () => {
    expect(
      quickEditTargetFor({ ...nothing, selectedTables: ["users"] }),
    ).toEqual({ table: "users", offsetY: 0 });
  });

  it("refuses to guess between several selected tables", () => {
    expect(
      quickEditTargetFor({ ...nothing, selectedTables: ["users", "posts"] }),
    ).toBeNull();
  });

  it("aims at nothing when nothing is pointed at", () => {
    expect(quickEditTargetFor(nothing)).toBeNull();
  });

  it("treats an empty hovered name as nothing", () => {
    expect(quickEditTargetFor({ ...nothing, hoveredTable: "" })).toBeNull();
  });
});
