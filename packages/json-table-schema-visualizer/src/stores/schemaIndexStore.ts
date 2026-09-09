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
 * Which of a table's columns are drawn, and on which row.
 *
 * At the table's *own* level, because that is what decides which rows are on
 * screen: at key-only, the row below `id` is the next key, not the next column
 * in the file. A column is named by its position in the file, so both are
 * carried — the row it is drawn on is not the position it holds.
 */
const drawnRows = (
  tableName: string,
): Array<{ at: number; row: number }> | null => {
  const table = tablesByName.get(tableName);
  if (table === undefined) return null;

  const level =
    tableDetailLevelStore.levelFor(tableName) ??
    detailLevelStore.getCurrentDetailLevel();
  const drawn = new Set(filterByDetailLevel(table.fields, level));

  let row = 0;
  const rows: Array<{ at: number; row: number }> = [];
  table.fields.forEach((field, at) => {
    if (!drawn.has(field)) return;
    rows.push({ at, row });
    row += 1;
  });

  return rows;
};

export const nextDrawnField = (
  tableName: string,
  at: number,
): { at: number; offsetY: number } | null => {
  const rows = drawnRows(tableName);
  if (rows === null) return null;

  const row = rows.findIndex((drawn) => drawn.at === at);
  if (row === -1 || row + 1 >= rows.length) return null;

  return { at: rows[row + 1].at, offsetY: (row + 1) * COLUMN_HEIGHT };
};

/** The row offset a column is drawn at, for a popup that has to follow a move. */
export const drawnOffsetOf = (tableName: string, at: number): number | null => {
  const rows = drawnRows(tableName);
  const row = rows?.findIndex((drawn) => drawn.at === at) ?? -1;

  return row === -1 ? null : row * COLUMN_HEIGHT;
};

/** How many columns the table has, so an insert can be aimed past the last. */
export const columnCountOf = (tableName: string): number =>
  tablesByName.get(tableName)?.fields.length ?? 0;

/** What the column at this position is called, for a label to read out. */
export const columnNameAt = (tableName: string, at: number): string | null =>
  tablesByName.get(tableName)?.fields[at]?.name ?? null;

/**
 * A name for a column about to be added that the table does not already hold.
 *
 * `new_column` three times over is not a schema any database would accept, and
 * the diagram was happy to write it.
 */
export const freeColumnName = (tableName: string, stem: string): string => {
  const taken = new Set(
    tablesByName.get(tableName)?.fields.map((field) => field.name) ?? [],
  );
  if (!taken.has(stem)) return stem;

  let n = 2;
  while (taken.has(`${stem}_${n}`)) n += 1;

  return `${stem}_${n}`;
};
