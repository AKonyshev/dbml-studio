import {
  columnCountOf,
  columnNameAt,
  drawnOffsetOf,
  freeColumnName,
  nextDrawnField,
  setSchemaTables,
} from "../schemaIndexStore";
import { detailLevelStore } from "../detailLevelStore";
import { tableDetailLevelStore } from "../tableDetailLevelStore";

import type { JSONTableField, JSONTableTable } from "shared/types/tableSchema";

import { COLUMN_HEIGHT } from "@/constants/sizing";
import { TableDetailLevel } from "@/types/tableDetailLevel";

const column = (name: string, relatesTo?: string): JSONTableField => ({
  name,
  type: { type_name: "varchar", is_enum: false },
  is_relation: relatesTo !== undefined,
  relational_tables: relatesTo === undefined ? undefined : [relatesTo],
});

const users: JSONTableTable = {
  name: "users",
  fields: [
    column("id"),
    column("note", "orders"),
    column("note"),
    column("email"),
  ],
  indexes: [],
  x: 0,
  y: 0,
};

beforeEach(() => {
  tableDetailLevelStore.resetAll();
  detailLevelStore.set(TableDetailLevel.FullDetails);
  setSchemaTables([users]);
});

describe("naming a column by where it stands", () => {
  test("reads back the name at a position, namesakes and all", () => {
    expect(columnNameAt("users", 1)).toBe("note");
    expect(columnNameAt("users", 2)).toBe("note");
    expect(columnNameAt("users", 9)).toBeNull();
  });

  test("counts the table's columns", () => {
    expect(columnCountOf("users")).toBe(4);
    expect(columnCountOf("ghosts")).toBe(0);
  });

  test("walks to the column below by position, not by name", () => {
    expect(nextDrawnField("users", 1)).toEqual({
      at: 2,
      offsetY: 2 * COLUMN_HEIGHT,
    });
    expect(nextDrawnField("users", 3)).toBeNull();
  });

  test("gives each position the row it is drawn on", () => {
    expect(drawnOffsetOf("users", 2)).toBe(2 * COLUMN_HEIGHT);
  });
});

// At key-only the rows drawn are not the columns declared, so the row a column
// sits on and the position that names it come apart.
describe("when the table hides most of its rows", () => {
  beforeEach(() => {
    detailLevelStore.set(TableDetailLevel.KeyOnly);
  });

  test("the row a column is drawn on is not the position that names it", () => {
    // Only the column with a relation is drawn, and it is the file's second.
    expect(drawnOffsetOf("users", 1)).toBe(0);
    expect(drawnOffsetOf("users", 0)).toBeNull();
    expect(nextDrawnField("users", 1)).toBeNull();
  });
});

describe("naming a column that is about to be added", () => {
  test("takes the plain name while the table does not hold it", () => {
    expect(freeColumnName("users", "created_at")).toBe("created_at");
  });

  test("steps past the names the table already holds", () => {
    expect(freeColumnName("users", "note")).toBe("note_2");

    setSchemaTables([
      { ...users, fields: [...users.fields, column("note_2")] },
    ]);
    expect(freeColumnName("users", "note")).toBe("note_3");
  });
});
