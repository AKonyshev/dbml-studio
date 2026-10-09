import { withDatabase } from "../connectionString";
import { fetchSchema } from "../fetchSchema";
import { listDatabases } from "../listDatabases";
import { listSchemaNames } from "../listSchemaNames";
import { listSchemas } from "../listSchemas";
import { schemaToDbml } from "../schemaToDbml";

/**
 * The one suite that talks to a real PostgreSQL.
 *
 * Every other test here hands the connector a fixture, which proves the
 * translation and nothing about the query that feeds it — the shape of
 * `information_schema`, how a serial column reports its type, whether a foreign
 * key comes back with the table it points at. Those are the things a mock
 * agrees with by construction and a database does not.
 *
 * Skipped unless `DBML_TEST_DATABASE_URL` is set, so the sweep on every commit
 * stays offline. `docs/testing.md` says how to raise a database to run it
 * against.
 */
const url = process.env.DBML_TEST_DATABASE_URL;
const describeLive = url === undefined ? describe.skip : describe;
// Narrowed once. Nothing below runs unless the variable is set, which is a
// guarantee `describe.skip` gives and the type system does not see.
const connection = url as unknown as string;

const toDbml = async (
  connectionString: string,
  schemas: string[],
): Promise<string> =>
  schemaToDbml(await fetchSchema(connectionString), schemas).dbml;

describeLive("against a real PostgreSQL", () => {
  // The connector opens a socket; the default five seconds is tight for a
  // container that has just started.
  jest.setTimeout(30_000);

  it("lists the schemas the database actually has", async () => {
    const names = listSchemaNames(await fetchSchema(connection));

    expect(names).toContain("public");
    // Postgres' own schemas are not the reader's business.
    expect(names).not.toContain("information_schema");
  });

  it("reads a live schema into DBML that carries its keys and relations", async () => {
    const dbml = await toDbml(connection, ["public"]);

    expect(dbml).toContain('Table "authors"');
    expect(dbml).toContain('Table "books"');

    // A primary key, a not-null, a unique and a foreign key — the four things
    // the diagram draws differently, each read off the live catalogue rather
    // than off a fixture that was written to agree.
    expect(dbml).toMatch(/"id".*\[pk[^\]]*\]/);
    expect(dbml).toMatch(/"email".*not null/);
    expect(dbml).toMatch(/"email".*unique/);
    // Named after the constraint the database holds, pointing from the many
    // side to the one.
    expect(dbml).toMatch(
      /Ref "books_author_id_fkey":"authors"\."id" < "books"\."author_id"/,
    );
  });

  it("brings back the types the database gave the columns", async () => {
    const dbml = await toDbml(connection, ["public"]);

    // Asserted on the DBML rather than on the connector's own output, which is
    // deliberately untyped here — it is whatever `@dbml/connector` returns, and
    // the contract this package offers is the text below.
    //
    // `serial` is the case worth having a live database for: it is not a type
    // Postgres stores. It reports the integer underneath, and a fixture written
    // by hand would happily say `serial` for ever.
    // `int4` and `increment`, not `serial`: the word in the DDL is not a type
    // Postgres stores, and a fixture written by hand would say `serial` for
    // ever.
    expect(dbml).toMatch(/"id"\s+int4\b/);
    expect(dbml).toMatch(/"id".*increment/);
    expect(dbml).toMatch(/"email"\s+varchar\(255\)/);
    expect(dbml).toMatch(/"bio"\s+text/);
  });

  it("lists the databases on the server, and not the templates", async () => {
    const names = await listDatabases(connection);

    expect(names).toContain("dbmltest");
    expect(names).toContain("dbmlother");
    expect(names).not.toContain("template0");
    expect(names).not.toContain("template1");
  });

  it("lists the schemas of the database the string points at", async () => {
    const names = await listSchemas(connection);

    expect(names).toEqual(expect.arrayContaining(["public", "audit"]));
    expect(names).not.toContain("information_schema");
    expect(names).not.toContain("pg_catalog");
  });

  it("reads another database on the same server", async () => {
    // The proof that `withDatabase` really moved: the second database was
    // created empty, so it has none of the first one's schemas.
    const names = await listSchemas(withDatabase(connection, "dbmlother"));

    expect(names).toContain("public");
    expect(names).not.toContain("audit");
  });

  it("keeps a live cross-schema reference when both schemas are exported", async () => {
    const both = await toDbml(connection, ["public", "audit"]);

    expect(both).toContain('Table "audit"."logs"');
    expect(both).toMatch(/"authors"\."id" < "audit"\."logs"\."author_id"/);

    // And the same reference is gone when only one end was asked for.
    const onlyPublic = await toDbml(connection, ["public"]);
    expect(onlyPublic).not.toContain("audit");
  });

  it("refuses a database that is not there, without leaking the password", async () => {
    const wrong = connection.replace(/\/\/[^@]*@/, "//nobody:secret@");

    await expect(toDbml(wrong, ["public"])).rejects.toThrow();

    await toDbml(wrong, ["public"]).catch((error: unknown) => {
      expect(String((error as Error).message)).not.toContain("secret");
    });
  });
});
