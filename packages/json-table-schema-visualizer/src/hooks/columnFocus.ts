import { useCallback, useSyncExternalStore } from "react";

import { columnFocusStore } from "@/stores/columnFocusStore";

/**
 * One boolean per column, which is what keeps moving the focus from
 * re-rendering the whole diagram. See `useIsTableSelected` for the same shape.
 */
export const useIsColumnFocused = (tableName: string, at: number): boolean => {
  const select = useCallback(() => {
    const focused = columnFocusStore.get();

    return focused?.table === tableName && focused?.at === at;
  }, [tableName, at]);

  return useSyncExternalStore(columnFocusStore.subscribe, select, select);
};
