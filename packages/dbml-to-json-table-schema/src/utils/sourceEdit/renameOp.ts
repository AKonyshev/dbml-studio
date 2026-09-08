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
  const typed = operation.newName.trim();
  if (typed === "") return { ok: false, reason: { code: "emptyText" } };

  const table = findTable(index, operation.table);
  if (table === null) return { ok: false, reason: { code: "tableNotFound" } };

  // The reader edits the name the diagram shows them, which is qualified when
  // the *parser* says the table has a schema of its own. It does not when the
  // whole qualified name is one quoted identifier (`Table "sch.users"`), and
  // there the dot is part of the name — splitting on it there would silently
  // move the table out of its schema.
  const prefix = table.schemaName === null ? null : `${table.schemaName}.`;
  const declared =
    prefix !== null && typed.startsWith(prefix)
      ? typed.slice(prefix.length)
      : typed;

  const newFullName =
    table.schemaName === null ? declared : `${table.schemaName}.${declared}`;

  const taken = index.tables.some(
    (other) => other !== table && other.fullName === newFullName,
  );
  if (taken) {
    return { ok: false, reason: { code: "nameTaken", name: newFullName } };
  }

  // Put back what was taken: a name written in quotes stays in quotes, and one
  // that needs them gets them, or DBML reads the dot as a schema separator.
  const needsQuoting = !/^[A-Za-z_][A-Za-z0-9_]*$/.test(declared);
  const write = (occurrence: { quoted: boolean }, value: string): string =>
    occurrence.quoted || needsQuoting ? `"${value}"` : value;

  const edits: TextEdit[] = [
    {
      start: table.nameRange.start,
      end: table.nameRange.end,
      text: write(table.nameRange, declared),
    },
    ...table.refNameRanges.map((occurrence) => ({
      start: occurrence.start,
      end: occurrence.end,
      text: write(occurrence, declared),
    })),
    // The layout block is JSON, and the range covers the whole string there,
    // so a whole string goes back — escaped the way JSON needs it.
    ...table.metaInfoNameRanges.map((occurrence) => ({
      start: occurrence.start,
      end: occurrence.end,
      text: JSON.stringify(newFullName),
    })),
  ];

  return { ok: true, edits, newFullName };
};
