import { parseDbmlToModel } from "../parseDbmlToModel";
import { DbmlParseError } from "../errors";

const DBML = `
Enum "s.color" {
  "red"
  "green"
}
Table "s.t" {
  "id" uuid [pk, not null]
  "name" varchar(150) [not null]
  "color" "s.color"
  Indexes {
    (name) [unique, name: "u1"]
  }
}
Table "s.u" {
  "t_id" uuid
}
Ref "r": "s.t"."id" < "s.u"."t_id" [delete: set null]
`;

describe("parseDbmlToModel", () => {
  test("normalizes tables, columns, pk, nullability with split schema.table names", () => {
    const m = parseDbmlToModel(DBML);
    expect([...m.tables.keys()].sort()).toEqual(["t", "u"]);
    const t = m.tables.get("t");
    expect(t?.schema).toBe("s");
    expect(t?.columns.get("id")).toEqual({
      name: "id",
      type: "uuid",
      nullable: false,
      pk: true,
    });
    expect(t?.columns.get("name")?.type).toBe("varchar");
    expect(t?.columns.get("name")?.nullable).toBe(false);
    // a column with no [not null] is nullable and not pk
    expect(m.tables.get("u")?.columns.get("t_id")).toEqual({
      name: "t_id",
      type: "uuid",
      nullable: true,
      pk: false,
    });
  });

  test("normalizes indexes, enums, and refs", () => {
    const m = parseDbmlToModel(DBML);
    expect(m.tables.get("t")?.indexes).toEqual([
      { columns: ["name"], unique: true, name: "u1" },
    ]);
    expect(m.enums.get("color")).toEqual({
      name: "color",
      values: ["red", "green"],
    });
    expect(m.refs).toHaveLength(1);
    // direction-independent: endpoints are t.id and u.t_id
    const tables = [m.refs[0]?.fromTable, m.refs[0]?.toTable].sort();
    expect(tables).toEqual(["t", "u"]);
  });

  // A database refuses a NULL in a primary key column and reports every one as
  // NOT NULL, so a `[pk]` that does not also say `not null` still means it.
  describe("primary key columns are not nullable", () => {
    test("an inline [pk] without [not null]", () => {
      const m = parseDbmlToModel(`Table "t" {\n  "id" int4 [pk]\n}`);
      expect(m.tables.get("t")?.columns.get("id")).toEqual({
        name: "id",
        type: "integer",
        nullable: false,
        pk: true,
      });
    });

    test("every column of a composite primary key, and no other", () => {
      const m = parseDbmlToModel(`Table "t" {
  "a" int4
  "b" int4
  "note" text
  Indexes {
    (a, b) [pk]
  }
}`);
      const columns = m.tables.get("t")?.columns;
      // Column-level pk stays false: the database side reports a composite
      // key as an index, not as a pk on each column.
      expect(columns?.get("a")).toMatchObject({ nullable: false, pk: false });
      expect(columns?.get("b")).toMatchObject({ nullable: false, pk: false });
      expect(columns?.get("note")?.nullable).toBe(true);
    });

    test("an explicit [null] on a pk column does not make it nullable", () => {
      const m = parseDbmlToModel(`Table "t" {\n  "id" int4 [pk, null]\n}`);
      expect(m.tables.get("t")?.columns.get("id")?.nullable).toBe(false);
    });
  });

  test("throws DbmlParseError with line/column on invalid DBML", () => {
    // Valid table bodies, but the FK action `[delete: on delete set null]`
    // is malformed (DBML expects `set null`, not `on delete set null`).
    // This is the real-world failure seen in production .dbml files.
    const bad = `Table "s.a" {
  "id" uuid
}
Table "s.b" {
  "a_id" uuid
}
Ref: "s.a"."id" < "s.b"."a_id" [delete: on delete set null]`;
    try {
      parseDbmlToModel(bad);
      throw new Error("expected parse to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(DbmlParseError);
      expect((e as DbmlParseError).line).toBeGreaterThan(0);
      expect((e as DbmlParseError).column).toBeGreaterThan(0);
    }
  });
});
