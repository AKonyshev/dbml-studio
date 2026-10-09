import { assertConnectionString, dialectOf } from "../index";
import { DbImportError, DbImportErrorCode } from "../errors";

describe("dialectOf", () => {
  it.each([
    ["postgres://u:p@h:5432/db", "postgres"],
    ["postgresql://u:p@h/db", "postgres"],
    ["POSTGRES://u:p@h/db", "postgres"],
    ["  postgres://u:p@h/db  ", "postgres"],
  ])("%s is %s", (connection, expected) => {
    expect(dialectOf(connection)).toBe(expected);
  });

  it.each([
    "snowflake://acct/db",
    "oracle://u:p@h:1521/xe",
    "localhost:5432",
    "",
  ])("refuses %s without repeating it", (connection) => {
    let thrown: unknown;
    try {
      dialectOf(connection);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DbImportError);
    expect((thrown as DbImportError).code).toBe(
      DbImportErrorCode.INVALID_CONNECTION_STRING,
    );
  });

  it("names every accepted form in its refusal", () => {
    expect(() =>
      assertConnectionString("snowflake://u:Secr3t@acct/db"),
    ).toThrow(/postgres:\/\/.*mysql:\/\/.*sqlserver:\/\//);
    try {
      assertConnectionString("snowflake://u:Secr3t@acct/db");
    } catch (error) {
      expect((error as Error).message).not.toContain("Secr3t");
    }
  });
});
