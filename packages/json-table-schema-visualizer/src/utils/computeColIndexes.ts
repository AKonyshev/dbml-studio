import { filterByDetailLevel } from "./filterByDetailLevel";

import type { ColsIndexesMap } from "@/types//tablesInfoProviderValue";
import type { JSONTableTable } from "shared/types/tableSchema";

import {
  TableDetailLevel,
  type DetailLevelResolver,
} from "@/types/tableDetailLevel";

/**
 * Where each column sits inside its table, keyed `table.column`.
 *
 * Built by assignment rather than by spreading an accumulator. The spread
 * version copied the whole map once per column, which is quadratic: on a
 * 117-table, 5,676-column schema it took ~100 ms, and it ran on every render of
 * the provider that owns it — that is, on every mouse move onto a table.
 *
 * The level is asked for per table. It used to be one value with an early
 * return for `HeaderOnly`; with a table free to be collapsed on its own, that
 * return would have indexed every other table's columns at the wrong level, and
 * the relation lines attach by these indexes.
 */
export const computeColIndexes = (
  tables: JSONTableTable[],
  levelFor: DetailLevelResolver,
): ColsIndexesMap => {
  const indexes: ColsIndexesMap = {};

  for (const table of tables) {
    const detailLevel = levelFor(table.name);
    // A table drawn as a header has no rows to index. Skipping it is also what
    // keeps a fully collapsed schema as cheap as the early return made it.
    if (detailLevel === TableDetailLevel.HeaderOnly) {
      continue;
    }

    filterByDetailLevel(table.fields, detailLevel).forEach((field, index) => {
      indexes[computeColIndexesKey(table.name, field.name)] = index;
    });
  }

  return indexes;
};

export const computeColIndexesKey = (
  tableName: string,
  attr: string,
): string => {
  return `${tableName}.${attr}`;
};
