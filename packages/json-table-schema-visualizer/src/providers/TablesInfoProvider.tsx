import { createContext, useMemo, type ReactNode } from "react";

import type { TablesInfoProviderValue } from "@/types/tablesInfoProviderValue";
import type { JSONTableTable } from "shared/types/tableSchema";

import { computeColIndexes } from "@/utils/computeColIndexes";
import { useDetailLevelResolver } from "@/hooks/tableDetailLevelOverride";

export const TablesInfoContext = createContext<
  TablesInfoProviderValue | undefined
>(undefined);

interface TablesInfoProviderProps {
  tables: JSONTableTable[];
  children: ReactNode;
}

const TablesInfoProvider = ({ children, tables }: TablesInfoProviderProps) => {
  const levelFor = useDetailLevelResolver();

  // Depends on the schema and on the levels, and on nothing else. Recomputed
  // inline it was rebuilt on every hover: ~100 ms per mouse move on a
  // 5,676-column schema. Setting one table apart rebuilds it too, which is a
  // keypress rather than a pointer move.
  const colsIndexes = useMemo(
    () => computeColIndexes(tables, levelFor),
    [tables, levelFor],
  );

  const value = useMemo(() => ({ colsIndexes }), [colsIndexes]);

  return (
    <TablesInfoContext.Provider value={value}>
      {children}
    </TablesInfoContext.Provider>
  );
};

export default TablesInfoProvider;
