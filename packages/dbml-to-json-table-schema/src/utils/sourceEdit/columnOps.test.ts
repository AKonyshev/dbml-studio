import { planColumnEdit } from "./columnOps";
import { buildSourceIndex } from "./sourceIndex";

import type { EditOperation } from "shared/types/diagramEdit";
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

const run = (operation: EditOperation): string => {
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
        field: "email",
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
        field: "id",
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
    expect(run({ kind: "deleteField", table: "users", field: "email" })).toBe(
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
        field: "email",
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
      field: "author",
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
        field: "id",
        direction: "up",
      }),
    ).toEqual({ ok: false, reason: { code: "atBoundary" } });
  });

  it("refuses empty replacement text", () => {
    expect(
      planColumnEdit(src, buildSourceIndex(src), {
        kind: "replaceField",
        table: "users",
        field: "email",
        text: "   ",
      }),
    ).toEqual({ ok: false, reason: { code: "emptyText" } });
  });

  it("refuses an unknown table", () => {
    expect(
      planColumnEdit(src, buildSourceIndex(src), {
        kind: "deleteField",
        table: "ghosts",
        field: "id",
      }),
    ).toEqual({ ok: false, reason: { code: "tableNotFound" } });
  });

  it("refuses an unknown column", () => {
    expect(
      planColumnEdit(src, buildSourceIndex(src), {
        kind: "deleteField",
        table: "users",
        field: "nope",
      }),
    ).toEqual({ ok: false, reason: { code: "fieldNotFound" } });
  });
});
