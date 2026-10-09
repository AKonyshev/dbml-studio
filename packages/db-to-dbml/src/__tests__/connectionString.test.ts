import { assertConnectionString, withDatabase } from "../connectionString";
import { postgres } from "../dialects/postgres";
import { DbImportError, DbImportErrorCode } from "../errors";

describe("assertConnectionString", () => {
  test("returns the trimmed string for both accepted schemes", () => {
    expect(assertConnectionString("  postgres://u:p@h/db  ")).toBe(
      "postgres://u:p@h/db",
    );
    expect(assertConnectionString("postgresql://u:p@h/db")).toBe(
      "postgresql://u:p@h/db",
    );
  });

  test("rejects anything else as INVALID_CONNECTION_STRING", () => {
    try {
      assertConnectionString("snowflake://u:p@h/db");
      throw new Error("expected a DbImportError");
    } catch (error) {
      expect(error).toBeInstanceOf(DbImportError);
      expect((error as DbImportError).code).toBe(
        DbImportErrorCode.INVALID_CONNECTION_STRING,
      );
    }
  });
});

describe("assertConnectionString on a PostgreSQL URL", () => {
  test.each([
    "postgres://u:Pa55@h/db",
    "postgresql://u:p%40x@h:5432/db?sslmode=require",
    "postgres://u@/library?host=/tmp",
    "postgresql://u:Pa55@local host/db",
  ])("accepts %s", (url) => {
    expect(assertConnectionString(url)).toBe(url);
  });

  test.each([
    "postgresql://u:WRONG PW@local host:x/db",
    "postgres://u:Pa55#w0rd@h:x/db",
  ])("refuses %s by code and a fixed sentence, without echoing it", (url) => {
    expect.assertions(4);
    try {
      assertConnectionString(url);
    } catch (error) {
      expect(error).toBeInstanceOf(DbImportError);
      expect((error as DbImportError).code).toBe(
        DbImportErrorCode.INVALID_CONNECTION_STRING,
      );
      expect((error as DbImportError).message).toBe(
        "Connection string is not a readable PostgreSQL URL",
      );
      expect(JSON.stringify(error)).not.toMatch(/WRONG|Pa55/);
    }
  });
});

describe("withDatabase", () => {
  test("replaces the database and keeps the query string", () => {
    expect(
      withDatabase("postgres://u:p@h:5432/entry?sslmode=require", "orders"),
    ).toBe("postgres://u:p@h:5432/orders?sslmode=require");
  });

  test("adds a database to a string that names none", () => {
    expect(withDatabase("postgres://u:p@h:5432", "orders")).toBe(
      "postgres://u:p@h:5432/orders",
    );
  });

  test("percent-encodes a database name that needs it", () => {
    expect(withDatabase("postgres://u:p@h/entry", "my db")).toBe(
      "postgres://u:p@h/my%20db",
    );
    // A slash in a name must not become a second path segment.
    expect(withDatabase("postgres://u:p@h/entry", "a/b")).toBe(
      "postgres://u:p@h/a%2Fb",
    );
  });

  test("leaves the credentials untouched", () => {
    expect(withDatabase("postgresql://u:p%40x@h/entry", "orders")).toBe(
      "postgresql://u:p%40x@h/orders",
    );
  });

  test("rejects an unsupported string before rewriting anything", () => {
    expect(() => withDatabase("snowflake://u:p@h/db", "orders")).toThrow(
      DbImportError,
    );
  });

  test("reports a string the URL parser cannot read without quoting it", () => {
    // A bare `#` in the password: `new URL` throws a TypeError carrying the
    // whole string in `error.input`, and every caller of withDatabase logs what
    // it catches. Nothing about the password may survive the translation.
    const secret = "postgres://u:p#assw0rd@h:5432/entry";

    try {
      withDatabase(secret, "orders");
      throw new Error("expected a DbImportError");
    } catch (error) {
      expect(error).toBeInstanceOf(DbImportError);
      expect((error as DbImportError).code).toBe(
        DbImportErrorCode.INVALID_CONNECTION_STRING,
      );
      expect(JSON.stringify(error)).not.toContain("assw0rd");
      expect((error as DbImportError).message).not.toContain("assw0rd");
      expect(error).not.toHaveProperty("input");
    }
  });
});

describe("postgres databaseOf", () => {
  test("decodes the database name and reports none for an empty path", () => {
    expect(postgres.databaseOf("postgres://u:p@h/my%20db")).toBe("my db");
    expect(postgres.databaseOf("postgres://u:p@h")).toBeUndefined();
    expect(postgres.databaseOf("postgres://u:p@h/")).toBeUndefined();
  });

  test("refuses a malformed % escape with the fixed sentence, never the input", () => {
    const secret = "postgres://u:sEcr3t@h/db%ZZ";

    try {
      postgres.databaseOf(secret);
      throw new Error("expected a DbImportError");
    } catch (error) {
      expect(error).toBeInstanceOf(DbImportError);
      expect((error as DbImportError).code).toBe(
        DbImportErrorCode.INVALID_CONNECTION_STRING,
      );
      expect((error as DbImportError).message).toBe(
        "Connection string is not a readable PostgreSQL URL",
      );
      expect(JSON.stringify(error)).not.toContain("sEcr3t");
      expect(JSON.stringify(error)).not.toContain("%ZZ");
    }
  });
});
