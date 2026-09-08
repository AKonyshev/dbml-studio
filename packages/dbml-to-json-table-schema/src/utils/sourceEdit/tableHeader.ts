import type { SourceRange } from "./types";

export interface TableHeaderParts {
  nameRange: SourceRange;
  declaredName: string;
  schemaName: string | null;
  alias: string | null;
}

interface Word {
  start: number;
  end: number;
  value: string;
}

const readWord = (text: string, from: number): Word | null => {
  let i = from;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  if (i >= text.length) return null;

  if (text[i] === '"') {
    const close = text.indexOf('"', i + 1);
    if (close === -1) return null;

    return { start: i, end: close + 1, value: text.slice(i + 1, close) };
  }

  const start = i;
  while (i < text.length && /[A-Za-z0-9_]/.test(text[i])) i += 1;
  if (i === start) return null;

  return { start, end: i, value: text.slice(start, i) };
};

/**
 * The parser gives a table one token and it covers the whole block, so there is
 * nothing pointing at the name itself. The header line is read here instead,
 * and it has to tell three identifiers apart that all look alike: the schema
 * before the dot, the name, and the alias after `as`.
 *
 * Renaming the wrong one either moves the table into another schema or breaks
 * every ref that goes through the alias, and neither failure is visible until
 * the file stops parsing.
 */
export const locateTableName = (
  headerText: string,
  headerStart: number,
): TableHeaderParts | null => {
  const keyword = readWord(headerText, 0);
  if (keyword === null || keyword.value.toLowerCase() !== "table") return null;

  const first = readWord(headerText, keyword.end);
  if (first === null) return null;

  let schemaName: string | null = null;
  let name = first;

  if (headerText[first.end] === ".") {
    const second = readWord(headerText, first.end + 1);
    if (second === null) return null;
    schemaName = first.value;
    name = second;
  }

  let alias: string | null = null;
  const maybeAs = readWord(headerText, name.end);
  if (maybeAs !== null && maybeAs.value.toLowerCase() === "as") {
    alias = readWord(headerText, maybeAs.end)?.value ?? null;
  }

  return {
    nameRange: { start: headerStart + name.start, end: headerStart + name.end },
    declaredName: name.value,
    schemaName,
    alias,
  };
};
