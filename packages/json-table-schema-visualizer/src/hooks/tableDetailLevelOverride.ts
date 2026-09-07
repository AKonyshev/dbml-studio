import { useCallback, useMemo, useSyncExternalStore } from "react";

import { useTableDetailLevel } from "./tableDetailLevel";

import { tableDetailLevelStore } from "@/stores/tableDetailLevelStore";
import {
  type DetailLevelResolver,
  type TableDetailLevel,
} from "@/types/tableDetailLevel";
import { makeDetailLevelResolver } from "@/utils/detailLevelResolver";

/**
 * The level one table is drawn at.
 *
 * One slice per table, which is what keeps setting a table apart from
 * re-rendering the diagram: only the table whose answer changed hears about it.
 * See `useIsTableSelected` for the same shape.
 */
export const useResolvedTableDetailLevel = (
  tableName: string,
): TableDetailLevel => {
  const { detailLevel } = useTableDetailLevel();
  const read = useCallback(
    () => tableDetailLevelStore.levelFor(tableName),
    [tableName],
  );
  const override = useSyncExternalStore(
    tableDetailLevelStore.subscribe,
    read,
    read,
  );

  return override ?? detailLevel;
};

/**
 * A resolver for code that measures every table at once.
 *
 * There is no single slice to subscribe to here, so the version stands in for
 * one: a new number means a new resolver, and whoever memoized on it recomputes.
 */
export const useDetailLevelResolver = (): DetailLevelResolver => {
  const { detailLevel } = useTableDetailLevel();
  const version = useSyncExternalStore(
    tableDetailLevelStore.subscribe,
    tableDetailLevelStore.getVersion,
    tableDetailLevelStore.getVersion,
  );

  return useMemo(() => {
    // The resolver reads the store rather than closing over it, so the version
    // is here to make a new one, not to be read.
    void version;

    return makeDetailLevelResolver(detailLevel);
  }, [detailLevel, version]);
};

/**
 * Whether any table on this document is set apart — which is all the reset
 * button needs to know.
 *
 * The version is the slice here, for the same reason `useDetailLevelResolver`
 * uses it: the answer is about the store as a whole and no single table's level
 * decides it. See `useHasHiddenRelations`, which does the same job for the
 * button beside this one.
 */
export const useHasTableDetailLevelOverrides = (): boolean => {
  const version = useSyncExternalStore(
    tableDetailLevelStore.subscribe,
    tableDetailLevelStore.getVersion,
    tableDetailLevelStore.getVersion,
  );

  return useMemo(() => {
    void version;

    return tableDetailLevelStore.hasOverrides();
  }, [version]);
};
