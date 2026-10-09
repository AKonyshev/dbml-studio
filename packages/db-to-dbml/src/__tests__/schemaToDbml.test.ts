import { schemaToDbml } from "../schemaToDbml";

import { mysqlShapedFixture, twoSchemaFixture } from "./fixtures";

import type { DatabaseSchema } from "../types";

const generateDbml = jest.fn<string, [DatabaseSchema]>(() => "GENERATED_DBML");
jest.mock("@dbml/core", () => ({
  importer: {
    generateDbml: (schema: unknown) => generateDbml(schema as DatabaseSchema),
  },
}));

// The real generator, for the tests that read what it writes. The mock above
// keeps the rest of this file about what is handed to it.
const realGenerateDbml = (schema: DatabaseSchema): string =>
  jest
    .requireActual<{
      importer: { generateDbml: (s: DatabaseSchema) => string };
    }>("@dbml/core")
    .importer.generateDbml(schema);

describe("schemaToDbml", () => {
  beforeEach(() => generateDbml.mockClear());

  test("passes the filtered schema to importer.generateDbml and returns its output", () => {
    const result = schemaToDbml(twoSchemaFixture(), ["public"]);
    expect(result.dbml).toBe("GENERATED_DBML");
    expect(result.droppedCrossSchemaRefs).toBe(1);

    const passed = generateDbml.mock.calls[0][0];
    expect((passed.tables ?? []).map((t) => t.name)).toEqual([
      "users",
      "orders",
    ]);
  });

  test("hands the generator the same schema when `unqualified` is public or absent", () => {
    schemaToDbml(twoSchemaFixture(), ["public"]);
    schemaToDbml(twoSchemaFixture(), ["public"], { unqualified: "public" });
    schemaToDbml(twoSchemaFixture(), ["public"], {});

    const [bare, named, empty] = generateDbml.mock.calls.map((c) => c[0]);
    expect(named).toEqual(bare);
    expect(empty).toEqual(bare);
  });

  test("hands the generator both schemas and the ref between them", () => {
    const result = schemaToDbml(twoSchemaFixture(), ["public", "audit"]);

    // The generator is mocked here, so what this unit owns is the schema it
    // passes on: both schemas' tables, and the ref across them kept rather than
    // counted. That the generated text qualifies the non-default schema is
    // @dbml/core's job, and the live suite reads it back off a real database.
    expect(result.droppedCrossSchemaRefs).toBe(0);

    const passed = generateDbml.mock.calls[0][0];
    expect((passed.tables ?? []).map((t) => t.name)).toEqual([
      "users",
      "orders",
      "logs",
    ]);
    expect(passed.refs).toHaveLength(3);
  });
  describe("with `unqualified`", () => {
    beforeEach(() => generateDbml.mockImplementation(realGenerateDbml));
    afterEach(() => generateDbml.mockImplementation(() => "GENERATED_DBML"));

    test("writes a MySQL database's objects without its name", () => {
      const { dbml } = schemaToDbml(mysqlShapedFixture(), ["library"], {
        unqualified: "library",
      });

      expect(dbml).toContain('Table "book" {');
      expect(dbml).toContain('Table "member" {');
      expect(dbml).toContain('Enum "book_status_enum" {');
      expect(dbml).toContain('"status" book_status_enum');
      expect(dbml).toMatch(/Ref[^\n]*"member"\."id" < "book"\."member_id"/);
      expect(dbml).not.toContain("library");
    });

    test("keeps the prefix without the option", () => {
      const { dbml } = schemaToDbml(mysqlShapedFixture(), ["library"]);

      expect(dbml).toContain('Table "library"."book" {');
      expect(dbml).toContain('Enum "library"."book_status_enum" {');
    });

    test("leaves the caller's schema as it was", () => {
      const db = mysqlShapedFixture();
      const before = JSON.stringify(db);

      schemaToDbml(db, ["library"], { unqualified: "library" });

      expect(JSON.stringify(db)).toBe(before);
    });

    test("unprefixes the named schema only when two are selected", () => {
      const db = mysqlShapedFixture();
      db.tables?.push({ name: "log", schemaName: "audit" });
      db.fields = {
        ...db.fields,
        "audit.log": [
          { name: "id", type: { type_name: "int" } },
          {
            name: "book_id",
            type: { type_name: "int" },
          },
        ],
      };
      db.refs?.push({
        endpoints: [
          {
            schemaName: "audit",
            tableName: "log",
            fieldNames: ["book_id"],
            relation: "*",
          },
          {
            schemaName: "library",
            tableName: "book",
            fieldNames: ["id"],
            relation: "1",
          },
        ],
      });

      const { dbml } = schemaToDbml(db, ["library", "audit"], {
        unqualified: "library",
      });

      expect(dbml).toContain('Table "book" {');
      expect(dbml).toContain('Table "audit"."log" {');
      expect(dbml).toContain('"audit"."log"."book_id"');
      expect(dbml).not.toContain('"library"');
    });

    test("keeps both qualified when a real public schema is selected too", () => {
      const db = mysqlShapedFixture();
      db.tables?.push({ name: "book", schemaName: "public" });
      db.fields = {
        ...db.fields,
        "public.book": [{ name: "id", type: { type_name: "int" } }],
      };

      const { dbml } = schemaToDbml(db, ["library", "public"], {
        unqualified: "library",
      });

      expect(dbml).toContain('Table "library"."book" {');
      expect(dbml).toContain('Table "book" {');
    });
  });
});
