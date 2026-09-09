import { COLUMN_HEIGHT } from "@/constants/sizing";
import { t } from "@/i18n/t";
import { focusColumn } from "@/stores/currentTarget";
import { getDiagramEditingHost } from "@/stores/diagramEditing";
import { closeQuickEdit, openQuickEdit } from "@/stores/quickEditStore";
import {
  columnCountOf,
  drawnOffsetOf,
  freeColumnName,
  isDrawnAtFullDetail,
} from "@/stores/schemaIndexStore";

const NEW_COLUMN_STEM = "new_column";
const NEW_COLUMN_TYPE = "varchar";

/**
 * The line a new column starts life as.
 *
 * The name is one the table does not already hold: `new_column` three times
 * over is not a schema any database would take, and adding three columns in a
 * row is exactly what a reader building a table does.
 */
export const newColumnLine = (table: string): string =>
  `${freeColumnName(table, NEW_COLUMN_STEM)} ${NEW_COLUMN_TYPE}`;

/**
 * Where a new column goes for whatever the reader is pointing at.
 *
 * A column: below that one. A table, with none of its columns pointed at:
 * at the end of it, which is where a column being added to a table belongs
 * and what makes the key work on a table the reader has just clicked.
 *
 * Null for a table that declares no columns at all. Adding the first one is
 * not an insert *after* anything, and the diagram has nothing to aim at.
 */
export const addColumnAt = (aim: {
  table: string;
  at?: number;
  offsetY: number;
}): { at: number; offsetY: number } | null => {
  if (aim.at !== undefined) {
    return { at: aim.at, offsetY: aim.offsetY };
  }

  const last = columnCountOf(aim.table) - 1;
  if (last < 0) {
    return null;
  }

  return { at: last, offsetY: drawnOffsetOf(aim.table, last) ?? 0 };
};

/**
 * Put the reader on the column that has just been added.
 *
 * Shared by the two ways of adding one — the box's `Ctrl+Enter` and the
 * diagram's — so that both leave the reader in the same place: on the new
 * column, with its name open for typing, because a column called
 * `new_column` is not one anybody meant to keep.
 *
 * Rows are drawn only at full detail, so that is the only level at which a box
 * can sit on the new one. Anywhere else the column is in the file and not on
 * the canvas, which looks exactly like the key having done nothing — so the
 * reader is told, through the host, that it is there and where to look.
 */
export const openAddedColumn = (
  table: string,
  at: number,
  offsetY: number,
): void => {
  if (!isDrawnAtFullDetail(table)) {
    getDiagramEditingHost()?.notify?.(t("quickEdit.addedOutOfSight"));
    closeQuickEdit();

    return;
  }

  focusColumn(table, at, offsetY + COLUMN_HEIGHT);
  openQuickEdit({ table, at, offsetY: offsetY + COLUMN_HEIGHT });
};
