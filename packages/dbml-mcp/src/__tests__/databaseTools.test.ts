import { readFile } from "node:fs/promises";
import path from "node:path";

import { DbImportError, DbImportErrorCode } from "db-to-dbml";

import { connectionsFromEnv } from "../connections";
import { compareWithDatabase } from "../tools/compareWithDatabase";
import { importSchema } from "../tools/importSchema";
import { listConnections } from "../tools/listConnections";
import { listDatabases } from "../tools/listDatabases";
import { listSchemas } from "../tools/listSchemas";

import { codeOf, LIBRARY_DBML, makeContext } from "./helpers";

import type { DatabaseSchema } from "db-to-dbml";
import type { Catalog } from "../context";

const URL_WITH_PASSWORD =
  "postgresql://reader:Pa55-w0rd@db.example:5432/library";

// What @dbml/connector returns for the LIBRARY_DBML model in schema public,
// read off a real PostgreSQL: columns keyed per "schema.table", `int4` for an
// integer, primary keys under tableConstraints, no `checks` section.
const column = (
  name: string,
  typeName: string,
  schemaName: string | null,
): object => ({
  name,
  type: { type_name: typeName, schemaName },
  dbdefault: null,
  not_null: true,
  increment: false,
  note: { value: "" },
});

const LIBRARY_DB: DatabaseSchema = {
  tables: [
    { name: "member", schemaName: "public", note: { value: "" } },
    { name: "loan", schemaName: "public", note: { value: "" } },
  ],
  fields: {
    "public.member": [
      column("id", "int4", null),
      column("status", "membership_status", "public"),
    ],
    "public.loan": [
      column("id", "int4", null),
      column("member_id", "int4", null),
    ],
  },
  refs: [
    {
      name: "loan_member_id_fkey",
      endpoints: [
        {
          tableName: "loan",
          schemaName: "public",
          fieldNames: ["member_id"],
          relation: "*",
        },
        {
          tableName: "member",
          schemaName: "public",
          fieldNames: ["id"],
          relation: "1",
        },
      ],
      onDelete: null,
      onUpdate: null,
    },
  ],
  enums: [
    {
      name: "membership_status",
      schemaName: "public",
      values: [{ name: "active" }, { name: "lapsed" }],
    },
  ],
  indexes: {},
  tableConstraints: {
    "public.loan": { id: { pk: true } },
    "public.member": { id: { pk: true } },
  },
};

// The same library as MySQL's connector reports it: the database is the
// schema, an ENUM column gets an enum named `<table>_<column>_enum`, and the
// foreign key is backed by a non-unique index MySQL made itself.
const mysqlColumn = (name: string, typeName: string): object => ({
  name,
  type: { type_name: typeName, schemaName: null },
  dbdefault: null,
  not_null: true,
  increment: false,
  note: { value: "" },
});

const LIBRARY_MYSQL_DB: DatabaseSchema = {
  tables: [
    { name: "member", schemaName: "library", note: { value: "" } },
    { name: "loan", schemaName: "library", note: { value: "" } },
  ],
  fields: {
    "library.member": [
      mysqlColumn("id", "int"),
      mysqlColumn("status", "member_status_enum"),
    ],
    "library.loan": [mysqlColumn("id", "int"), mysqlColumn("member_id", "int")],
  },
  refs: [
    {
      name: "loan_ibfk_1",
      endpoints: [
        {
          tableName: "loan",
          schemaName: "library",
          fieldNames: ["member_id"],
          relation: "*",
        },
        {
          tableName: "member",
          schemaName: "library",
          fieldNames: ["id"],
          relation: "1",
        },
      ],
      onDelete: null,
      onUpdate: null,
    },
  ],
  enums: [
    {
      name: "member_status_enum",
      schemaName: "library",
      values: [{ name: "active" }, { name: "lapsed" }],
    },
  ],
  indexes: {
    "library.loan": [
      { name: "member_id", columns: [{ value: "member_id", type: "column" }] },
    ],
  },
  tableConstraints: {
    "library.loan": { id: { pk: true } },
    "library.member": { id: { pk: true } },
  },
};

const fakeCatalog = (overrides: Partial<Catalog> = {}): Catalog => ({
  listDatabases: async () => ["archive", "library"],
  listSchemas: async () => ["public"],
  fetchSchema: async () => LIBRARY_DB,
  ...overrides,
});

const env = { DBML_CONNECTION_LOCAL: URL_WITH_PASSWORD };
const URL_MYSQL = "mysql://reader:Pa55-w0rd@db.example:3306/library";
const mysqlCatalog = (): Catalog =>
  fakeCatalog({ fetchSchema: async () => LIBRARY_MYSQL_DB });

