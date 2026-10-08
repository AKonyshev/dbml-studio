import { readFile } from "node:fs/promises";

import { dbmlToSql } from "../tools/dbmlToSql";
import { sqlToDbml } from "../tools/sqlToDbml";

import { codeOf, LIBRARY_DBML, makeContext } from "./helpers";

describe("dbml_to_sql", () => {
  it("exports postgres DDL", async () => {
    const result = await dbmlToSql.run(
      { text: LIBRARY_DBML, dialect: "postgres", overwrite: false },
      await makeContext(),
    );
    expect(result.text).toContain('CREATE TABLE "member"');
    expect(result.structured).toEqual({
      dialect: "postgres",
      outputPath: undefined,
    });
  });

  it("writes to outputPath and answers with a summary", async () => {
    const ctx = await makeContext();
    const result = await dbmlToSql.run(
      {
        text: LIBRARY_DBML,
        dialect: "mysql",
        outputPath: "sql/library.sql",
        overwrite: false,
      },
      ctx,
    );
    expect(result.text).not.toContain("CREATE TABLE");
    expect(result.text).toContain("sql/library.sql");
    const written = result.structured.outputPath;
    if (written === undefined) throw new Error("outputPath was not reported");
    expect(await readFile(written, "utf8")).toContain("CREATE TABLE");
  });

  it("refuses DBML that does not parse", async () => {
    expect(
      await codeOf(
        dbmlToSql.run(
          { text: "Table {", dialect: "postgres", overwrite: false },
          await makeContext(),
        ),
      ),
    ).toBe("DBML_PARSE_ERROR");
  });

  it("offers exactly the four export dialects", () => {
    expect(dbmlToSql.inputSchema.shape.dialect.options).toEqual([
      "postgres",
      "mysql",
      "mssql",
      "oracle",
    ]);
  });
});

describe("sql_to_dbml", () => {
  it("imports postgres DDL", async () => {
    const result = await sqlToDbml.run(
      {
        text: "CREATE TABLE member (id integer PRIMARY KEY, name varchar(80) NOT NULL);",
        dialect: "postgres",
        overwrite: false,
      },
      await makeContext(),
    );
    expect(result.text).toContain("Table");
    expect(result.text).toContain("member");
  });

  it("names the line of SQL it cannot parse", async () => {
    expect.assertions(2);
    try {
      await sqlToDbml.run(
        {
          text: "CREATE TABL member ();",
          dialect: "postgres",
          overwrite: false,
        },
        await makeContext(),
      );
    } catch (error) {
      expect((error as { code: string }).code).toBe("SQL_PARSE_ERROR");
      expect((error as Error).message).toContain("line 1");
    }
  });

  it("offers the five import dialects", () => {
    expect(sqlToDbml.inputSchema.shape.dialect.options).toEqual([
      "postgres",
      "mysql",
      "mssql",
      "oracle",
      "snowflake",
    ]);
  });
});
