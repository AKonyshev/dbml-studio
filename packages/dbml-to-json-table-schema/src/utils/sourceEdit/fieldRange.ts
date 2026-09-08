import type { ParserToken, SourceRange } from "./types";

export interface ResolvedFieldRange extends SourceRange {
  indent: string;
  isMultiline: boolean;
}

const lineStartOffsets = (text: string): number[] => {
  const offsets = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") offsets.push(i + 1);
  }

  return offsets;
};

/**
 * The parser's field token is not the field's line, and the difference is not
 * uniform: the first field of a table starts at its identifier while later ones
 * start at the indentation, and every one of them swallows the trailing
 * newline. A token also ends at column 1 of the line *after* the field.
 *
 * So the token is used for one thing only — which lines the field occupies —
 * and the range is measured from the text itself. Writing into a raw token
 * range would delete a line break and merge two columns into one.
 */
export const resolveFieldRange = (
  text: string,
  token: ParserToken,
): ResolvedFieldRange => {
  const starts = lineStartOffsets(text);
  const firstLine = token.start.line - 1;
  const lastLine =
    token.end.column === 1 ? token.end.line - 2 : token.end.line - 1;

  const lineStart = starts[firstLine];
  const indentLength = text.slice(lineStart).search(/\S|$/);
  const start = lineStart + indentLength;

  const afterLast =
    lastLine + 1 < starts.length ? starts[lastLine + 1] : text.length;
  let end = afterLast;
  while (end > start && (text[end - 1] === "\n" || text[end - 1] === "\r")) {
    end -= 1;
  }

  return {
    start,
    end,
    indent: text.slice(lineStart, start),
    isMultiline: lastLine > firstLine,
  };
};
