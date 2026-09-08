import { useCallback, useSyncExternalStore } from "react";

import { columnFocusStore } from "@/stores/columnFocusStore";

/**
 * One boolean per column, which is what keeps moving the focus from
 * re-rendering the whole diagram. See `useIsTableSelected` for the same shape.
 */
export const useIsColumnFocused = (
  tableName: string,
  colName: string,
): boolean => {
  const select = useCallback(() => {
    const focused = columnFocusStore.get();

    return focused?.table === tableName && focused?.field === colName;
  }, [tableName, colName]);

  return useSyncExternalStore(columnFocusStore.subscribe, select, select);
};
