import { resolveRenamedTable } from "./planEdit";
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

  // A schema declared as a schema, not as a dot inside one quoted name. The
  // refs then write the table qualified, `sch.analysis.id`, and only the part
  // after the prefix is the name being renamed. Left unfound, the ref went on
  // naming a table that no longer existed and the whole rename was refused as
  // a parse error against a file the reader had not touched.
  const qualified = [
    "Table sch.analysis {",
    "  id uuid [pk]",
    "}",
    "",
    "Table sch.analysis_water {",
    "  id uuid [pk]",
    "  analysis_id uuid",
    "}",
    "",
    "Ref: sch.analysis_water.analysis_id > sch.analysis.id",
    "",
  ].join("\n");

  it("follows a standalone ref written with the schema prefix", () => {
    const result = planRename(buildSourceIndex(qualified), {
      kind: "renameTable",
      table: "sch.analysis",
      newName: "analysis111",
    });
    if (!result.ok) throw new Error(result.reason.code);

    const next = apply(qualified, result.edits);
    expect(next).toContain("Table sch.analysis111 {");
    expect(next).toContain(
      "Ref: sch.analysis_water.analysis_id > sch.analysis111.id",
    );
    // The table beside it is named out of the same characters and must not be
    // caught by a pattern that stops at the prefix.
    expect(next).toContain("Table sch.analysis_water {");
  });

  it("follows an inline ref written with the schema prefix", () => {
    const inline = [
      "Table sch.analysis {",
      "  id uuid [pk]",
      "}",
      "",
      "Table sch.analysis_water {",
      "  id uuid [pk]",
      "  analysis_id uuid [ref: > sch.analysis.id]",
      "}",
      "",
    ].join("\n");

    const result = planRename(buildSourceIndex(inline), {
      kind: "renameTable",
      table: "sch.analysis",
      newName: "analysis111",
    });
    if (!result.ok) throw new Error(result.reason.code);

    const next = apply(inline, result.edits);
    expect(next).toContain("Table sch.analysis111 {");
    expect(next).toContain("analysis_id uuid [ref: > sch.analysis111.id]");
  });

  it("leaves the same name in another schema alone", () => {
    const twoSchemas = [
      "Table sch.analysis {",
      "  id uuid [pk]",
      "}",
      "",
      "Table analysis {",
      "  id uuid [pk]",
      "}",
      "",
      "Table readings {",
      "  id uuid [pk]",
      "  qualified_id uuid",
      "  plain_id uuid",
      "}",
      "",
      "Ref: readings.qualified_id > sch.analysis.id",
      "Ref: readings.plain_id > analysis.id",
      "",
    ].join("\n");

    const result = planRename(buildSourceIndex(twoSchemas), {
      kind: "renameTable",
      table: "sch.analysis",
      newName: "analysis111",
    });
    if (!result.ok) throw new Error(result.reason.code);

    const next = apply(twoSchemas, result.edits);
    expect(next).toContain("Ref: readings.qualified_id > sch.analysis111.id");
    expect(next).toContain("Ref: readings.plain_id > analysis.id");
    expect(next).toContain("Table analysis {");
  });

  it("leaves a quoted ref that goes through another schema alone", () => {
    const quotedRefs = [
      "Table users {",
      "  id integer [pk]",
      "}",
      "",
      "Table sch.users {",
      "  user_id integer [pk]",
      "}",
      "",
      'Ref: "sch"."users"."user_id" > "users"."id"',
      "",
    ].join("\n");

    const result = planRename(buildSourceIndex(quotedRefs), {
      kind: "renameTable",
      table: "users",
      newName: "people",
    });
    if (!result.ok) throw new Error(result.reason.code);

    const next = apply(quotedRefs, result.edits);
    expect(next).toContain("Table people {");
    expect(next).toContain('Ref: "sch"."users"."user_id" > "people"."id"');
  });

  it("leaves a half-quoted ref that goes through another schema alone", () => {
    const halfQuoted = [
      "Table users {",
      "  id integer [pk]",
      "}",
      "",
      "Table sch.users {",
      "  user_id integer [pk]",
      "}",
      "",
      'Ref: sch."users"."user_id" > users.id',
      "",
    ].join("\n");

    const result = planRename(buildSourceIndex(halfQuoted), {
      kind: "renameTable",
      table: "users",
      newName: "people",
    });
    if (!result.ok) throw new Error(result.reason.code);

    const next = apply(halfQuoted, result.edits);
    expect(next).toContain("Table people {");
    expect(next).toContain('Ref: sch."users"."user_id" > people.id');
  });

  it("does not move another schema's ref onto the name being taken", () => {
    const collide = [
      "Table users {",
      "  id integer [pk]",
      "}",
      "",
      "Table people {",
      "  id integer [pk]",
      "}",
      "",
      "Table sch.users {",
      "  user_id integer [pk]",
      "}",
      "",
      "Table sch.people {",
      "  user_id integer [pk]",
      "}",
      "",
      'Ref: "sch"."users"."user_id" > "users"."id"',
      "",
    ].join("\n");

    const result = planRename(buildSourceIndex(collide), {
      kind: "renameTable",
      table: "users",
      newName: "people2",
    });
    if (!result.ok) throw new Error(result.reason.code);

    const next = apply(collide, result.edits);
    expect(next).toContain('Ref: "sch"."users"."user_id" > "people2"."id"');
  });

  it("keeps a quoted name inside a qualified ref quoted", () => {
    const quotedName = [
      'Table sch."analysis one" {',
      "  id uuid [pk]",
      "}",
      "",
      "Table readings {",
      "  id uuid [pk]",
      "  analysis_id uuid",
      "}",
      "",
      'Ref: readings.analysis_id > sch."analysis one".id',
      "",
    ].join("\n");

    const result = planRename(buildSourceIndex(quotedName), {
      kind: "renameTable",
      table: "sch.analysis one",
      newName: "analysis two",
    });
    if (!result.ok) throw new Error(result.reason.code);

    const next = apply(quotedName, result.edits);
    expect(next).toContain('Table sch."analysis two" {');
    expect(next).toContain('Ref: readings.analysis_id > sch."analysis two".id');
  });

  it("follows a quoted ref through the schema of the table being renamed", () => {
    const quotedRefs = [
      "Table users {",
      "  id integer [pk]",
      "}",
      "",
      "Table sch.users {",
      "  user_id integer [pk]",
      "}",
      "",
      'Ref: "sch"."users"."user_id" > "users"."id"',
      "",
    ].join("\n");

    const result = planRename(buildSourceIndex(quotedRefs), {
      kind: "renameTable",
      table: "sch.users",
      newName: "people",
    });
    if (!result.ok) throw new Error(result.reason.code);

    const next = apply(quotedRefs, result.edits);
    expect(next).toContain("Table sch.people {");
    expect(next).toContain('Ref: "sch"."people"."user_id" > "users"."id"');
  });

  it("follows a layout entry whose name the block had to escape", () => {
    const escaped = [
      'Table "a\\b" {',
      "  id integer [pk]",
      "}",
      "",
      "/*MetaInfo",
      '[{"name":"a\\\\b","x":10,"y":20}]',
      "MetaInfo*/",
      "",
    ].join("\n");

    const result = planRename(buildSourceIndex(escaped), {
      kind: "renameTable",
      table: "a\\b",
      newName: "accounts",
    });
    if (!result.ok) throw new Error(result.reason.code);

    const next = apply(escaped, result.edits);
    // A name that stood in quotes stays in them, whatever it is now called.
    expect(next).toContain('Table "accounts" {');
    expect(next).toContain('[{"name":"accounts","x":10,"y":20}]');
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

describe("resolveRenamedTable", () => {
  const schemaSrc = [
    "Table analytics.users {",
    "  id integer [pk]",
    "}",
    "",
  ].join("\n");

  it("answers with the schema kept, which the typed name does not carry", () => {
    expect(resolveRenamedTable(schemaSrc, "analytics.users", "accounts")).toBe(
      "analytics.accounts",
    );
  });

  it("does not double the prefix the reader left in place", () => {
    expect(
      resolveRenamedTable(schemaSrc, "analytics.users", "analytics.accounts"),
    ).toBe("analytics.accounts");
  });

  it("leaves a dot inside a quoted name where it is", () => {
    const quoted = ['Table "sch.users" {', "  id integer [pk]", "}", ""].join(
      "\n",
    );

    expect(resolveRenamedTable(quoted, "sch.users", "sch.accounts")).toBe(
      "sch.accounts",
    );
  });

  it("answers null when the rename could not go ahead", () => {
    expect(resolveRenamedTable(src, "users", "posts")).toBeNull();
    expect(resolveRenamedTable(src, "ghosts", "spirits")).toBeNull();
    expect(resolveRenamedTable(src, "users", "  ")).toBeNull();
  });
});
