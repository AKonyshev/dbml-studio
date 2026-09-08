import { Parser } from "@dbml/core";

import { validateSchema } from "../../validators";

import { planColumnEdit } from "./columnOps";
import { planRename } from "./renameOp";
import { buildSourceIndex, findField, findTable } from "./sourceIndex";

import type { EditOperation, EditRejection } from "shared/types/diagramEdit";
import type { SourceIndex, TextEdit } from "./types";

export type EditPlan =
  | {
      ok: true;
      edits: TextEdit[];
      nextText: string;
      table: string;
      field?: string;
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
 * "Fine" means exactly what it means to the rest of this product: the soft
 * parse the diagram uses, plus this package's own validators. Building the full
 * model instead would reject documents the diagram renders every day — an index
 * naming a column that is not there is enough — and it would reject them
 * wherever the reader was editing, naming a table they had not touched.
 */
const parseFailureOf = (candidate: string): EditRejection | null => {
  try {
    validateSchema(Parser.parseDBMLToJSON(candidate));

    return null;
  } catch (error) {
    return parseErrorOf(error);
  }
};

/** The current source text of one column, for the popup to open against. */
export const readFieldText = (
  text: string,
  tableName: string,
  fieldName: string,
): string | null => {
  let index: SourceIndex;
  try {
    index = buildSourceIndex(text);
  } catch {
    return null;
  }

  const table = findTable(index, tableName);
  if (table === null) return null;
  const field = findField(table, fieldName);
  if (field === null) return null;

  return text.slice(field.range.start, field.range.end);
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
    const current = readFieldText(text, operation.table, operation.field);
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

  // The reader may have renamed the column in the same keystroke, so the
  // identity to focus afterwards is read out of the document we just proved
  // rather than carried over from the operation.
  const before = findTable(index, operation.table)?.fields ?? [];
  const previousNames = new Set(before.map((field) => field.name));
  const after = findTable(buildSourceIndex(nextText), operation.table)?.fields;
  const appeared = after?.find((field) => !previousNames.has(field.name));

  return {
    ok: true,
    edits: planned.edits,
    nextText,
    table: operation.table,
    field: appeared?.name ?? operation.field,
  };
};
