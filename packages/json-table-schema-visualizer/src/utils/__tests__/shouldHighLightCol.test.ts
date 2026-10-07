import { shouldHighLightCol } from "../shouldHighLightCol";

// The arguments in the order the caller passes them, so a case reads as the
// situation it describes rather than as six positional values.
const highlight = ({
  hovered = false,
  tableName = "users",
  hoveredTable = null,
  highlightedColumns = [],
  columnName = "id",
  relationalTables = undefined,
}: {
  hovered?: boolean;
  tableName?: string | null;
  hoveredTable?: string | null;
  highlightedColumns?: string[];
  columnName?: string | null;
  relationalTables?: string[] | null;
} = {}): boolean =>
  shouldHighLightCol(
    hovered,
    tableName,
    hoveredTable,
    highlightedColumns,
    columnName,
    relationalTables,
  );

/**
 * Whether one column is painted as highlighted.
 *
 * Asked for every column on every pointer move — the hot path `hoverStore` was
 * rewritten around — and answering it wrongly is not a crash but a diagram that
 * lights up the wrong thing, which nothing else would catch.
 */
describe("shouldHighLightCol", () => {
  it("lights a column the pointer is on", () => {
    expect(highlight({ hovered: true })).toBe(true);
  });

  it("lights a column the search picked out", () => {
    expect(
      highlight({ highlightedColumns: ["users.id"], columnName: "id" }),
    ).toBe(true);
  });

  it("leaves the rest dark while a search highlight stands", () => {
    // The search names one column. Lighting its neighbours as well would say
    // the search had found more than it had.
    expect(
      highlight({ highlightedColumns: ["users.email"], columnName: "id" }),
    ).toBe(false);
  });

  it("lights the related columns of the table under the pointer", () => {
    expect(
      highlight({
        hoveredTable: "users",
        tableName: "users",
        relationalTables: ["posts"],
      }),
    ).toBe(true);
  });

  it("leaves an unrelated column of the hovered table dark", () => {
    // Hovering a table picks out what it is joined by, not everything it holds.
    expect(
      highlight({
        hoveredTable: "users",
        tableName: "users",
        relationalTables: null,
      }),
    ).toBe(false);
  });

  it("lights the far end of a relation to the hovered table", () => {
    expect(
      highlight({
        hoveredTable: "users",
        tableName: "posts",
        columnName: "author_id",
        relationalTables: ["users"],
      }),
    ).toBe(true);
  });

  it("leaves a column joined to some third table dark", () => {
    expect(
      highlight({
        hoveredTable: "users",
        tableName: "posts",
        relationalTables: ["comments"],
      }),
    ).toBe(false);
  });

  it("lights nothing when the pointer is nowhere and nothing was searched", () => {
    expect(highlight({ relationalTables: ["posts"] })).toBe(false);
  });

  it("still follows the pointer while a search highlight stands", () => {
    // Both at once: the reader searched, then went hunting with the mouse. The
    // hover is the more recent of the two and is not shouted down by the search.
    expect(
      highlight({
        highlightedColumns: ["users.email"],
        hoveredTable: "posts",
        tableName: "posts",
        columnName: "author_id",
        relationalTables: ["users"],
      }),
    ).toBe(true);
  });

  it("survives a column it cannot name", () => {
    // `tableName` and `columnName` are both nullable at the call site, and a
    // key cannot be built without them.
    expect(
      highlight({ tableName: null, highlightedColumns: ["users.id"] }),
    ).toBe(false);
    expect(
      highlight({ columnName: null, highlightedColumns: ["users.id"] }),
    ).toBe(false);
  });
});
