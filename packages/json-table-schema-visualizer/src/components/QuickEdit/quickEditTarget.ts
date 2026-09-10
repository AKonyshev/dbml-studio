import type { QuickEditTarget } from "@/stores/quickEditStore";

export interface QuickEditAim {
  /** The column the pointer is over, if it is over one. */
  hoveredColumn: QuickEditTarget | null;
  /** The table the pointer is over, if it is over one. */
  hoveredTable: string | null;
  /** The column last clicked, which stays pointed at until something else is. */
  focusedColumn: QuickEditTarget | null;
  selectedTables: readonly string[];
}

/**
 * What the edit key opens, out of everything that could claim it.
 *
 * The pointer comes first, and that ordering is the whole point of this
 * function. It used to be the clicked column first, and because a click's focus
 * survives until something else takes it, one click on a column made the key
 * open that column for ever: hovering a table and pressing it re-opened the
 * column across the diagram, so renaming a table looked broken rather than
 * mis-aimed.
 *
 * `H` and `T` already act on what the pointer is over, so the diagram's own
 * habit is the one followed here. The clicked column and the selection are kept
 * as fallbacks, for a reader whose pointer is off the diagram entirely.
 */
export const quickEditTargetFor = (
  aim: QuickEditAim,
): QuickEditTarget | null => {
  if (aim.hoveredColumn !== null) {
    return aim.hoveredColumn;
  }

  if (aim.hoveredTable !== null && aim.hoveredTable !== "") {
    return { table: aim.hoveredTable, offsetY: 0 };
  }

  if (aim.focusedColumn !== null) {
    return aim.focusedColumn;
  }

  if (aim.selectedTables.length === 1) {
    return { table: aim.selectedTables[0], offsetY: 0 };
  }

  return null;
};

/**
 * What the delete key takes out, which is not what the edit key opens.
 *
 * `F2` follows the pointer, and it has to: a click's outline survives until
 * something else takes it, so the pointer is the only thing that says "this
 * one, now". Opening the wrong box costs an `Escape`.
 *
 * Deleting the wrong column costs the column. So the outline wins here — it is
 * the reader's own answer to "which one", it is on the screen where they can
 * see it, and the pointer merely happens to be somewhere. Reported by a reader
 * who clicked one column, moved the mouse over another and lost the second.
 *
 * With nothing outlined the pointer is all there is, and it decides. A table
 * under either of them is answered with, so that the key can say what it wants
 * rather than doing nothing.
 */
export const deleteTargetFor = (aim: QuickEditAim): QuickEditTarget | null => {
  if (aim.focusedColumn !== null) {
    return aim.focusedColumn;
  }

  return quickEditTargetFor(aim);
};
