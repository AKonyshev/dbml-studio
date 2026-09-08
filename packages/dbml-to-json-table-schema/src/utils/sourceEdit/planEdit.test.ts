import { planEdit, readFieldText } from "./planEdit";

const src = [
  "Table users {",
  "  id integer [pk]",
  "  email varchar",
  "}",
  "",
].join("\n");

describe("planEdit", () => {
  it("returns the whole next document for a good edit", () => {
    const plan = planEdit(src, {
      kind: "replaceField",
      table: "users",
      field: "email",
      text: "email varchar [unique]",
    });
    if (!plan.ok) throw new Error(plan.reason.code);

    expect(plan.nextText).toContain("email varchar [unique]");
    expect(plan.table).toBe("users");
    expect(plan.field).toBe("email");
  });

  it("reports the new identity after a column is renamed", () => {
    const plan = planEdit(src, {
      kind: "replaceField",
      table: "users",
      field: "email",
      text: "contact varchar",
    });
    if (!plan.ok) throw new Error(plan.reason.code);

    expect(plan.field).toBe("contact");
  });

  it("reports the new identity after a table is renamed", () => {
    const plan = planEdit(src, {
      kind: "renameTable",
      table: "users",
      newName: "accounts",
    });
    if (!plan.ok) throw new Error(plan.reason.code);

    expect(plan.table).toBe("accounts");
    expect(plan.nextText).toContain("Table accounts {");
  });

  it("refuses text that does not parse, and says why", () => {
    const plan = planEdit(src, {
      kind: "replaceField",
      table: "users",
      field: "email",
      text: "email varchar [[[",
    });

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason.code).toBe("parseError");
  });

  it("refuses to delete a column a ref depends on", () => {
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
    const plan = planEdit(withRef, {
      kind: "deleteField",
      table: "users",
      field: "id",
    });

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason.code).toBe("parseError");
  });

  it("refuses when the document moved under the editor", () => {
    expect(
      planEdit(
        src,
        {
          kind: "replaceField",
          table: "users",
          field: "email",
          text: "email text",
        },
        "email varchar [unique]",
      ),
    ).toEqual({ ok: false, reason: { code: "staleText" } });
  });

  it("accepts the edit when the expected text still matches", () => {
    const plan = planEdit(
      src,
      {
        kind: "replaceField",
        table: "users",
        field: "email",
        text: "email text",
      },
      "email varchar",
    );

    expect(plan.ok).toBe(true);
  });

  it("reads a column's current text", () => {
    expect(readFieldText(src, "users", "email")).toBe("email varchar");
    expect(readFieldText(src, "users", "nope")).toBeNull();
    expect(readFieldText(src, "ghosts", "id")).toBeNull();
  });
});

describe("renaming a schema-qualified table", () => {
  const schemaSrc = [
    "Table analytics.users {",
    "  id integer [pk]",
    "}",
    "",
  ].join("\n");

  // The diagram shows `analytics.users` and the file declares `users`; sending
  // the qualified string as the new name wrote the schema in twice and the
  // file stopped parsing. The caller has to send the declared name.
  it("takes the declared name and keeps the schema where it is", () => {
    const plan = planEdit(schemaSrc, {
      kind: "renameTable",
      table: "analytics.users",
      newName: "accounts",
    });
    if (!plan.ok) throw new Error(plan.reason.code);

    expect(plan.nextText).toContain("Table analytics.accounts {");
    expect(plan.table).toBe("analytics.accounts");
  });
});

describe("a schema the diagram renders but the model rejects", () => {
  // Reported from a real file: one table carried an index naming a column that
  // is not declared. The diagram draws such a schema without complaint, but
  // building the DBML model throws — and the editing core used to build it, so
  // every column in the file became uneditable and the reader was shown an
  // error about a table they had never touched.
  const withBadIndex = [
    "Table analysis_water {",
    "  analysis_id uuid [pk]",
    "  ph numeric",
    "}",
    "",
    "Table average_reservoir_property {",
    "  id uuid [pk]",
    "",
    "  Indexes {",
    "    dt",
    "  }",
    "}",
    "",
  ].join("\n");

  it("still reads a column's text", () => {
    expect(readFieldText(withBadIndex, "analysis_water", "ph")).toBe(
      "ph numeric",
    );
  });

  it("still applies an edit to a column in another table", () => {
    const plan = planEdit(withBadIndex, {
      kind: "replaceField",
      table: "analysis_water",
      field: "ph",
      text: "ph1 numeric",
    });
    if (!plan.ok) throw new Error(`${plan.reason.code}`);

    expect(plan.nextText).toContain("  ph1 numeric");
    expect(plan.field).toBe("ph1");
  });
});
