import { getDiagramEditingHost } from "./diagramEditing";

type Listener = () => void;

export interface QuickEditTarget {
  table: string;
  /** Absent when the table's own name is being edited. */
  field?: string;
  /** Where the row sits inside the table's rows group, in world units. */
  offsetY: number;
}

/**
 * What the quick edit popup is open on, if anything.
 *
 * Separate from the column focus because the two answer different questions:
 * the focus is where the reader is pointing, and this is what they have opened
 * for editing. Closing the popup must not un-point them.
 */
let target: QuickEditTarget | null = null;
const listeners = new Set<Listener>();

const emit = (): void => {
  listeners.forEach((listener) => {
    listener();
  });
};

export const subscribeQuickEdit = (listener: Listener): (() => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

export const getQuickEditTarget = (): QuickEditTarget | null => target;

/**
 * Refused where nothing can come of it.
 *
 * Editing is a capability a host lends the diagram, and the web app and the
 * Antora embed lend none — a double-click there would otherwise open a box that
 * looks like an editor and silently swallows everything typed into it. The same
 * guard covers a document the extension has said it cannot write to.
 */
export const openQuickEdit = (next: QuickEditTarget): void => {
  const host = getDiagramEditingHost();
  if (host === null || !host.isEditable()) {
    return;
  }

  target = next;
  emit();
};

export const closeQuickEdit = (): void => {
  if (target === null) {
    return;
  }

  target = null;
  emit();
};
