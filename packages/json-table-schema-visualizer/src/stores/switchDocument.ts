import { detailLevelStore } from "./detailLevelStore";
import { stageStateStore } from "./stagesState";
import { tableCoordsStore } from "./tableCoords";
import { tableDetailLevelStore } from "./tableDetailLevelStore";
import { tableRelationsVisibilityStore } from "./tableRelationsVisibilityStore";

import type { JSONTableRef, JSONTableTable } from "shared/types/tableSchema";

import { defaultDetailLevelFor } from "@/utils/defaultDetailLevel";

// Every per-document store, pointed at one document in one call.
//
// The sequence is not bookkeeping and the order inside it matters:
// `tableCoordsStore.switchTo` flushes the outgoing document's positions before it
// recovers the incoming one's, and computes a fresh auto-layout when there is
// nothing stored. Miss it and the tables keep the previous document's
// coordinates — which on a first visit means piled wherever they were left,
// with no error anywhere to say so.
//
// It lived in three places before this: twice in the extension's schema hook
// (bootstrap and message paths) and once in the web entry point.
//
// The stores are named one by one rather than looped over `PER_DOCUMENT_STORES`,
// because only the first takes the schema and the order of the four is load-
// bearing — a loop would have to special-case both, and neither would have
// anywhere left to be explained.
//
// So adding a per-document store still means editing two files: this one and
// `perDocumentStores.ts`. The list does not make that automatic; what it does is
// leave one place to look for "which stores are keyed by document", instead of
// two lists that could disagree without either being wrong on its face.
export const switchDocument = (
  documentKey: string,
  tables: JSONTableTable[],
  refs: JSONTableRef[],
): void => {
  // Before the coordinates, not after, and that is the whole of why the order
  // is written out here. The arrangement is computed from how tall the tables
  // are drawn, so `tableCoordsStore.switchTo` reads the level back out of this
  // store; run the other way round it would arrange the incoming document by
  // the outgoing one's level. Flushing the outgoing document's coordinates is
  // safe either way — `switchTo` saves them under the key it is still holding,
  // which already names the level they were made at.
  //
  // Only a first-open default, and only for this document: a schema too large to
  // draw at full detail opens with headers instead of stuttering at seven frames
  // a second. Pressing `D` overrides it and is remembered.
  detailLevelStore.switchTo(documentKey, defaultDetailLevelFor(tables));
  tableCoordsStore.switchTo(documentKey, tables, refs);
  stageStateStore.switchTo(documentKey);
  tableRelationsVisibilityStore.switchTo(documentKey);
  // Last, and order-free unlike the three above: nothing here feeds the layout,
  // so no one is waiting to read it.
  tableDetailLevelStore.switchTo(documentKey);
};
