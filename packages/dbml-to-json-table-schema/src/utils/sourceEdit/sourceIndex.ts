import { Parser } from "@dbml/core";

import { getTableFullName } from "../computeNameWithSchemaName";
import { METAINFO_END, METAINFO_START } from "../metainfo";

import { resolveFieldRange } from "./fieldRange";
import { locateTableName } from "./tableHeader";

import type {
  FieldLocation,
  SourceIndex,
  SourceRange,
  TableLocation,
} from "./types";

const headerLineOf = (
  text: string,
  tableStartOffset: number,
): { header: string; start: number } => {
  const lineEnd = text.indexOf("\n", tableStartOffset);
  const end = lineEnd === -1 ? text.length : lineEnd;

  return { header: text.slice(tableStartOffset, end), start: tableStartOffset };
};

const escapeForPattern = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Every `<name>` inside a range that is a whole identifier followed by a dot.
 *
 * A ref names a table only in front of a dot, so this cannot collide with a
 * column that happens to share the name, and the guard in front keeps it from
 * matching the tail of a longer identifier or a schema-qualified spelling.
 */
const identifierRangesIn = (
  text: string,
  range: SourceRange,
  name: string,
): SourceRange[] => {
  const found: SourceRange[] = [];
  const slice = text.slice(range.start, range.end);
  const pattern = new RegExp(
    `(?<![A-Za-z0-9_."])${escapeForPattern(name)}(?=\\s*\\.)`,
    "g",
  );

  let match = pattern.exec(slice);
  while (match !== null) {
    found.push({
      start: range.start + match.index,
      end: range.start + match.index + name.length,
    });
    match = pattern.exec(slice);
  }

  return found;
};

const metaInfoNameRanges = (text: string, fullName: string): SourceRange[] => {
  const from = text.indexOf(METAINFO_START);
  const to = text.indexOf(METAINFO_END);
  if (from === -1 || to === -1) return [];

  const found: SourceRange[] = [];

  for (const form of [`"name":"${fullName}"`, `"name": "${fullName}"`]) {
    let at = text.indexOf(form, from);
    while (at !== -1 && at < to) {
      const nameAt = at + form.indexOf(fullName);
      found.push({ start: nameAt, end: nameAt + fullName.length });
      at = text.indexOf(form, at + form.length);
    }
  }

  return found;
};

/**
 * Where everything in a DBML document is written, by character offset.
 *
 * Built from `parseDBMLToJSON`, which is deliberately the same door the diagram
 * comes through, and *not* from `Parser.parse`. The difference is not academic:
 * `Parser.parse` goes on to build the model, and the model enforces things the
 * diagram never does — that an index names columns that exist, that every ref
 * resolves. A real schema with one such flaw anywhere in the file renders
 * perfectly and used to make editing impossible everywhere in it, reporting a
 * table the reader had never touched.
 *
 * The parser supplies tokens for tables, fields and refs but nothing for a
 * table's name, and its field tokens are not the field's line, so both of those
 * are worked out here rather than trusted.
 */
export const buildSourceIndex = (text: string): SourceIndex => {
  const raw = Parser.parseDBMLToJSON(text);
  const tables: TableLocation[] = [];

  for (const table of raw.tables) {
    const { header, start } = headerLineOf(text, table.token.start.offset);
    const parts = locateTableName(header, start);
    if (parts === null) continue;

    const fields: FieldLocation[] = table.fields.map((field) => {
      const resolved = resolveFieldRange(text, field.token);

      return {
        name: field.name,
        range: { start: resolved.start, end: resolved.end },
        indent: resolved.indent,
        isMultiline: resolved.isMultiline,
      };
    });

    // A ref names a table by whichever spelling it was written with, so an
    // endpoint saying `users` may be another table's *alias* rather than this
    // table's name. Rewriting those would break a file that still parses,
    // which is the one kind of damage the parse gate cannot catch — so when the
    // name is ambiguous, no ref is touched at all.
    const nameIsSomeoneElsesAlias = raw.tables.some(
      (other) => other !== table && other.alias === parts.declaredName,
    );

    const refNameRanges: SourceRange[] = [];
    for (const ref of nameIsSomeoneElsesAlias ? [] : raw.refs) {
      const usesDeclaredName = ref.endpoints.some(
        (endpoint) => endpoint.tableName === parts.declaredName,
      );
      if (!usesDeclaredName) continue;

      refNameRanges.push(
        ...identifierRangesIn(
          text,
          { start: ref.token.start.offset, end: ref.token.end.offset },
          parts.declaredName,
        ),
      );
    }

    const fullName = getTableFullName(table);

    tables.push({
      fullName,
      declaredName: parts.declaredName,
      schemaName: parts.schemaName,
      alias: parts.alias,
      nameRange: parts.nameRange,
      fields,
      refNameRanges,
      metaInfoNameRanges: metaInfoNameRanges(text, fullName),
    });
  }

  return { tables };
};

export const findTable = (
  index: SourceIndex,
  fullName: string,
): TableLocation | null =>
  index.tables.find((table) => table.fullName === fullName) ?? null;

export const findField = (
  table: TableLocation,
  fieldName: string,
): FieldLocation | null =>
  table.fields.find((field) => field.name === fieldName) ?? null;