describe("list_connections", () => {
  it("lists each connection with its database kind", async () => {
    const ctx = await makeContext({
      connections: connectionsFromEnv({
        ...env,
        DBML_CONNECTION_SHOP: URL_MYSQL,
      }),
    });
    const result = await listConnections.run({}, ctx);
    expect(result.structured).toEqual({
      connections: [
        { name: "local", database: "postgres" },
        { name: "shop", database: "mysql" },
      ],
    });
    expect(result.structured).not.toHaveProperty("hint");
    expect(result.text).toBe("Connections: local (postgres), shop (mysql).");
    expect(result.text).not.toContain("Pa55-w0rd");
    expect(() =>
      listConnections.outputSchema.parse(result.structured),
    ).not.toThrow();
  });

  it('lists a value no database accepts as "unknown"', async () => {
    const ctx = await makeContext({
      connections: connectionsFromEnv({
        DBML_CONNECTION_ODD: "snowflake://u:Pa55-w0rd@a/db",
      }),
    });
    const result = await listConnections.run({}, ctx);
    expect(result.structured.connections).toEqual([
      { name: "odd", database: "unknown" },
    ]);
    expect(result.text).not.toContain("Pa55-w0rd");
    expect(() =>
      listConnections.outputSchema.parse(result.structured),
    ).not.toThrow();
  });

  it("answers an empty list when nothing is configured", async () => {
    const result = await listConnections.run({}, await makeContext());
    expect(result.structured.connections).toEqual([]);
    expect(result.structured.hint).toContain("DBML_CONNECTION_<NAME>");
    expect(result.structured.hint).toMatch(
      /postgres:\/\/, mysql:\/\/ or sqlserver:\/\//,
    );
    expect(result.text).toContain("DBML_CONNECTION_<NAME>");
  });
});

describe("list_databases and list_schemas", () => {
  it("pass the resolved connection to the catalog", async () => {
    const seen: string[] = [];
    const catalog = fakeCatalog({
      listSchemas: async (cs) => {
        seen.push(cs);
        return ["lending", "public"];
      },
    });
    const ctx = await makeContext({
      connections: connectionsFromEnv(env),
      catalog,
    });
    expect(
      (await listDatabases.run({ connection: "local" }, ctx)).structured,
    ).toEqual({
      databases: ["archive", "library"],
    });
    expect(
      (await listSchemas.run({ connection: "local", database: "archive" }, ctx))
        .structured,
    ).toEqual({
      schemas: ["lending", "public"],
    });
    expect(seen).toEqual([
      "postgresql://reader:Pa55-w0rd@db.example:5432/archive",
    ]);
  });
});

describe("an unknown connection name", () => {
  it("stays CONNECTION_NOT_FOUND through the database guard", async () => {
    const ctx = await makeContext({
      connections: connectionsFromEnv(env),
      catalog: fakeCatalog(),
    });
    expect(await codeOf(listDatabases.run({ connection: "prod" }, ctx))).toBe(
      "CONNECTION_NOT_FOUND",
    );
  });

  it("says how to configure one when nothing is configured", async () => {
    const ctx = await makeContext({ catalog: fakeCatalog() });
    await expect(
      listDatabases.run({ connection: "staging" }, ctx),
    ).rejects.toMatchObject({
      code: "CONNECTION_NOT_FOUND",
      message: expect.stringContaining("DBML_CONNECTION_<NAME>"),
    });
  });
});

