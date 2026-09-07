import { createContext, useCallback, useState, type ReactNode } from "react";

import {
  type TableDetailLevelValue,
  TableDetailLevel,
} from "@/types/tableDetailLevel";
import { detailLevelStore } from "@/stores/detailLevelStore";
import { levelAfter } from "@/utils/levelAfter";

export const TableDetailLevelContext = createContext<TableDetailLevelValue>({
  detailLevel: TableDetailLevel.FullDetails,
  next() {},
});

interface TableLevelDetailProviderProps {
  children: ReactNode;
  level?: TableDetailLevel;
}

const TableLevelDetailProvider = ({
  children,
}: TableLevelDetailProviderProps) => {
  const [state, setState] = useState(() =>
    detailLevelStore.getCurrentDetailLevel(),
  );

  /**
   * The store is written here, in the handler, and not from an effect.
   *
   * There are two records of the detail level — this state, which decides what
   * is drawn, and `detailLevelStore`, which is what the stores outside React
   * read. `tableCoordsStore` is one of them: the arrangement is computed from
   * how tall the tables are drawn, so it asks the store which level to arrange
   * for.
   *
   * Updating the store from an effect here put the two out of step for exactly
   * one render, and that was long enough. Effects run child before parent, so
   * `DiagramWrapper` — which sits under this provider and re-arranges the
   * diagram when the level changes — ran first and read a store this provider
   * had not written yet. Every arrangement was made for the level before the
   * one on screen: press `D` twice and the diagram was drawn at full detail in
   * an arrangement made for headers, overflowing the frame it had just been
   * fitted into.
   *
   * Written before `setState` rather than after, so nothing that runs as a
   * result of the state change can observe the old value.
   */
  const next = useCallback((): void => {
    const level = levelAfter(state);

    detailLevelStore.set(level);
    detailLevelStore.saveCurrentState();
    setState(level);
  }, [state, setState]);
  return (
    <TableDetailLevelContext.Provider value={{ detailLevel: state, next }}>
      {children}
    </TableDetailLevelContext.Provider>
  );
};

export default TableLevelDetailProvider;
