import { detailLevelStore } from "./detailLevelStore";
import { tableDetailLevelStore } from "./tableDetailLevelStore";

import type { JSONTableTable } from "shared/types/tableSchema";

// The row offset the popup positions by must be the one the table draws rows
// at, so it is the same constant and not a copy.
import { COLUMN_HEIGHT } from "@/constants/sizing";
import { TableDetailLevel } from "@/types/tableDetailLevel";
import { filterByDetailLevel } from "@/utils/filterByDetailLevel";

/**
 * The schema as the diagram last received it, by table name, outside React.
 *
 * The editor's `Tab` has to know which column is drawn under the one it is on,
 * and the popup is a DOM overlay with no place in the React tree that knows
 * the table. Kept here by the wrapper that receives each schema, and read at
 * the keypress.
 */
let tablesByName = new Map<string, JSONTableTable>();
let version = 0;
const listeners = new Set<() => void>();

export const setSchemaTables = (tables: readonly JSONTableTable[]): void => {
  tablesByName = new Map(tables.map((table) => [table.name, table]));
  version += 1;
  listeners.forEach((listener) => {
    listener();
  });
};

/**
 * Bumped on every schema the diagram receives. The popup reads its text out of
 * the host's copy of the document, and that copy is only current once the
 * schema after an edit has arrived — a box opened on a column that was just
 * added has nothing to show until then.
 */
export const subscribeSchema = (listener: () => void): (() => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

export const getSchemaVersion = (): number => version;

export const isDrawnAtFullDetail = (tableName: string): boolean =>
  (tableDetailLevelStore.levelFor(tableName) ??
    detailLevelStore.getCurrentDetailLevel()) === TableDetailLevel.FullDetails;

/**
 * The column drawn after this one, at the level the table is currently shown
 * at, with its row offset — or null at the last row.
 *
 * At the table's *own* level, because that is what decides which rows are on
 * screen: at key-only, the row below `id` is the next key, not the next
 * column in the file.
 */
export const nextDrawnField = (
  tableName: string,
  fieldName: string,
): { field: string; offsetY: number } | null => {
  const table = tablesByName.get(tableName);
  if (table === undefined) return null;

  const level =
    tableDetailLevelStore.levelFor(tableName) ??
    detailLevelStore.getCurrentDetailLevel();
  const drawn = filterByDetailLevel(table.fields, level);
  const at = drawn.findIndex((field) => field.name === fieldName);
  if (at === -1 || at + 1 >= drawn.length) return null;

  return { field: drawn[at + 1].name, offsetY: (at + 1) * COLUMN_HEIGHT };
};

/** The row offset a column is drawn at, for a popup that has to follow a move. */
export const drawnOffsetOf = (
  tableName: string,
  fieldName: string,
): number | null => {
  const table = tablesByName.get(tableName);
  if (table === undefined) return null;

  const level =
    tableDetailLevelStore.levelFor(tableName) ??
    detailLevelStore.getCurrentDetailLevel();
  const at = filterByDetailLevel(table.fields, level).findIndex(
    (field) => field.name === fieldName,
  );

  return at === -1 ? null : at * COLUMN_HEIGHT;
};
