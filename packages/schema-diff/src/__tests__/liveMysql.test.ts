import { readFileSync } from "fs";
import { resolve } from "path";

import { fetchSchema, schemaToDbml } from "db-to-dbml";

import { databaseSchemaToModel } from "../databaseSchemaToModel";
import { diffSchemas } from "../diffSchemas";
import { parseDbmlToModel } from "../parseDbmlToModel";

/**
 * A MySQL database read, written out as DBML, and compared with itself.
 *
 * It is the check that no step in between invents a difference: the connector
 * reports MySQL types in MySQL's own spelling (`int`, `varchar(16)`), names no
 * schema for the tables, and generates an enum per ENUM column. If any of that
 * were canonicalised differently on the file side and the database side, a file
 * that matches would come back with differences nobody can act on.
 *
 * Skipped unless `DBML_TEST_MYSQL_URL` is set; `docs/testing.md` says how to
 * raise a database to run it against.
 */
const url = process.env.DBML_TEST_MYSQL_URL;
const describeLive = url === undefined ? describe.skip : describe;
// Narrowed once. Nothing below runs unless the variable is set, which is a
// guarantee `describe.skip` gives and the type system does not see.
const connection = url as unknown as string;

const LIBRARY_EXAMPLE = resolve(__dirname, "../../../../examples/library.dbml");

describeLive("against a real MySQL", () => {
  jest.setTimeout(30_000);

  it("finds nothing to report between a database and the DBML read from it", async () => {
    const db = await fetchSchema(connection);
    const live = databaseSchemaToModel(db, "library");
    const fromFile = parseDbmlToModel(schemaToDbml(db, ["library"]).dbml);

    expect(live.tables.size).toBe(7);
    expect(diffSchemas(fromFile, live).identical).toBe(true);
  });

  it("reports a column the file has and the database does not", async () => {
    const db = await fetchSchema(connection);
    const live = databaseSchemaToModel(db, "library");
    const dbml = schemaToDbml(db, ["library"]).dbml.replace(
      '"closed_on" date',
      '"closed_on" date\n  "phone" varchar(32)',
    );

    const difference = diffSchemas(parseDbmlToModel(dbml), live);

    expect(difference.identical).toBe(false);
    expect(JSON.stringify(difference)).toContain("phone");
  });

  it("finds nothing to report between the hand-written library file and the database", async () => {
    const live = databaseSchemaToModel(
      await fetchSchema(connection),
      "library",
    );
    const file = parseDbmlToModel(readFileSync(LIBRARY_EXAMPLE, "utf8"));

    // The file names its enums (`membership_status`) and declares no index for
    // a foreign key; MySQL names its enums `<table>_<column>_enum` and indexes
    // every foreign key itself. Both are MySQL's doing, and the dialect is what
    // lets a file that matches come back clean.
    expect(diffSchemas(file, live, { dialect: "mysql" }).identical).toBe(true);

    const withoutDialect = diffSchemas(file, live);
    expect(withoutDialect.enumsOnlyInDbml).toEqual([
      "copy_condition",
      "membership_status",
    ]);
    expect(withoutDialect.indexDiffs.length).toBeGreaterThan(0);
  });
});
