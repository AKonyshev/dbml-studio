import { withDatabase } from "../connectionString";
import { DbImportErrorCode } from "../errors";
import { fetchSchema } from "../fetchSchema";
import { listDatabases } from "../listDatabases";
import { listSchemaNames } from "../listSchemaNames";
import { listSchemas } from "../listSchemas";
import { schemaToDbml } from "../schemaToDbml";

/**
 * The suite that talks to a real SQL Server.
 *
 * `mssql.test.ts` hands the adapter a mocked driver and connector, which proves
 * the translation and nothing about the catalogue behind it — what
 * `sys.databases` returns, how the connector names the schema of everything it
 * reads, what a login failure looks like on the wire.
 *
 * Skipped unless `DBML_TEST_MSSQL_URL` is set, so the sweep on every commit
 * stays offline. `docs/testing.md` says how to raise a server to run it against;
 * the schema is `fixtures/library.mssql.sql`. SQL Server has no enum type, so
 * the enums the connector reads out of CHECK constraints (under names that
 * carry a hash SQL Server makes up) are not asserted on.
 */
const url = process.env.DBML_TEST_MSSQL_URL;
const describeLive = url === undefined ? describe.skip : describe;
// Narrowed once. Nothing below runs unless the variable is set, which is a
// guarantee `describe.skip` gives and the type system does not see.
const connection = url as unknown as string;

// The same server, with no database selected: how a saved connection looks
// before the user has picked one.
const serverOnly = (): string => connection.replace(/\/library(?=\?|$)/, "");

describeLive("against a real SQL Server", () => {
  // The image is amd64, and on Apple Silicon it runs under emulation: the first
  // connection after start-up can take a while.
  jest.setTimeout(60_000);

  it("lists the databases on the server, and not SQL Server's own", async () => {
    const names = await listDatabases(connection);

    expect(names).toContain("library");
    for (const system of ["master", "tempdb", "model", "msdb"]) {
      expect(names).not.toContain(system);
    }
  });

  it("lists the schemas of the database the string points at, and not the built-in ones", async () => {
    expect(await listSchemas(connection)).toEqual(["dbo"]);
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
    // The connector names the schema of everything it reads, and keys the
    // columns by `<schema>.<table>`; the adapter has nothing to add.
    expect(listSchemaNames(db)).toEqual(["dbo"]);
    expect(Object.keys(db.fields ?? {}).sort()).toEqual(
      (db.tables ?? []).map((t) => `dbo.${t.name}`).sort(),
    );

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
    for (const ref of db.refs ?? []) {
      for (const end of ref.endpoints) expect(end.schemaName).toBe("dbo");
    }
  });

  it("exports the library as DBML with its keys and relations", async () => {
    const { dbml, droppedCrossSchemaRefs } = schemaToDbml(
      await fetchSchema(connection),
      ["dbo"],
    );

    expect(droppedCrossSchemaRefs).toBe(0);
    expect(dbml).toContain('Table "dbo"."book"');
    expect(dbml).toMatch(/"id" int(\(\d+\))? \[pk, not null/);
    expect(dbml).toMatch(/"membership_no" varchar\(16\) \[unique, not null\]/);
    expect(dbml).toMatch(
      /Ref "[^"]+":"dbo"\."author"\."id" < "dbo"\."book"\."author_id"/,
    );
  });

  it("reads the same server through an ADO string", async () => {
    // Everything the URL says, spelled the other way.
    const ado = `Server=localhost,${new URL(connection.replace(/^sqlserver:/, "http:")).port};Database=library;User Id=sa;Password=Test_Passw0rd!;TrustServerCertificate=true`;
    expect(await listSchemas(ado)).toEqual(["dbo"]);
    expect((await fetchSchema(ado)).tables).toHaveLength(7);
  });

  it("reads a server-level URL's databases, and can name one", async () => {
    const server = serverOnly();
    expect(server).not.toMatch(/\/library/);

    // Server-level: works without a database in the string.
    expect(await listDatabases(server)).toContain("library");

    const named = withDatabase(server, "library");
    expect(await listSchemas(named)).toEqual(["dbo"]);
    expect((await fetchSchema(named)).tables).toHaveLength(7);
  });

  it("reads two schemas at once, each from its own server", async () => {
    // The connector shares the driver's global pool; reads take turns.
    const [a, b] = await Promise.all([
      fetchSchema(connection),
      fetchSchema(withDatabase(connection, "library")),
    ]);
    expect(a.tables).toHaveLength(7);
    expect(b.tables).toHaveLength(7);
  });

  it("refuses a wrong password as AUTH_FAILED, without repeating it", async () => {
    const wrong = connection.replace(/\/\/[^@]*@/, "//nobody:Secr3tWrong@");

    // One after the other: a promise created ahead of its turn that rejects
    // before anyone awaits it is an unhandled rejection, not a result.
    for (const attempt of [fetchSchema, listDatabases, listSchemas]) {
      const error = (await attempt(wrong).catch((e: unknown) => e)) as Error & {
        code?: string;
      };
      expect(error.code).toBe(DbImportErrorCode.AUTH_FAILED);
      expect(error.message).not.toMatch(/Secr3tWrong|nobody/);
    }
  });

  // A SQL login that names a database which is not there is told only
  // "Login failed for user": the server's message about the database (error
  // 4060) is sent first and the driver reports the last error, so the two causes
  // cannot be told apart from the error. Telling them apart would take a second
  // login, which doubles the failed attempts a lockout policy counts.
  it("refuses a database that is not there, without repeating its name", async () => {
    const missing = withDatabase(connection, "no_such_database");

    for (const attempt of [fetchSchema, listSchemas]) {
      const error = (await attempt(missing).catch(
        (e: unknown) => e,
      )) as Error & {
        code?: string;
      };
      expect([
        DbImportErrorCode.DATABASE_NOT_FOUND,
        DbImportErrorCode.AUTH_FAILED,
      ]).toContain(error.code);
      expect(error.message).not.toMatch(/no_such_database|sa\b/);
    }
  });

  it("refuses a host that is not listening, as UNREACHABLE, and goes on working", async () => {
    const nowhere = connection.replace(/@[^/]*\//, "@127.0.0.1:1/");

    for (const attempt of [fetchSchema, listDatabases]) {
      await expect(attempt(nowhere)).rejects.toMatchObject({
        code: DbImportErrorCode.UNREACHABLE,
      });
    }
    // The failed read must not have left the driver's global pool behind.
    expect((await fetchSchema(connection)).tables).toHaveLength(7);
  });
});