describe("import_schema", () => {
  it("refuses a schema the database does not have, naming those it does", async () => {
    const ctx = await makeContext({
      connections: connectionsFromEnv(env),
      catalog: fakeCatalog(),
    });
    await expect(
      importSchema.run(
        { connection: "local", schemas: ["publc"], overwrite: false },
        ctx,
      ),
    ).rejects.toMatchObject({
      code: "SCHEMA_NOT_FOUND",
      message: expect.stringContaining("public"),
    });
  });

  it("returns the schema as DBML with counts", async () => {
    const ctx = await makeContext({
      connections: connectionsFromEnv(env),
      catalog: fakeCatalog(),
    });
    const result = await importSchema.run(
      { connection: "local", schemas: ["public"], overwrite: false },
      ctx,
    );
    expect(result.structured).toEqual({
      tables: 2,
      enums: 1,
      refs: 1,
      droppedCrossSchemaRefs: 0,
      dbml: result.text,
      outputPath: undefined,
    });
    expect(result.text).toContain("membership_status");
    expect(result.text).toContain("member_id");
  });

  it("writes a MySQL database's own schema without a prefix", async () => {
    const ctx = await makeContext({
      connections: connectionsFromEnv({ DBML_CONNECTION_SHOP: URL_MYSQL }),
      catalog: mysqlCatalog(),
    });
    const result = await importSchema.run(
      { connection: "shop", schemas: ["library"], overwrite: false },
      ctx,
    );
    expect(result.structured.tables).toBe(2);
    expect(result.text).toContain('Table "member"');
    expect(result.text).not.toContain('"library".');
  });

  it("writes a file and answers with a summary when outputPath is given", async () => {
    const ctx = await makeContext({
      connections: connectionsFromEnv(env),
      catalog: fakeCatalog(),
    });
    const result = await importSchema.run(
      {
        connection: "local",
        schemas: ["public"],
        outputPath: "schemas/generated/library.dbml",
        overwrite: false,
      },
      ctx,
    );
    expect(result.text).toContain(
      "Wrote 2 tables, 1 enums and 1 references to schemas/generated/library.dbml.",
    );
    const written = await readFile(
      path.join(ctx.root ?? "", "schemas/generated/library.dbml"),
      "utf8",
    );
    expect(written).toContain("membership_status");
    expect(result.text).not.toContain("membership_status");
    expect(result.structured).not.toHaveProperty("dbml");
  });

  it("counts references to schemas it left out", async () => {
    const db: DatabaseSchema = {
      ...LIBRARY_DB,
      tables: [
        ...(LIBRARY_DB.tables ?? []),
        { name: "audit_log", schemaName: "audit" },
      ],
      refs: [
        ...(LIBRARY_DB.refs ?? []),
        {
          endpoints: [
            {
              tableName: "audit_log",
              schemaName: "audit",
              fieldNames: ["member_id"],
            },
            { tableName: "member", schemaName: "public", fieldNames: ["id"] },
          ],
        },
      ],
    };
    const ctx = await makeContext({
      connections: connectionsFromEnv(env),
      catalog: fakeCatalog({ fetchSchema: async () => db }),
    });
    const result = await importSchema.run(
      { connection: "local", schemas: ["public"], overwrite: false },
      ctx,
    );
    expect(result.structured.droppedCrossSchemaRefs).toBe(1);
    expect(result.text).toContain("1 references to schemas not imported");
    // The note belongs to the text; the structured DBML stays plain.
    expect(result.structured.dbml).not.toContain("not imported");
    expect(result.structured.dbml).toContain("member_id");
  });
});

