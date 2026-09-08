import { planRename } from "./renameOp";
import { buildSourceIndex } from "./sourceIndex";

import type { TextEdit } from "./types";

const apply = (text: string, edits: TextEdit[]): string => {
  let out = text;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }

  return out;
};

const src = [
  "Table users as u {",
  "  id integer [pk]",
  "}",
  "",
  "Table posts {",
  "  author integer",
  "}",
  "",
  "Ref: posts.author > users.id",
  "",
  "/*MetaInfo",
  '[{"name":"users","x":10,"y":20}]',
  "MetaInfo*/",
  "",
].join("\n");

describe("planRename", () => {
  it("renames the header, the ref and the metainfo entry, and nothing else", () => {
    const result = planRename(buildSourceIndex(src), {
      kind: "renameTable",
      table: "users",
      newName: "accounts",
    });
    if (!result.ok) throw new Error(result.reason.code);

    expect(apply(src, result.edits)).toBe(
      [
        "Table accounts as u {",
        "  id integer [pk]",
        "}",
        "",
        "Table posts {",
        "  author integer",
        "}",
        "",
        "Ref: posts.author > accounts.id",
        "",
        "/*MetaInfo",
        '[{"name":"accounts","x":10,"y":20}]',
        "MetaInfo*/",
        "",
      ].join("\n"),
    );
    expect(result.newFullName).toBe("accounts");
  });

  it("leaves a ref that goes through the alias alone", () => {
    const aliased = [
      "Table users as u {",
      "  id integer [pk]",
      "}",
      "",
      "Table posts {",
      "  author integer [ref: > u.id]",
      "}",
      "",
    ].join("\n");
    const result = planRename(buildSourceIndex(aliased), {
      kind: "renameTable",
      table: "users",
      newName: "accounts",
    });
    if (!result.ok) throw new Error(result.reason.code);

    expect(apply(aliased, result.edits)).toContain(
      "  author integer [ref: > u.id]",
    );
    expect(apply(aliased, result.edits)).toContain("Table accounts as u {");
  });

  it("keeps the schema prefix in the new full name", () => {
    const schemaSrc = [
      "Table analytics.users {",
      "  id integer [pk]",
      "}",
      "",
    ].join("\n");
    const result = planRename(buildSourceIndex(schemaSrc), {
      kind: "renameTable",
      table: "analytics.users",
      newName: "accounts",
    });
    if (!result.ok) throw new Error(result.reason.code);

    expect(result.newFullName).toBe("analytics.accounts");
    expect(apply(schemaSrc, result.edits)).toContain(
      "Table analytics.accounts {",
    );
  });

  it("refuses a name another table already uses", () => {
    expect(
      planRename(buildSourceIndex(src), {
        kind: "renameTable",
        table: "users",
        newName: "posts",
      }),
    ).toEqual({ ok: false, reason: { code: "nameTaken", name: "posts" } });
  });

  it("refuses an empty name", () => {
    expect(
      planRename(buildSourceIndex(src), {
        kind: "renameTable",
        table: "users",
        newName: "  ",
      }),
    ).toEqual({ ok: false, reason: { code: "emptyText" } });
  });

  it("refuses an unknown table", () => {
    expect(
      planRename(buildSourceIndex(src), {
        kind: "renameTable",
        table: "ghosts",
        newName: "spirits",
      }),
    ).toEqual({ ok: false, reason: { code: "tableNotFound" } });
  });
});
