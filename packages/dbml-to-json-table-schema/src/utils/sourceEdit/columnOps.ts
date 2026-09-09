import { findTable } from "./sourceIndex";

import type { EditOperation, EditRejection } from "shared/types/diagramEdit";
import type { SourceIndex, TextEdit } from "./types";

/** Every operation except the rename, which is not local to one column. */
export type ColumnOperation = Exclude<EditOperation, { kind: "renameTable" }>;

export type ColumnEditResult =
  | { ok: true; edits: TextEdit[] }
  | { ok: false; reason: EditRejection };

const reject = (reason: EditRejection): ColumnEditResult => ({
  ok: false,
  reason,
});

/**
 * The line break this document is written with.
 *
 * A file saved on Windows ends its lines `\r\n` and both halves move
 * together: taking only the `\n` away leaves the `\r` standing as the blank
 * line the delete was meant to avoid, and writing a bare `\n` into such a file
 * mixes two endings into it.
 */
const lineBreakOf = (text: string): string =>
  text.includes("\r\n") ? "\r\n" : "\n";

/**
 * A column operation as the characters it changes and nothing more.
 *
 * Every range here comes from the index, which measured it from the text rather
 * than from a parser token, so no edit ever contains a line break. What the
 * reader did not aim at — their comments, their spacing, an inline `ref:` in
 * the part of the line they left alone — is not in any range and therefore
 * cannot be lost.
 */
export const planColumnEdit = (
  text: string,
  index: SourceIndex,
  operation: ColumnOperation,
): ColumnEditResult => {
  const table = findTable(index, operation.table);
  if (table === null) return reject({ code: "tableNotFound" });

  const position = operation.at;
  const field = table.fields[position];
  if (field === undefined) return reject({ code: "fieldNotFound" });

  if (operation.kind === "replaceField") {
    if (operation.text.trim() === "") return reject({ code: "emptyText" });

    return {
      ok: true,
      edits: [
        {
          start: field.range.start,
          end: field.range.end,
          text: operation.text,
        },
      ],
    };
  }

  if (operation.kind === "insertFieldAfter") {
    if (operation.text.trim() === "") return reject({ code: "emptyText" });

    return {
      ok: true,
      edits: [
        {
          start: field.range.end,
          end: field.range.end,
          text: `${lineBreakOf(text)}${field.indent}${operation.text}`,
        },
      ],
    };
  }

  if (operation.kind === "deleteField") {
    // The indentation and the newline go with it, or a blank line is left
    // where the column was.
    const start = field.range.start - field.indent.length;
    const after = text.startsWith("\r\n", field.range.end)
      ? 2
      : text[field.range.end] === "\n"
        ? 1
        : 0;
    const end = field.range.end + after;

    return { ok: true, edits: [{ start, end, text: "" }] };
  }

  const neighbourAt =
    operation.direction === "up" ? position - 1 : position + 1;
  if (neighbourAt < 0 || neighbourAt >= table.fields.length) {
    return reject({ code: "atBoundary" });
  }
  const neighbour = table.fields[neighbourAt];

  return {
    ok: true,
    edits: [
      {
        start: field.range.start,
        end: field.range.end,
        text: text.slice(neighbour.range.start, neighbour.range.end),
      },
      {
        start: neighbour.range.start,
        end: neighbour.range.end,
        text: text.slice(field.range.start, field.range.end),
      },
    ],
  };
};
