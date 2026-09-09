/**
 * A change the diagram asks its host to make to the DBML source.
 *
 * It lives in `shared` rather than beside the parser so that the visualizer can
 * speak about an edit without depending on DBML at all: the diagram renders a
 * JSON table schema and knows nothing about the text behind it.
 *
 * `table` is the schema-qualified name the diagram displays, which is what
 * `computeNameWithSchemaName` produces.
 *
 * A column, though, is named by where it stands and not by what it is called.
 * DBML lets a table declare two columns of one name, and a diagram drawn from
 * such a file offered no way to say which of them was meant: an edit aimed at
 * the second changed the first, the focus outline lit up both, and a second
 * inserted column could not be told from the first. `at` is the column's
 * position among the table's fields as the file declares them, which is the
 * order the diagram draws them in.
 */
export type EditOperation =
  | { kind: "replaceField"; table: string; at: number; text: string }
  | { kind: "insertFieldAfter"; table: string; at: number; text: string }
  | { kind: "deleteField"; table: string; at: number }
  | {
      kind: "moveField";
      table: string;
      at: number;
      direction: "up" | "down";
    }
  | { kind: "renameTable"; table: string; newName: string };

export type EditRejection =
  | { code: "tableNotFound" }
  | { code: "fieldNotFound" }
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
 * put the focus back. For a column that is where it now stands: an insert moves
 * everything below it down, and a move swaps it with a neighbour.
 */
export type EditOutcome =
  | { ok: true; table: string; at?: number }
  | { ok: false; reason: EditRejection };
