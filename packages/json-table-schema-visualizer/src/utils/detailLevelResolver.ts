import { tableDetailLevelStore } from "@/stores/tableDetailLevelStore";
import {
  type DetailLevelResolver,
  type TableDetailLevel,
} from "@/types/tableDetailLevel";

/**
 * The one place the two records of a table's level are put together.
 *
 * The store is read at the call rather than captured, so a resolver handed to a
 * measurement made later still answers for the overrides in force then.
 */
export const makeDetailLevelResolver =
  (globalLevel: TableDetailLevel): DetailLevelResolver =>
  (tableName: string): TableDetailLevel =>
    tableDetailLevelStore.levelFor(tableName) ?? globalLevel;
