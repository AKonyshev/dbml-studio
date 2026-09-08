export { upsertMetaInfoInDbml } from "./utils/metainfo";
// The delimiters are part of the format, not an implementation detail: the web
// editor's grammar highlights the block and has to agree with the writer about
// where it begins and ends.
export { METAINFO_END, METAINFO_START } from "./utils/metainfo";
export type { TableCoordEntry } from "./utils/metainfo";

// Editing the source from a diagram: the caller supplies the document text and
// an intent, and gets back the ranges to change, already proved to parse.
export {
  planEdit,
  readFieldText,
  resolveRenamedTable,
} from "./utils/sourceEdit";
export type { EditPlan, TextEdit } from "./utils/sourceEdit";

export { parseDBMLToJSON } from "./parseDbml";
