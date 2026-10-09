import { DbImportError, DbImportErrorCode } from "db-to-dbml";

import { dbImportErrorMessage } from "../dbImportErrorMessage";

describe("dbImportErrorMessage", () => {
  test("maps AUTH_FAILED to the auth UI string", () => {
    const error = new DbImportError(
      DbImportErrorCode.AUTH_FAILED,
      'password authentication failed for user "foo" host=1.2.3.4 password=hunter2',
    );
    expect(dbImportErrorMessage(error, "fallback")).toBe(
      "Authentication failed. Check the username and password.",
    );
  });

  test("maps INVALID_CONNECTION_STRING to the connection-string UI string", () => {
    const error = new DbImportError(
      DbImportErrorCode.INVALID_CONNECTION_STRING,
      "Connection string must start with postgres://, postgresql://, mysql://, mariadb://, sqlserver:// or mssql://",
    );
    expect(dbImportErrorMessage(error, "fallback")).toBe(
      "Invalid connection string. Check its format, and that it names a database.",
    );
  });

  test("maps UNREACHABLE to the host UI string", () => {
    const error = new DbImportError(
      DbImportErrorCode.UNREACHABLE,
      "connect ECONNREFUSED 127.0.0.1:5432",
    );
    expect(dbImportErrorMessage(error, "fallback")).toBe(
      "Could not reach the database host.",
    );
  });

  test("maps DATABASE_NOT_FOUND to the missing-database UI string", () => {
    const error = new DbImportError(
      DbImportErrorCode.DATABASE_NOT_FOUND,
      'database "foo" does not exist',
    );
    expect(dbImportErrorMessage(error, "fallback")).toBe(
      "The specified database does not exist.",
    );
  });

  test("maps ACCESS_DENIED to the permission UI string", () => {
    const error = new DbImportError(
      DbImportErrorCode.ACCESS_DENIED,
      "Permission denied for this database",
    );
    expect(dbImportErrorMessage(error, "fallback")).toBe(
      "Access to this database is denied.",
    );
  });

  test("uses the caller fallback for UNKNOWN and never echoes error.message", () => {
    const error = new DbImportError(
      DbImportErrorCode.UNKNOWN,
      "boom password=hunter2 host=1.2.3.4",
    );
    const message = dbImportErrorMessage(
      error,
      "Failed to import the schema from the database.",
    );
    expect(message).toBe("Failed to import the schema from the database.");
    expect(message).not.toMatch(/hunter2|1\.2\.3\.4|boom/);
  });
});
