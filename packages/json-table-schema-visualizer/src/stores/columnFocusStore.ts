type Listener = () => void;

export interface FocusedColumn {
  table: string;
  /**
   * Its position among the table's columns.
   *
   * Not its name: a table may declare two columns of one name, and the outline
   * then lit up both of them.
   */
  at: number;
  /**
   * Where the row is drawn inside the table's rows group, in world units.
   *
   * Kept here rather than recomputed: the component that took the focus already
   * knows it, and working it out again would mean repeating the detail-level
   * filtering that decided which rows are on screen at all.
   */
  offsetY: number;
}

/**
 * The one column the reader is pointing at, outside React.
 *
 * Outside React for the reason `hoverStore` is: components subscribe to a
 * derived boolean, so moving the focus re-renders the two columns whose answer
 * changed rather than every column on the canvas.
 *
 * Not persisted and not in `PER_DOCUMENT_STORES`: a focus is about what the
 * reader is doing this minute, not about the document.
 */
class ColumnFocusStore {
  private focused: FocusedColumn | null = null;
  private readonly listeners = new Set<Listener>();

  public readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  public readonly get = (): FocusedColumn | null => this.focused;

  public readonly set = (next: FocusedColumn | null): void => {
    const same =
      next?.table === this.focused?.table &&
      next?.at === this.focused?.at &&
      next?.offsetY === this.focused?.offsetY;
    if (same) {
      return;
    }

    this.focused = next;
    this.listeners.forEach((listener) => {
      listener();
    });
  };
}

export const columnFocusStore = new ColumnFocusStore();
