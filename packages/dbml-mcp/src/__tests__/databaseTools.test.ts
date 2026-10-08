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

// LIBRARY_DBML as a database reports it: Postgres says a primary key is not
// null, and the comparison does not infer that from `[pk]` alone.
const MATCHING_DBML = LIBRARY_DBML.replaceAll("[pk]", "[pk, not null]");

const fakeCatalog = (overrides: Partial<Catalog> = {}): Catalog => ({
  listDatabases: async () => ["archive", "library"],
  listSchemas: async () => ["public"],
  fetchSchema: async () => LIBRARY_DB,
  ...overrides,
});

const env = { DBML_CONNECTION_LOCAL: URL_WITH_PASSWORD };

describe("list_connections", () => {
  it("lists names only", async () => {
    const ctx = await makeContext({ connections: connectionsFromEnv(env) });
    const result = await listConnections.run({}, ctx);
    expect(result.structured).toEqual({ connections: ["local"] });
    expect(result.structured).not.toHaveProperty("hint");
    expect(result.text).not.toContain("Pa55-w0rd");
  });

  it("answers an empty list when nothing is configured", async () => {
    const result = await listConnections.run({}, await makeContext());
    expect(result.structured.connections).toEqual([]);
    expect(result.structured.hint).toContain("DBML_CONNECTION_<NAME>");
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
      { text: MATCHING_DBML, connection: "local", schema: "public" },
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

  it("reads the model from a file inside the working folder", async () => {
    const ctx = await makeContext({
      connections: connectionsFromEnv(env),
      catalog: fakeCatalog(),
    });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.join(ctx.root ?? "", "library.dbml"), MATCHING_DBML);
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

  it.each(failures)("%s", async (_label, catalog) => {
    const ctx = await makeContext({ catalog });
    const calls = [
      importSchema.run(
        {
          connection: URL_WITH_PASSWORD,
          schemas: ["public"],
          overwrite: false,
        },
        ctx,
      ),
      compareWithDatabase.run(
        { text: LIBRARY_DBML, connection: URL_WITH_PASSWORD, schema: "public" },
        ctx,
      ),
      listDatabases.run({ connection: URL_WITH_PASSWORD }, ctx),
      listSchemas.run({ connection: URL_WITH_PASSWORD, database: "x#y" }, ctx),
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
