import { planColumnEdit, type ColumnOperation } from "./columnOps";
import { buildSourceIndex } from "./sourceIndex";

import type { TextEdit } from "./types";

const src = [
  "Table users {",
  "  id integer [pk]",
  "  email varchar",
  "  name varchar",
  "}",
  "",
].join("\n");

const apply = (text: string, edits: TextEdit[]): string => {
  let out = text;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }

  return out;
};

const run = (operation: ColumnOperation): string => {
  const result = planColumnEdit(src, buildSourceIndex(src), operation);
  if (!result.ok) throw new Error(`rejected: ${result.reason.code}`);

  return apply(src, result.edits);
};

describe("planColumnEdit", () => {
  it("replaces one column and leaves its neighbours alone", () => {
    expect(
      run({
        kind: "replaceField",
        table: "users",
        at: 1,
        text: "email varchar [unique]",
      }),
    ).toBe(
      [
        "Table users {",
        "  id integer [pk]",
        "  email varchar [unique]",
        "  name varchar",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("inserts a column below, at the table's indentation", () => {
    expect(
      run({
        kind: "insertFieldAfter",
        table: "users",
        at: 0,
        text: "created_at timestamp",
      }),
    ).toBe(
      [
        "Table users {",
        "  id integer [pk]",
        "  created_at timestamp",
        "  email varchar",
        "  name varchar",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("deletes a column with its line", () => {
    expect(run({ kind: "deleteField", table: "users", at: 1 })).toBe(
      ["Table users {", "  id integer [pk]", "  name varchar", "}", ""].join(
        "\n",
      ),
    );
  });

  it("moves a column up", () => {
    expect(
      run({
        kind: "moveField",
        table: "users",
        at: 1,
        direction: "up",
      }),
    ).toBe(
      [
        "Table users {",
        "  email varchar",
        "  id integer [pk]",
        "  name varchar",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("keeps an inline ref intact when the column is replaced", () => {
    const withRef = [
      "Table users {",
      "  id integer [pk]",
      "}",
      "",
      "Table posts {",
      "  author integer [ref: > users.id]",
      "}",
      "",
    ].join("\n");
    const result = planColumnEdit(withRef, buildSourceIndex(withRef), {
      kind: "replaceField",
      table: "posts",
      at: 0,
      text: "author integer [not null, ref: > users.id]",
    });
    if (!result.ok) throw new Error(result.reason.code);

    expect(apply(withRef, result.edits)).toContain(
      "  author integer [not null, ref: > users.id]",
    );
  });

  it("refuses to move the first column up", () => {
    expect(
      planColumnEdit(src, buildSourceIndex(src), {
        kind: "moveField",
        table: "users",
        at: 0,
        direction: "up",
      }),
    ).toEqual({ ok: false, reason: { code: "atBoundary" } });
  });

  it("refuses empty replacement text", () => {
    expect(
      planColumnEdit(src, buildSourceIndex(src), {
        kind: "replaceField",
        table: "users",
        at: 1,
        text: "   ",
      }),
    ).toEqual({ ok: false, reason: { code: "emptyText" } });
  });

  it("refuses an unknown table", () => {
    expect(
      planColumnEdit(src, buildSourceIndex(src), {
        kind: "deleteField",
        table: "ghosts",
        at: 0,
      }),
    ).toEqual({ ok: false, reason: { code: "tableNotFound" } });
  });

  it("refuses a position the table has no column at", () => {
    expect(
      planColumnEdit(src, buildSourceIndex(src), {
        kind: "deleteField",
        table: "users",
        at: 9,
      }),
    ).toEqual({ ok: false, reason: { code: "fieldNotFound" } });
  });
});

describe("planColumnEdit where a name cannot tell two columns apart", () => {
  const twice = [
    "Table users {",
    "  id integer [pk]",
    "  note varchar",
    "  note text",
    "}",
    "",
  ].join("\n");

  it("edits the second of two columns of one name, not the first", () => {
    const result = planColumnEdit(twice, buildSourceIndex(twice), {
      kind: "replaceField",
      table: "users",
      at: 2,
      text: "note text [note: 'the second one']",
    });
    if (!result.ok) throw new Error(result.reason.code);

    expect(apply(twice, result.edits)).toBe(
      [
        "Table users {",
        "  id integer [pk]",
        "  note varchar",
        "  note text [note: 'the second one']",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("deletes the first of them, and leaves the second where it is", () => {
    const result = planColumnEdit(twice, buildSourceIndex(twice), {
      kind: "deleteField",
      table: "users",
      at: 1,
    });
    if (!result.ok) throw new Error(result.reason.code);

    expect(apply(twice, result.edits)).toBe(
      ["Table users {", "  id integer [pk]", "  note text", "}", ""].join("\n"),
    );
  });
});

describe("planColumnEdit on a file written with CRLF", () => {
  const windows = [
    "Table users {",
    "  id integer [pk]",
    "  email varchar",
    "  name varchar",
    "}",
    "",
  ].join("\r\n");

  const runOn = (operation: ColumnOperation): string => {
    const result = planColumnEdit(
      windows,
      buildSourceIndex(windows),
      operation,
    );
    if (!result.ok) throw new Error(`rejected: ${result.reason.code}`);

    return apply(windows, result.edits);
  };

  it("takes both halves of the line break away with a deleted column", () => {
    expect(runOn({ kind: "deleteField", table: "users", at: 1 })).toBe(
      ["Table users {", "  id integer [pk]", "  name varchar", "}", ""].join(
        "\r\n",
      ),
    );
  });

  it("writes an inserted column with the ending the file already uses", () => {
    expect(
      runOn({
        kind: "insertFieldAfter",
        table: "users",
        at: 0,
        text: "created_at timestamp",
      }),
    ).toBe(
      [
        "Table users {",
        "  id integer [pk]",
        "  created_at timestamp",
        "  email varchar",
        "  name varchar",
        "}",
        "",
      ].join("\r\n"),
    );
  });
});
