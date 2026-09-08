import { Parser } from "@dbml/core";

import { resolveFieldRange } from "./fieldRange";

import type { ParserToken } from "./types";

interface ParsedField {
  name: string;
  token: ParserToken;
}

const parseFields = (src: string): ParsedField[] =>
  (
    Parser.parse(src, "dbml") as unknown as {
      schemas: Array<{ tables: Array<{ fields: ParsedField[] }> }>;
    }
  ).schemas[0].tables[0].fields;

describe("resolveFieldRange", () => {
  const src = [
    "Table users {",
    "  id integer [pk] // trailing comment",
    "  email varchar [unique]",
    "}",
    "",
  ].join("\n");

  it("excludes the indentation and the newline for the first field", () => {
    const [id] = parseFields(src);
    const range = resolveFieldRange(src, id.token);

    expect(src.slice(range.start, range.end)).toBe(
      "id integer [pk] // trailing comment",
    );
    expect(range.indent).toBe("  ");
    expect(range.isMultiline).toBe(false);
  });

  it("gives a later field the same shape as the first", () => {
    const [, email] = parseFields(src);
    const range = resolveFieldRange(src, email.token);

    expect(src.slice(range.start, range.end)).toBe("email varchar [unique]");
    expect(range.indent).toBe("  ");
  });

  it("spans every line of a multi-line field", () => {
    const multi = [
      "Table users {",
      "  bio text [note: '''one",
      "two''']",
      "}",
      "",
    ].join("\n");
    const [bio] = parseFields(multi);
    const range = resolveFieldRange(multi, bio.token);

    expect(multi.slice(range.start, range.end)).toBe(
      "bio text [note: '''one\ntwo''']",
    );
    expect(range.isMultiline).toBe(true);
  });
});
