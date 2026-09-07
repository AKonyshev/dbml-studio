import { TableDetailLevel } from "@/types/tableDetailLevel";

/**
 * The next level in the cycle.
 *
 * One order for the whole diagram and for a single table, so that the two keys
 * cannot walk the levels differently. It lived inside
 * `TableDetailLevelProvider` while the diagram was the only thing that cycled.
 */
export const levelAfter = (level: TableDetailLevel): TableDetailLevel => {
  if (level === TableDetailLevel.FullDetails) {
    return TableDetailLevel.HeaderOnly;
  }

  return level === TableDetailLevel.HeaderOnly
    ? TableDetailLevel.KeyOnly
    : TableDetailLevel.FullDetails;
};
