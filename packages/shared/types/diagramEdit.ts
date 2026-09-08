/**
 * A change the diagram asks its host to make to the DBML source.
 *
 * It lives in `shared` rather than beside the parser so that the visualizer can
 * speak about an edit without depending on DBML at all: the diagram renders a
 * JSON table schema and knows nothing about the text behind it.
 *
 * `table` is the schema-qualified name the diagram displays, which is what
 * `computeNameWithSchemaName` produces.
 */
export type EditOperation =
  | { kind: "replaceField"; table: string; field: string; text: string }
  | { kind: "insertFieldAfter"; table: string; field: string; text: string }
  | { kind: "deleteField"; table: string; field: string }
  | {
      kind: "moveField";
      table: string;
      field: string;
      direction: "up" | "down";
    }
  | { kind: "renameTable"; table: string; newName: string };

export type EditRejection =
  | { code: "tableNotFound" }
  | { code: "fieldNotFound" }
  | { code: "ambiguousField" }
  | { code: "atBoundary" }
  | { code: "emptyText" }
  | { code: "nameTaken"; name: string }
  | { code: "staleText" }
  | { code: "notEditable" }
  | { code: "parseError"; message: string };

/**
 * What the host answers a submitted operation with.
 *
 * A success carries the element's identity *after* the edit, because the reader
 * may have renamed it in the same keystroke and the popup has to know where to
 * put the focus back.
 */
export type EditOutcome =
  | { ok: true; table: string; field?: string }
  | { ok: false; reason: EditRejection };
