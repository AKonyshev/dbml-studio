import { COLUMN_HEIGHT } from "@/constants/sizing";
import { t } from "@/i18n/t";
import { focusColumn } from "@/stores/currentTarget";
import { getDiagramEditingHost } from "@/stores/diagramEditing";
import { closeQuickEdit, openQuickEdit } from "@/stores/quickEditStore";
import { freeColumnName, isDrawnAtFullDetail } from "@/stores/schemaIndexStore";

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
