import { parseDBMLToJSON } from "../../parseDbml";

import { planColumnEdit } from "./columnOps";
import { planRename } from "./renameOp";
import { buildSourceIndex, findTable } from "./sourceIndex";

import type { EditOperation, EditRejection } from "shared/types/diagramEdit";
import type { SourceIndex, TextEdit } from "./types";

export type EditPlan =
  | {
      ok: true;
      edits: TextEdit[];
      nextText: string;
      table: string;
      at?: number;
    }
  | { ok: false; reason: EditRejection };

const applyEdits = (text: string, edits: TextEdit[]): string => {
  let out = text;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }

  return out;
};

const parseErrorOf = (error: unknown): EditRejection => {
  const diagnostics = (error as { diags?: Array<{ message: string }> }).diags;
  const message =
    diagnostics
      ?.map((diagnostic) => diagnostic.message)
      .filter((text) => text.length > 0)
      .join("; ") ?? (error instanceof Error ? error.message : String(error));

  return { code: "parseError", message };
};

/**
 * The reason a candidate document cannot be written, or null if it is fine.
 *
 * "Fine" means exactly what it means to the rest of this product, so the
 * product's own reader decides — not a re-implementation of its first two
 * lines, which is what stood here for a day and had already drifted: it did
 * not run the metainfo stage, and a rename edits that block by offset.
 */
const parseFailureOf = (candidate: string): EditRejection | null => {
  try {
    parseDBMLToJSON(candidate);

    return null;
  } catch (error) {
    return parseErrorOf(error);
  }
};

const fieldTextIn = (
  text: string,
  index: SourceIndex,
  tableName: string,
  at: number,
): string | null => {
  const table = findTable(index, tableName);
  if (table === null) return null;
  const field = table.fields[at];
  if (field === undefined) return null;

  return text.slice(field.range.start, field.range.end);
};

/** The current source text of one column, for the popup to open against. */
export const readFieldText = (
  text: string,
  tableName: string,
  at: number,
): string | null => {
  let index: SourceIndex;
  try {
    index = buildSourceIndex(text);
  } catch {
    return null;
  }

  return fieldTextIn(text, index, tableName, at);
};

/**
 * The full name a rename would produce, without writing anything.
 *
 * The same question `planRename` answers on its way to an edit, asked on its
 * own — because the diagram needs the answer before the write, not after it.
 * What the reader types is not always the whole name: a table declared in a
 * schema keeps that schema, so `analysis111` typed over `acl.analysis` becomes
 * `acl.analysis111`. Whether a dot is a schema separator or part of a quoted
 * name is a question only the parser can answer, which is why this lives here
 * and the diagram asks rather than guesses.
 *
 * Null when the rename could not go ahead at all — an unknown table, an empty
 * name, or one already taken. The caller then has no name to carry state to,
 * and the write it is about to attempt will be refused for the same reason.
 */
export const resolveRenamedTable = (
  text: string,
  tableName: string,
  newName: string,
): string | null => {
  let index: SourceIndex;
  try {
    index = buildSourceIndex(text);
  } catch {
    return null;
  }

  const planned = planRename(index, {
    kind: "renameTable",
    table: tableName,
    newName,
  });

  return planned.ok ? planned.newFullName : null;
};

/**
 * The one door an edit comes through.
 *
 * Nothing is written anywhere: the caller gets the ranges to apply and the
 * document those ranges would produce, already proved to parse. A candidate
 * that does not parse never reaches a file, which is also what refuses the
 * small cases for free — a table left with no columns, or a column something
 * else still references.
 */
export const planEdit = (
  text: string,
  operation: EditOperation,
  expectedText?: string,
): EditPlan => {
  let index: SourceIndex;
  try {
    index = buildSourceIndex(text);
  } catch (error) {
    return { ok: false, reason: parseErrorOf(error) };
  }

  if (expectedText !== undefined && operation.kind !== "renameTable") {
    // Asked of the index already in hand: `readFieldText` would build a
    // second one, and indexing is the expensive half of planning an edit.
    const current = fieldTextIn(text, index, operation.table, operation.at);
    if (current !== expectedText) {
      return { ok: false, reason: { code: "staleText" } };
    }
  }

  if (operation.kind === "renameTable") {
    const renamed = planRename(index, operation);
    if (!renamed.ok) return { ok: false, reason: renamed.reason };

    const renamedText = applyEdits(text, renamed.edits);
    const invalid = parseFailureOf(renamedText);
    if (invalid !== null) return { ok: false, reason: invalid };

    return {
      ok: true,
      edits: renamed.edits,
      nextText: renamedText,
      table: renamed.newFullName,
    };
  }

  const planned = planColumnEdit(text, index, operation);
  if (!planned.ok) return { ok: false, reason: planned.reason };

  const nextText = applyEdits(text, planned.edits);
  const invalid = parseFailureOf(nextText);
  if (invalid !== null) return { ok: false, reason: invalid };

  if (operation.kind === "deleteField") {
    return { ok: true, edits: planned.edits, nextText, table: operation.table };
  }

  // Where the column stands once the edit is in. Worked out rather than looked
  // up, because a name is no longer what identifies it — and these are the only
  // three ways an edit moves one.
  const at =
    operation.kind === "insertFieldAfter"
      ? operation.at + 1
      : operation.kind === "moveField"
        ? operation.at + (operation.direction === "up" ? -1 : 1)
        : operation.at;

  return {
    ok: true,
    edits: planned.edits,
    nextText,
    table: operation.table,
    at,
  };
};
