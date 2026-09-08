import { useContext, useMemo, useSyncExternalStore } from "react";
import { type JSONTableTable } from "shared/types/tableSchema";

import type { TablesInfoProviderValue } from "@/types/tablesInfoProviderValue";
import type { XYPosition } from "@/types/positions";

import { TablesInfoContext } from "@/providers/TablesInfoProvider";
import { TablesPositionsContext } from "@/providers/TablesPositionsProvider";
import { TableDimensionContext } from "@/providers/TableDimension";
import { TABLE_DEFAULT_MIN_WIDTH } from "@/constants/sizing";
import { computeTableLineWidths } from "@/utils/tableWComputation/computeTableLineWidths";
import { computeTablePreferredWidth } from "@/utils/tableWComputation/computeTablePreferredWidth";
import { tableWidthStore } from "@/stores/tableWidth";
import { type TablesPositionsContextValue } from "@/types/dimension";
import { tableCoordsStore } from "@/stores/tableCoords";
import { useForeignKeys } from "@/hooks/foreignKeys";

export const useTablesInfo = (): TablesInfoProviderValue => {
  const tablesInfo = useContext(TablesInfoContext);

  if (tablesInfo == null) {
    throw new Error("useTablesInfo must be used within a TableInfoProvider");
  }

  return tablesInfo;
};

export const useTablePositionContext = (): TablesPositionsContextValue => {
  const tablesPositionsMap = useContext(TablesPositionsContext);

  if (tablesPositionsMap == null) {
    throw new Error(
      "useTablePosition must be used within the TablesPositionsContext",
    );
  }

  return tablesPositionsMap;
};

export const useTableDefaultPosition = (tableName: string): XYPosition => {
  const tablesPositions = useSyncExternalStore(
    (callback) => {
      return tableCoordsStore.subscribeToPositions(callback);
    },
    () => {
      return tableCoordsStore.getCoords(tableName);
    },
  );

  return tablesPositions;
};

export const useGetTableMinWidth = (table: JSONTableTable): number => {
  // The same set the layout measured against, so what was reserved for a badge
  // and what is drawn there agree.
  const foreignKeys = useForeignKeys();
  // On the table and the set rather than on the measured widths: the widths are
  // a fresh array every render, so a dependency on them memoized nothing.
  const minWidth = useMemo(() => {
    const minW = computeTablePreferredWidth(
      computeTableLineWidths(table, foreignKeys),
      table.name,
    );
    tableWidthStore.setWidth(table.name, minW);
    return minW;
  }, [table, foreignKeys]);

  return minWidth;
};

export const useTableWidth = (): number => {
  const contextValue = useContext(TableDimensionContext);

  return contextValue?.width ?? TABLE_DEFAULT_MIN_WIDTH;
};
