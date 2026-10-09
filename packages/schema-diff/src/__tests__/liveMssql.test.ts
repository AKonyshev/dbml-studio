import { readFileSync } from "fs";
import { resolve } from "path";

import { fetchSchema } from "db-to-dbml";

import { databaseSchemaToModel } from "../databaseSchemaToModel";
import { diffSchemas } from "../diffSchemas";
import { parseDbmlToModel } from "../parseDbmlToModel";

/**
 * The hand-written library file against a real SQL Server.
 *
 * Nothing here is normalised for SQL Server: this pins down what the
 * comparison reports today, so that what is left to a user (and what a later
 * change takes on) is a list in a test and not a surprise. Every difference
 * below is one the connector or SQL Server produces from a file that is
 * otherwise the database, which is why the test asserts them all, and not that
 * the diff is empty.
 *
 * Skipped unless `DBML_TEST_MSSQL_URL` is set; `docs/testing.md` says how to
 * raise a server to run it against. The schema is
 * `db-to-dbml/src/__tests__/fixtures/library.mssql.sql`.
 */
const url = process.env.DBML_TEST_MSSQL_URL;
const describeLive = url === undefined ? describe.skip : describe;
// Narrowed once. Nothing below runs unless the variable is set, which is a
// guarantee `describe.skip` gives and the type system does not see.
const connection = url as unknown as string;

const LIBRARY_EXAMPLE = resolve(__dirname, "../../../../examples/library.dbml");

describeLive("against a real SQL Server", () => {
  // The image is amd64, and on Apple Silicon it runs under emulation.
  jest.setTimeout(60_000);

  it("reports exactly what the connector and SQL Server make different from the library file", async () => {
    const live = databaseSchemaToModel(await fetchSchema(connection), "dbo");
    const file = parseDbmlToModel(readFileSync(LIBRARY_EXAMPLE, "utf8"));

    const difference = diffSchemas(file, live, { dialect: "mssql" });

    // The tables, columns, keys and references all agree, `int(10)` included:
    // the connector's spelling of an integer is a type like any other once its
    // length is dropped.
    expect(difference.tablesOnlyInDbml).toEqual([]);
    expect(difference.tablesOnlyInDatabase).toEqual([]);
    expect(difference.refsOnlyInDbml).toEqual([]);
    expect(difference.refsOnlyInDatabase).toEqual([]);

    // SQL Server has no enum type. The connector reads one out of each CHECK
    // constraint and names it after the constraint, which SQL Server named
    // itself (`CK__member__status__<hash>`) and which differs per server.
    // A column typed by one carries that name.
    expect(difference.enumsOnlyInDbml).toEqual([
      "copy_condition",
      "membership_status",
    ]);
    expect(difference.enumsOnlyInDatabase).toHaveLength(2);
    for (const name of difference.enumsOnlyInDatabase) {
      expect(name).toMatch(/^CK__(copy__condition|member__status)__[0-9A-F]+_/);
    }
    expect(difference.enumValueDiffs).toEqual([]);

    // The same two columns, plus the two the file writes as `timestamp`, which
    // SQL Server has no use for in that sense (it is a row version there) and
    // the fixture creates as `datetime2`: a real difference between databases.
    expect(
      difference.columnDiffs.map((t) => ({
        table: t.table,
        onlyInDbml: t.onlyInDbml,
        onlyInDatabase: t.onlyInDatabase,
        changed: t.changed.map((c) => ({
          column: c.column,
          differs: c.differs,
          model: c.model.type,
          database: /^ck__/.test(c.database.type)
            ? "<generated check name>"
            : c.database.type,
        })),
      })),
    ).toEqual([
      {
        table: "copy",
        onlyInDbml: [],
        onlyInDatabase: [],
        changed: [
          {
            column: "condition",
            differs: ["type"],
            model: "copy_condition",
            database: "<generated check name>",
          },
        ],
      },
      {
        table: "member",
        onlyInDbml: [],
        onlyInDatabase: [],
        changed: [
          {
            column: "status",
            differs: ["type"],
            model: "membership_status",
            database: "<generated check name>",
          },
        ],
      },
      {
        table: "reservation",
        onlyInDbml: [],
        onlyInDatabase: [],
        changed: [
          {
            column: "expires_at",
            differs: ["type"],
            model: "timestamp",
            database: "datetime2",
          },
          {
            column: "placed_at",
            differs: ["type"],
            model: "timestamp",
            database: "datetime2",
          },
        ],
      },
    ]);

    // The composite unique index on `copy (branch_id, shelf_code)` comes back
    // from the connector as two single-column uniques, which are not an index,
    // so the file's index has nothing to match.
    expect(difference.indexDiffs).toEqual([
      {
        table: "copy",
        onlyInDbml: [{ columns: ["branch_id", "shelf_code"], unique: true }],
        onlyInDatabase: [],
      },
    ]);

    expect(difference.identical).toBe(false);
  });
});
