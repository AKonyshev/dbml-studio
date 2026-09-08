import { findTable } from "./sourceIndex";

import type { EditOperation, EditRejection } from "shared/types/diagramEdit";
import type { SourceIndex, TextEdit } from "./types";

export type RenameResult =
  | { ok: true; edits: TextEdit[]; newFullName: string }
  | { ok: false; reason: EditRejection };

/**
 * A rename is the one operation that is not local.
 *
 * The name lives in the header, in every standalone ref that goes through it,
 * and in the metainfo block that carries the table's position between the
 * extension and the web app. All three move in one edit, so the file is never
 * internally inconsistent and one undo takes back the whole rename.
 *
 * Refs that use the table's alias are deliberately absent from
 * `refNameRanges` — the alias is not what is being renamed, and rewriting it
 * would break every reference that goes through it.
 */
export const planRename = (
  index: SourceIndex,
  operation: Extract<EditOperation, { kind: "renameTable" }>,
): RenameResult => {
  const newName = operation.newName.trim();
  if (newName === "") return { ok: false, reason: { code: "emptyText" } };

  const table = findTable(index, operation.table);
  if (table === null) return { ok: false, reason: { code: "tableNotFound" } };

  const newFullName =
    table.schemaName === null ? newName : `${table.schemaName}.${newName}`;

  const taken = index.tables.some(
    (other) => other !== table && other.fullName === newFullName,
  );
  if (taken) {
    return { ok: false, reason: { code: "nameTaken", name: newFullName } };
  }

  const edits: TextEdit[] = [
    { start: table.nameRange.start, end: table.nameRange.end, text: newName },
    ...table.refNameRanges.map((range) => ({
      start: range.start,
      end: range.end,
      text: newName,
    })),
    ...table.metaInfoNameRanges.map((range) => ({
      start: range.start,
      end: range.end,
      text: newFullName,
    })),
  ];

  return { ok: true, edits, newFullName };
};
