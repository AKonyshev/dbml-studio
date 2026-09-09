import { newColumnLine, openAddedColumn } from "../addColumn";

import type { JSONTableField, JSONTableTable } from "shared/types/tableSchema";

import { COLUMN_HEIGHT } from "@/constants/sizing";
import { t } from "@/i18n/t";
import { columnFocusStore } from "@/stores/columnFocusStore";
import { detailLevelStore } from "@/stores/detailLevelStore";
import { setDiagramEditingHost } from "@/stores/diagramEditing";
import { getQuickEditTarget, openQuickEdit } from "@/stores/quickEditStore";
import { setSchemaTables } from "@/stores/schemaIndexStore";
import { tableDetailLevelStore } from "@/stores/tableDetailLevelStore";
import { TableDetailLevel } from "@/types/tableDetailLevel";

const column = (name: string, relatesTo?: string): JSONTableField => ({
  name,
  type: { type_name: "varchar", is_enum: false },
  is_relation: relatesTo !== undefined,
  relational_tables: relatesTo === undefined ? undefined : [relatesTo],
});

const users: JSONTableTable = {
  name: "users",
  fields: [column("id", "orders"), column("email"), column("new_column")],
  indexes: [],
  x: 0,
  y: 0,
};

const notified: string[] = [];

// `tableDetailLevelStore` writes a table's own level down as it is set, and a
// node environment has nowhere to write it.
beforeAll(() => {
  const items = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
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
      key: () => null,
      length: 0,
    } as unknown as Storage,
  });
});

beforeEach(() => {
  notified.length = 0;
  tableDetailLevelStore.resetAll();
  detailLevelStore.set(TableDetailLevel.FullDetails);
  setSchemaTables([users]);
  setDiagramEditingHost({
    readFieldText: () => null,
    submit: async () => ({ ok: true, table: "users" }),
    notify: (message) => {
      notified.push(message);
    },
  });
});

afterEach(() => {
  setDiagramEditingHost(null);
});

describe("naming the line a new column starts as", () => {
  test("steps past a name the table already holds", () => {
    expect(newColumnLine("users")).toBe("new_column_2 varchar");
  });
});

describe("landing on the column that was added", () => {
  test("puts the box and the outline on the row below", () => {
    openAddedColumn("users", 2, COLUMN_HEIGHT);

    expect(getQuickEditTarget()).toEqual({
      table: "users",
      at: 2,
      offsetY: 2 * COLUMN_HEIGHT,
    });
    expect(columnFocusStore.get()?.at).toBe(2);
    expect(notified).toEqual([]);
  });

  // The column is in the file and not on the canvas, which reads as the key
  // having done nothing at all.
  test("says where the column went when the table is not drawn in full", () => {
    detailLevelStore.set(TableDetailLevel.KeyOnly);
    openQuickEdit({ table: "users", at: 0, offsetY: 0 });

    openAddedColumn("users", 2, COLUMN_HEIGHT);

    expect(notified).toEqual([t("quickEdit.addedOutOfSight")]);
    expect(getQuickEditTarget()).toBeNull();
  });

  // A table can be folded on its own while the diagram around it is not, and
  // its own level is the one that decides what is drawn.
  test("reads the table's own level, not the diagram's", () => {
    tableDetailLevelStore.cycle("users");

    openAddedColumn("users", 2, COLUMN_HEIGHT);

    expect(notified).toHaveLength(1);
    expect(getQuickEditTarget()).toBeNull();
  });
});
