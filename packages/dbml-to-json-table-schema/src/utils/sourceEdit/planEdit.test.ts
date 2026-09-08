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
