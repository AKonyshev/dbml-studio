import { withDatabase } from "../connectionString";
import { DbImportErrorCode } from "../errors";
import { fetchSchema } from "../fetchSchema";
import { listDatabases } from "../listDatabases";
import { listSchemaNames } from "../listSchemaNames";
import { listSchemas } from "../listSchemas";
import { schemaToDbml } from "../schemaToDbml";

/**
 * The suite that talks to a real MySQL.
 *
 * `mysql.test.ts` hands the adapter a mocked driver and connector, which proves
 * the translation and nothing about the catalogue behind it — what `SHOW
 * DATABASES` returns, how the connector reports a MySQL database that has no
 * schema of its own, what an access-denied error looks like on the wire.
 *
 * Skipped unless `DBML_TEST_MYSQL_URL` is set, so the sweep on every commit
 * stays offline. `docs/testing.md` says how to raise a database to run it
 * against; the schema is `fixtures/library.mysql.sql`. Comparing what is read
 * here with the file it was built from is `schema-diff`'s live suite.
 */
const url = process.env.DBML_TEST_MYSQL_URL;
const describeLive = url === undefined ? describe.skip : describe;
// Narrowed once. Nothing below runs unless the variable is set, which is a
// guarantee `describe.skip` gives and the type system does not see.
const connection = url as unknown as string;

// The same server, with no database selected: how a saved connection looks
// before the user has picked one.
const serverOnly = (): string => connection.replace(/\/[^/@]*$/, "");

describeLive("against a real MySQL", () => {
  // The driver opens a socket; the default five seconds is tight for a
  // container that has just started.
  jest.setTimeout(30_000);

  it("lists the databases on the server, and not MySQL's own", async () => {
    const names = await listDatabases(connection);

    expect(names).toContain("library");
    for (const system of [
      "mysql",
      "information_schema",
      "performance_schema",
      "sys",
    ]) {
      expect(names).not.toContain(system);
    }
  });

  it("lists the database the string points at as its one schema", async () => {
    expect(await listSchemas(connection)).toEqual(["library"]);
  });

  it("reads the library's tables and the references between them", async () => {
    const db = await fetchSchema(connection);

    expect(db.tables?.map((t) => t.name).sort()).toEqual([
      "author",
      "book",
      "branch",
      "copy",
      "loan",
      "member",
      "reservation",
    ]);
    // The connector names no schema for MySQL; the adapter names the database.
    expect(listSchemaNames(db)).toEqual(["library"]);

    const pairs = (db.refs ?? []).map(
      (ref) =>
        `${String(ref.endpoints[0].tableName)}>${String(ref.endpoints[1].tableName)}`,
    );
    expect(pairs).toEqual(
      expect.arrayContaining([
        "book>author",
        "copy>book",
        "loan>copy",
        "loan>member",
        "reservation>loan",
      ]),
    );
    expect(pairs).toHaveLength(9);
  });

  it("exports the library as DBML with its keys, enums and relations", async () => {
    const { dbml, droppedCrossSchemaRefs } = schemaToDbml(
      await fetchSchema(connection),
      ["library"],
    );

    expect(droppedCrossSchemaRefs).toBe(0);
    expect(dbml).toContain('Table "library"."book"');
    expect(dbml).toMatch(/"id" int \[pk, not null\]/);
    expect(dbml).toMatch(/"membership_no" varchar\(16\) \[unique, not null\]/);
    // A MySQL ENUM column becomes an enum of its own, and the column points at
    // it through the database it lives in.
    expect(dbml).toContain('Enum "library"."member_status_enum"');
    expect(dbml).toMatch(/"status" library\.member_status_enum/);
    expect(dbml).toMatch(
      /Ref "book_ibfk_1":"library"\."author"\."id" < "library"\."book"\."author_id"/,
    );
  });

  it("reads a server-level URL's databases, refuses to read it, and can name one", async () => {
    const server = serverOnly();
    expect(server).not.toMatch(/\/library$/);

    // Server-level: works without a database in the URL.
    expect(await listDatabases(server)).toContain("library");
    expect(await listSchemas(server)).toEqual([]);

    // A schema is a database, and there is none to read.
    await expect(fetchSchema(server)).rejects.toMatchObject({
      code: DbImportErrorCode.INVALID_CONNECTION_STRING,
      message: expect.stringMatching(/name a database/i),
    });

    // And `withDatabase` supplies it.
    const named = withDatabase(server, "library");
    expect(await listSchemas(named)).toEqual(["library"]);
    expect((await fetchSchema(named)).tables).toHaveLength(7);
  });

  it("reads a mariadb:// spelling of the same URL", async () => {
    const asMariadb = connection.replace(/^mysql:/, "mariadb:");
    expect(await listSchemas(asMariadb)).toEqual(["library"]);
    expect((await fetchSchema(asMariadb)).tables).toHaveLength(7);
  });

  it("refuses a wrong password as AUTH_FAILED, without repeating it", async () => {
    const wrong = connection.replace(/\/\/[^@]*@/, "//nobody:Secr3tWrong@");

    // One after the other: a promise created ahead of its turn that rejects
    // before anyone awaits it is an unhandled rejection, not a result.
    for (const attempt of [fetchSchema, listDatabases]) {
      const error = (await attempt(wrong).catch((e: unknown) => e)) as Error & {
        code?: string;
      };
      expect(error.code).toBe(DbImportErrorCode.AUTH_FAILED);
      expect(error.message).not.toMatch(/Secr3tWrong|nobody/);
    }
  });

  it("refuses a database that is not there, as DATABASE_NOT_FOUND", async () => {
    const missing = withDatabase(connection, "no_such_database");

    await expect(fetchSchema(missing)).rejects.toMatchObject({
      code: DbImportErrorCode.DATABASE_NOT_FOUND,
    });
  });
});
