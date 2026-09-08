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

export const openQuickEdit = (next: QuickEditTarget): void => {
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
