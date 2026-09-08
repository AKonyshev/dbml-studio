import { Parser } from "@dbml/core";

import { getTableFullName } from "../computeNameWithSchemaName";
import { METAINFO_END, METAINFO_START } from "../metainfo";

import { lineStartOffsets, resolveFieldRange } from "./fieldRange";
import { locateTableName } from "./tableHeader";

import type {
  FieldLocation,
  NameOccurrence,
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
 * Every place inside a range where this table is named, and how it is written.
 *
 * A ref names a table only in front of a dot, so this cannot collide with a
 * column that happens to share the name. Both spellings have to be found: real
 * schemas quote (`"sch.users"."id"`) and hand-written ones do not
 * (`users.id`) — matching only the bare form left every ref in a quoted file
 * untouched, and a rename then broke the file.
 *
 * A table that is in a schema is named through it, `sch.users.id`, and the
 * bare pattern cannot find that: it refuses a name with a dot in front of it,
 * and it has to, because `sch.users` and `users` are two different tables and
 * only one of them is being renamed. So the schema is written into the pattern
 * and the range returned covers the name alone — what `planRename` puts back
 * there is the declared name, without the prefix it was found behind.
 *
 * That refusal is `isBehindASchema`, asked of the offset rather than written
 * into the pattern, because a schema is spelt as freely as a table is: the
 * lookbehind alone let `"sch"."users"` and `sch."users"` through, and
 * renaming the bare `users` then moved another schema's ref with it.
 */
const identifierRangesIn = (
  text: string,
  range: SourceRange,
  name: string,
  schemaName: string | null,
): NameOccurrence[] => {
  const found: NameOccurrence[] = [];
  const slice = text.slice(range.start, range.end);
  const escaped = escapeForPattern(name);
  const spelt = `(?:"${escaped}"|${escaped})`;
  const pattern =
    schemaName === null
      ? new RegExp(
          `(?:"${escaped}"|(?<![A-Za-z0-9_."])${escaped})(?=\\s*\\.)`,
          "g",
        )
      : new RegExp(
          `(?<![A-Za-z0-9_."])(?:"${escapeForPattern(schemaName)}"|${escapeForPattern(
            schemaName,
          )})\\s*\\.\\s*${spelt}(?=\\s*\\.)`,
          "g",
        );

  let match = pattern.exec(slice);
  while (match !== null) {
    // The name sits at the end of the match either way: the lookahead that
    // proves a dot follows takes up none of it. Measured back from the end
    // rather than read out of a capture group, which needs a flag this
    // project's target does not carry.
    const written = schemaName === null ? match[0] : nameTailOf(match[0], name);
    const at = match.index + match[0].length - written.length;

    if (schemaName === null && isBehindASchema(text, range.start + at)) {
      match = pattern.exec(slice);
      continue;
    }

    found.push({
      start: range.start + at,
      end: range.start + at + written.length,
      quoted: written.startsWith('"'),
    });
    match = pattern.exec(slice);
  }

  return found;
};

/**
 * Whether a name written at this offset is the tail of a qualified one.
 *
 * `"sch"."users"` and `sch . users` are the same table as `sch.users`, and
 * none of them is the bare `users` a rename may be looking for.
 */
const isBehindASchema = (text: string, at: number): boolean => {
  let back = at - 1;
  while (back >= 0 && /\s/.test(text[back])) back -= 1;

  return back >= 0 && text[back] === ".";
};

/** `sch."users"` -> `"users"`, `sch.users` -> `users`. */
const nameTailOf = (matched: string, name: string): string =>
  matched.endsWith(`"${name}"`) ? `"${name}"` : name;

const metaInfoNameRanges = (
  text: string,
  fullName: string,
): NameOccurrence[] => {
  const from = text.indexOf(METAINFO_START);
  const to = text.indexOf(METAINFO_END);
  if (from === -1 || to === -1) return [];

  // The range covers the name inside the JSON string, not the quotes around it.
  const found: NameOccurrence[] = [];

  for (const form of [`"name":"${fullName}"`, `"name": "${fullName}"`]) {
    let at = text.indexOf(form, from);
    while (at !== -1 && at < to) {
      const nameAt = at + form.indexOf(fullName);
      found.push({
        start: nameAt,
        end: nameAt + fullName.length,
        quoted: false,
      });
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
  const lineStarts = lineStartOffsets(text);
  const tables: TableLocation[] = [];

  for (const table of raw.tables) {
    const { header, start } = headerLineOf(text, table.token.start.offset);
    const parts = locateTableName(header, start);
    if (parts === null) continue;

    const fields: FieldLocation[] = table.fields.map((field) => {
      const resolved = resolveFieldRange(text, field.token, lineStarts);

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

    // An endpoint carries the schema it was written through, and it has to be
    // read: `users` and `sch.users` are two tables, and a ref that names the
    // second one answers to the first one's name on its own.
    const refNameRanges: NameOccurrence[] = [];
    for (const ref of nameIsSomeoneElsesAlias ? [] : raw.refs) {
      const usesDeclaredName = ref.endpoints.some(
        (endpoint) =>
          endpoint.tableName === parts.declaredName &&
          (endpoint.schemaName ?? null) === parts.schemaName,
      );
      if (!usesDeclaredName) continue;

      refNameRanges.push(
        ...identifierRangesIn(
          text,
          { start: ref.token.start.offset, end: ref.token.end.offset },
          parts.declaredName,
          parts.schemaName,
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
