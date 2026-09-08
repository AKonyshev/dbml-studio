import {
  type JSONTableEnum,
  type JSONTableRef,
  type JSONTableTable,
} from "shared/types/tableSchema";
import { type ReactNode } from "react";

import EmptyTableMessage from "../Messages/EmptyTableMessage";
import Search from "../Search/Search";
import QuickEditPopup from "../QuickEdit/QuickEditPopup";

import DiagramWrapper from "./DiagramWrapper";
import RelationsConnections from "./Connections";
import Tables from "./Tables";

import TablesPositionsProvider from "@/providers/TablesPositionsProvider";
import MainProviders from "@/providers/MainProviders";
import TableLevelDetailProvider from "@/providers/TableDetailLevelProvider";
import { useThemeContext } from "@/hooks/theme";
import { Theme } from "@/types/theme";

interface DiagramViewerProps {
  tables: JSONTableTable[];
  refs: JSONTableRef[];
  enums: JSONTableEnum[];
  documentKey?: string | null;
  syncEffects?: ReactNode;
  hostActions?: ReactNode;
  /** Passed straight through to the wrapper; see `DiagramWrapper`. */
  autoFit?: boolean;
  /** Hides the toolbar and the search bar until the pointer is over the
   * diagram; see `DiagramWrapper`. The group they reveal from is on the `main`
   * below, because it is the one box that holds both. */
  revealControlsOnHover?: boolean;
  /** Passed straight through to the wrapper; see `DiagramWrapper`. */
  keyboardShortcuts?: boolean;
}

const DiagramViewer = ({
  refs,
  tables,
  enums,
  documentKey = null,
  syncEffects = null,
  hostActions = null,
  autoFit = false,
  revealControlsOnHover = false,
  keyboardShortcuts = true,
}: DiagramViewerProps) => {
  const { theme } = useThemeContext();

  if (tables.length === 0) {
    return <EmptyTableMessage />;
  }

  return (
    <TableLevelDetailProvider>
      <TablesPositionsProvider tables={tables} refs={refs}>
        <MainProviders tables={tables} refs={refs} enums={enums}>
          <main
            // `h-full w-full` so the diagram below can measure a real box. This
            // element had no height of its own and did not need one while the
            // stage sized itself to the viewport regardless of its container.
            className={`relative flex h-full w-full flex-col items-center ${theme === Theme.dark ? "dark" : ""} ${revealControlsOnHover ? "group/diagram" : ""}`}
          >
            {syncEffects}
            <Search tables={tables} hideUntilHover={revealControlsOnHover} />

            <DiagramWrapper
              hostActions={hostActions}
              autoFit={autoFit}
              revealControlsOnHover={revealControlsOnHover}
              keyboardShortcuts={keyboardShortcuts}
              tablesMeta={tables}
              refs={refs}
              connections={
                <RelationsConnections
                  refs={refs}
                  documentKey={documentKey ?? undefined}
                />
              }
              tables={<Tables tables={tables} />}
            />

            {/* A DOM overlay: the diagram is a canvas, which has no text input
                of its own. Inside `main` because that is the positioned box the
                stage fills. */}
            <QuickEditPopup />
          </main>
        </MainProviders>
      </TablesPositionsProvider>
    </TableLevelDetailProvider>
  );
};

export default DiagramViewer;
