import { postgres } from "../dialects/postgres";
import {
  DbImportError,
  DbImportErrorCode,
  toDbImportError as genericToDbImportError,
} from "../errors";

// The mapping is the dialect's own; the module-level `toDbImportError` only
// passes a DbImportError through.
const toDbImportError = postgres.toDbImportError;

describe("toDbImportError", () => {
  test("maps postgres auth failure 28P01", () => {
    const e = toDbImportError({
      code: "28P01",
      message: "password authentication failed",
    });
    expect(e).toBeInstanceOf(DbImportError);
    expect(e.code).toBe(DbImportErrorCode.AUTH_FAILED);
  });

  test("maps unreachable host codes", () => {
    for (const code of ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"]) {
      expect(toDbImportError({ code }).code).toBe(
        DbImportErrorCode.UNREACHABLE,
      );
    }
  });

  test("maps missing database 3D000", () => {
    expect(toDbImportError({ code: "3D000" }).code).toBe(
      DbImportErrorCode.DATABASE_NOT_FOUND,
    );
  });

  test("falls back to UNKNOWN", () => {
    expect(toDbImportError(new Error("boom")).code).toBe(
      DbImportErrorCode.UNKNOWN,
    );
  });

  describe("connector-wrapped errors (no .code, message only)", () => {
    // The installed @dbml/connector postgres submodule catches connection-phase
    // errors and re-throws `new Error(\`PostgreSQL connection error: ${err}\`)`,
    // which drops the original `.code`. These cases reproduce the REAL wrapped
    // shapes so the message-based fallback matching is honestly tested.

    test("maps wrapped bad-password message to AUTH_FAILED", () => {
      const wrapped = new Error(
        'PostgreSQL connection error: error: password authentication failed for user "foo"',
      );
      const e = toDbImportError(wrapped);
      expect(e.code).toBe(DbImportErrorCode.AUTH_FAILED);
    });

    test("maps wrapped ECONNREFUSED message to UNREACHABLE", () => {
      const wrapped = new Error(
        "PostgreSQL connection error: Error: connect ECONNREFUSED 127.0.0.1:5432",
      );
      expect(toDbImportError(wrapped).code).toBe(DbImportErrorCode.UNREACHABLE);
    });

    test("maps wrapped ETIMEDOUT message to UNREACHABLE", () => {
      const wrapped = new Error(
        "PostgreSQL connection error: Error: connect ETIMEDOUT 10.0.0.1:5432",
      );
      expect(toDbImportError(wrapped).code).toBe(DbImportErrorCode.UNREACHABLE);
    });

    test("maps wrapped getaddrinfo ENOTFOUND message to UNREACHABLE", () => {
      const wrapped = new Error(
        "PostgreSQL connection error: Error: getaddrinfo ENOTFOUND badhost.example.com",
      );
      expect(toDbImportError(wrapped).code).toBe(DbImportErrorCode.UNREACHABLE);
    });

    test("maps wrapped missing-database message to DATABASE_NOT_FOUND", () => {
      const wrapped = new Error(
        'PostgreSQL connection error: error: database "foo" does not exist',
      );
      expect(toDbImportError(wrapped).code).toBe(
        DbImportErrorCode.DATABASE_NOT_FOUND,
      );
    });

    test("never echoes the original wrapped message into the returned error", () => {
      const wrapped = new Error(
        'PostgreSQL connection error: error: password authentication failed for user "foo" host=1.2.3.4 password=hunter2',
      );
      const e = toDbImportError(wrapped);
      expect(e.message).not.toMatch(/hunter2|1\.2\.3\.4|foo/);
      expect(e.message).toBe("Authentication failed");
    });
  });

  test("maps insufficient privilege 42501", () => {
    expect(toDbImportError({ code: "42501" }).code).toBe(
      DbImportErrorCode.ACCESS_DENIED,
    );
  });

  test("maps a permission-denied message when the driver dropped the code", () => {
    const e = toDbImportError(
      new Error('permission denied for database "billing"'),
    );
    expect(e.code).toBe(DbImportErrorCode.ACCESS_DENIED);
    // The database name came from the server's message; it must not travel on.
    expect(e.message).not.toContain("billing");
  });

  test("passing a DbImportError through is unchanged", () => {
    const original = new DbImportError(
      DbImportErrorCode.INVALID_CONNECTION_STRING,
      "bad",
    );
    expect(toDbImportError(original)).toBe(original);
  });
});

describe("toDbImportError without a dialect", () => {
  test("passes a DbImportError through and makes UNKNOWN of anything else", () => {
    const original = new DbImportError(DbImportErrorCode.AUTH_FAILED, "bad");
    expect(genericToDbImportError(original)).toBe(original);
    expect(genericToDbImportError({ code: "28P01" }).code).toBe(
      DbImportErrorCode.UNKNOWN,
    );
  });
});
