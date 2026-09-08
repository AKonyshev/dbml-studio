type Listener = () => void;

export interface FocusedColumn {
  table: string;
  field: string;
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
      next?.field === this.focused?.field;
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
