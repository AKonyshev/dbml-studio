type Listener = () => void;

/**
 * What the pointer is over, outside React.
 *
 * It used to be state on the provider that also carries the column map, so a
 * mouse move onto a table re-rendered every consumer of that context: 117 table
 * headers, 93 connections and — at full detail — 5,676 column wrappers, none of
 * which had anything to do with the table under the pointer.
 *
 * Here the value lives in one place and components subscribe to a *derived*
 * slice of it, almost always a single boolean. `useSyncExternalStore` re-renders
 * a component only when its own slice changes, so hovering a table now costs the
 * two tables involved and the connections between them, not the whole diagram.
 */
/** The column the pointer is over, and where its row is drawn. */
export interface HoveredColumn {
  table: string;
  field: string;
  offsetY: number;
}

class HoverStore {
  private hoveredTableName: string | null = null;
  private hoveredColumn: HoveredColumn | null = null;
  private highlightedColumns: string[] = [];
  private readonly listeners = new Set<Listener>();

  public readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  public readonly getHoveredTableName = (): string | null =>
    this.hoveredTableName;

  public readonly getHoveredColumn = (): HoveredColumn | null =>
    this.hoveredColumn;

  /**
   * Set by the column under the pointer, so that a key aimed at "this column"
   * can mean the one being pointed at rather than one clicked long ago.
   *
   * No listeners are told: every reader of this asks at the keypress, the way
   * `H` and `T` ask for the hovered table, and re-rendering on pointer movement
   * is exactly what this store exists to avoid.
   */
  public readonly setHoveredColumn = (next: HoveredColumn | null): void => {
    this.hoveredColumn = next;
  };

  /**
   * Let go of a column, but only if it is still the one being pointed at.
   *
   * Leaving one column for the next raises the new one's enter before this
   * leave, so a leave that asked by name alone released whichever column had
   * just taken the pointer — and every schema has an `id` in more than one
   * table, which is where that went wrong.
   */
  public readonly releaseHoveredColumn = (
    table: string,
    field: string,
  ): void => {
    if (
      this.hoveredColumn?.table === table &&
      this.hoveredColumn.field === field
    ) {
      this.hoveredColumn = null;
    }
  };

  public readonly getHighlightedColumns = (): string[] =>
    this.highlightedColumns;

  public readonly setHoveredTableName = (tableName: string | null): void => {
    if (tableName === this.hoveredTableName) {
      return;
    }

    this.hoveredTableName = tableName;
    this.emit();
  };

  public readonly setHighlightedColumns = (columnKeys: string[]): void => {
    // Same keys means nothing to tell anyone about — and the pointer produces a
    // great many of those.
    if (
      columnKeys.length === this.highlightedColumns.length &&
      columnKeys.every((key, index) => key === this.highlightedColumns[index])
    ) {
      return;
    }

    this.highlightedColumns = columnKeys;
    this.emit();
  };

  private emit(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const hoverStore = new HoverStore();

/** Stable across renders, so a component that only sets never re-renders. */
export const setHoveredTableName = hoverStore.setHoveredTableName;
export const setHighlightedColumns = hoverStore.setHighlightedColumns;
export const getHoveredTableName = hoverStore.getHoveredTableName;
export const getHighlightedColumns = hoverStore.getHighlightedColumns;
export const setHoveredColumn = hoverStore.setHoveredColumn;
export const releaseHoveredColumn = hoverStore.releaseHoveredColumn;
export const getHoveredColumn = hoverStore.getHoveredColumn;
