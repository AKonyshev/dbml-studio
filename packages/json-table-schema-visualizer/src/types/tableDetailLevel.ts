export enum TableDetailLevel {
  FullDetails = "FullDetails",
  KeyOnly = "KeyOnly",
  HeaderOnly = "HeaderOnly",
}

export interface TableDetailLevelValue {
  detailLevel: TableDetailLevel;
  next: () => void;
}

/**
 * How one named table is drawn.
 *
 * Passed to everything that measures more than one table at a time, in place of
 * the single level those functions took while the diagram had only one.
 */
export type DetailLevelResolver = (tableName: string) => TableDetailLevel;