describe("compare_with_database", () => {
  it("refuses DBML that does not parse", async () => {
    const ctx = await makeContext({
      connections: connectionsFromEnv(env),
      catalog: fakeCatalog(),
    });
    expect(
      await codeOf(
        compareWithDatabase.run(
          { text: "Table {", connection: "local", schema: "public" },
          ctx,
        ),
      ),
    ).toBe("DBML_PARSE_ERROR");
  });

  it("refuses a schema the database does not have", async () => {
    const ctx = await makeContext({
      connections: connectionsFromEnv(env),
      catalog: fakeCatalog(),
    });
    expect(
      await codeOf(
        compareWithDatabase.run(
          { text: LIBRARY_DBML, connection: "local", schema: "sales" },
          ctx,
        ),
      ),
    ).toBe("SCHEMA_NOT_FOUND");
  });

  it("finds a model identical to the database it describes", async () => {
    const ctx = await makeContext({
      connections: connectionsFromEnv(env),
      catalog: fakeCatalog(),
    });
    const result = await compareWithDatabase.run(
      { text: LIBRARY_DBML, connection: "local", schema: "public" },
      ctx,
    );
    expect(result.structured.identical).toBe(true);
    expect(result.structured.report).toBe(result.text);
  });

  it("answers a diff that its own output schema accepts", async () => {
    const ctx = await makeContext({
      connections: connectionsFromEnv(env),
      catalog: fakeCatalog(),
    });
    // Differs on every axis the output schema describes: a table, a column's
    // type, an enum value, a reference and an index on either side.
    const drifted = `Enum membership_status {
  active
  suspended
}

Table member {
  id bigint [pk]
  status membership_status [not null]

  indexes {
    status
  }
}

Table fine {
  id integer [pk]
  member_id integer [ref: > member.id]

  indexes {
    member_id
  }
}
`;
    const result = await compareWithDatabase.run(
      { text: drifted, connection: "local", schema: "public" },
      ctx,
    );
    expect(result.structured.identical).toBe(false);
    expect(result.structured.report).toBe(result.text);
    expect(result.structured.report).toContain("fine");
    expect(result.structured.tablesOnlyInDbml).toContain("fine");
    expect(result.structured.tablesOnlyInDatabase).toContain("loan");
    expect(result.structured.columnDiffs.length).toBeGreaterThan(0);
    expect(result.structured.enumValueDiffs.length).toBeGreaterThan(0);
    expect(result.structured.refsOnlyInDbml.length).toBeGreaterThan(0);
    expect(result.structured.refsOnlyInDatabase.length).toBeGreaterThan(0);
    expect(result.structured.indexDiffs.length).toBeGreaterThan(0);
    expect(() =>
      compareWithDatabase.outputSchema.parse(result.structured),
    ).not.toThrow();
  });

  it("compares against the database's default schema when none is given", async () => {
    const ctx = await makeContext({
      connections: connectionsFromEnv(env),
      catalog: fakeCatalog(),
    });
    const result = await compareWithDatabase.run(
      { text: LIBRARY_DBML, connection: "local" },
      ctx,
    );
    expect(result.structured.identical).toBe(true);
  });

  it("takes the database itself as MySQL's default schema, and compares by MySQL's rules", async () => {
    let fetched = 0;
    const ctx = await makeContext({
      connections: connectionsFromEnv({ DBML_CONNECTION_SHOP: URL_MYSQL }),
      catalog: fakeCatalog({
        fetchSchema: async () => {
          fetched += 1;
          return LIBRARY_MYSQL_DB;
        },
      }),
    });
    // The model names its enum and declares no index for the foreign key;
    // MySQL names the enum after the column and indexes the key itself.
    const result = await compareWithDatabase.run(
      { text: LIBRARY_DBML, connection: "shop" },
      ctx,
    );
    expect(fetched).toBe(1);
    expect(result.structured.identical).toBe(true);
  });

  it("still lets MySQL's schema be named", async () => {
    const ctx = await makeContext({
      connections: connectionsFromEnv({ DBML_CONNECTION_SHOP: URL_MYSQL }),
      catalog: mysqlCatalog(),
    });
    expect(
      await codeOf(
        compareWithDatabase.run(
          { text: LIBRARY_DBML, connection: "shop", schema: "public" },
          ctx,
        ),
      ),
    ).toBe("SCHEMA_NOT_FOUND");
  });

  it("answers INVALID_CONNECTION_STRING for a configured value no database accepts", async () => {
    const ctx = await makeContext({
      connections: connectionsFromEnv({
        DBML_CONNECTION_ODD: "snowflake://u:Pa55-w0rd@a/db",
      }),
      catalog: fakeCatalog(),
    });
    await expect(
      compareWithDatabase.run({ text: LIBRARY_DBML, connection: "odd" }, ctx),
    ).rejects.toMatchObject({
      code: "INVALID_CONNECTION_STRING",
      message: expect.not.stringContaining("Pa55-w0rd"),
    });
  });

  it("reads the model from a file inside the working folder", async () => {
    const ctx = await makeContext({
      connections: connectionsFromEnv(env),
      catalog: fakeCatalog(),
    });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.join(ctx.root ?? "", "library.dbml"), LIBRARY_DBML);
    const result = await compareWithDatabase.run(
      { path: "library.dbml", connection: "local", schema: "public" },
      ctx,
    );
    expect(result.structured.identical).toBe(true);
  });
});

describe("a failing raw connection never shows its password", () => {
  const failures: Array<[string, Catalog]> = [
    [
      "auth",
      fakeCatalog({
        fetchSchema: async () =>
          await Promise.reject(
            new DbImportError(
              DbImportErrorCode.AUTH_FAILED,
              "Authentication failed.",
            ),
          ),
      }),
    ],
    [
      "driver text",
      fakeCatalog({
        fetchSchema: async () =>
          await Promise.reject(
            new Error(`connect ECONNREFUSED ${URL_WITH_PASSWORD}`),
          ),
      }),
    ],
    [
      "list",
      fakeCatalog({
        listDatabases: async () =>
          await Promise.reject(new Error(URL_WITH_PASSWORD)),
      }),
    ],
  ];

  const raw = [
    URL_WITH_PASSWORD,
    "mysql://u:Pa55-w0rd@h/db",
    "sqlserver://u:Pa55-w0rd@h/db",
    "Server=h;Database=db;User Id=u;Password=Pa55-w0rd",
  ];

  describe.each(failures)("%s", (_label, catalog) => {
    it.each(raw)("%s", async (connection) => {
      const ctx = await makeContext({ catalog });
      const calls = [
        importSchema.run(
          { connection, schemas: ["public"], overwrite: false },
          ctx,
        ),
        compareWithDatabase.run(
          { text: LIBRARY_DBML, connection, schema: "public" },
          ctx,
        ),
        compareWithDatabase.run({ text: LIBRARY_DBML, connection }, ctx),
        listDatabases.run({ connection }, ctx),
        listSchemas.run({ connection, database: "x#y" }, ctx),
      ];
      for (const call of calls) {
        const outcome = await call.then(
          (r: unknown) => JSON.stringify(r),
          (e: Error) => `${(e as { code?: string }).code}: ${e.message}`,
        );
        expect(outcome).not.toContain("Pa55-w0rd");
      }
    });
  });
});
