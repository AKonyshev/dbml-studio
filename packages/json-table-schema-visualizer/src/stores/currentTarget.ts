import { columnFocusStore } from "./columnFocusStore";
import { selectionStore } from "./selectionStore";

/**
 * Table selection and column focus are one thing wearing two shapes, and the
 * rule that only one of them is ever live lives here rather than in each
 * handler that might forget it.
 *
 * Tables stay a set, because the marquee needs one. A column is single, because
 * editing aims at exactly one thing. Writing either through anything but these
 * three functions is what would let the two drift apart.
 */
export const focusColumn = (
  table: string,
  at: number,
  offsetY: number,
): void => {
  selectionStore.setSelected(new Set());
  columnFocusStore.set({ table, at, offsetY });
};

/** Point at nothing, without touching the table selection. */
export const clearColumnFocus = (): void => {
  columnFocusStore.set(null);
};

export const selectTables = (names: ReadonlySet<string>): void => {
  columnFocusStore.set(null);
  selectionStore.setSelected(names);
};

export const toggleTableSelection = (name: string): void => {
  columnFocusStore.set(null);
  selectionStore.toggle(name);
};

/** Clicking nothing means pointing at nothing, of either kind. */
export const clearCurrentTarget = (): void => {
  columnFocusStore.set(null);
  selectionStore.clear();
};
