import { detailLevelStore } from "./detailLevelStore";
import { stageStateStore } from "./stagesState";
import { tableCoordsStore } from "./tableCoords";
import { tableDetailLevelStore } from "./tableDetailLevelStore";
import { tableRelationsVisibilityStore } from "./tableRelationsVisibilityStore";

/**
 * The stores that are keyed by document, in one place.
 *
 * `switchDocument` and `forgetAllDocuments` both have to name every one of
 * them, and each listed them separately until this existed. A fifth store added
 * to one list and not the other is the failure that would follow: switching
 * would carry it to the new document while forgetting left it behind, or the
 * reverse — and either way the symptom is one document quietly wearing
 * another's state, with nothing that fails to say so.
 *
 * `switchTo` is not on here on purpose: it takes different arguments per store,
 * so the two callers still say what they do with the list rather than sharing a
 * loop that would have to special-case one of them.
 */
export const PER_DOCUMENT_STORES = [
  tableCoordsStore,
  stageStateStore,
  detailLevelStore,
  tableRelationsVisibilityStore,
  tableDetailLevelStore,
] as const;
