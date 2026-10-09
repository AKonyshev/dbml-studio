export enum DbImportErrorCode {
  INVALID_CONNECTION_STRING = "INVALID_CONNECTION_STRING",
  AUTH_FAILED = "AUTH_FAILED",
  UNREACHABLE = "UNREACHABLE",
  DATABASE_NOT_FOUND = "DATABASE_NOT_FOUND",
  ACCESS_DENIED = "ACCESS_DENIED",
  UNKNOWN = "UNKNOWN",
}

export class DbImportError extends Error {
  public readonly code: DbImportErrorCode;

  constructor(code: DbImportErrorCode, message: string) {
    super(message);
    this.name = "DbImportError";
    this.code = code;
  }
}

// A connector that wraps the driver's error keeps only its message; each
// dialect lists the phrases its driver uses. Only matched, never echoed.
export function inferCodeFromMessage(
  message: string,
  patterns: Array<[RegExp, DbImportErrorCode]>,
): DbImportErrorCode {
  for (const [pattern, code] of patterns)
    if (pattern.test(message)) return code;
  if (
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|getaddrinfo/i.test(message)
  ) {
    return DbImportErrorCode.UNREACHABLE;
  }
  return DbImportErrorCode.UNKNOWN;
}

export function dbImportErrorForCode(code: DbImportErrorCode): DbImportError {
  switch (code) {
    case DbImportErrorCode.AUTH_FAILED:
      return new DbImportError(
        DbImportErrorCode.AUTH_FAILED,
        "Authentication failed",
      );
    case DbImportErrorCode.DATABASE_NOT_FOUND:
      return new DbImportError(
        DbImportErrorCode.DATABASE_NOT_FOUND,
        "Database does not exist",
      );
    case DbImportErrorCode.UNREACHABLE:
      return new DbImportError(
        DbImportErrorCode.UNREACHABLE,
        "Could not reach the database host",
      );
    case DbImportErrorCode.ACCESS_DENIED:
      return new DbImportError(
        DbImportErrorCode.ACCESS_DENIED,
        "Permission denied for this database",
      );
    default:
      return new DbImportError(
        DbImportErrorCode.UNKNOWN,
        "Failed to import schema from the database",
      );
  }
}

// Errors that reach callers without a connection to tell their dialect apart
// (they are already DbImportErrors, or something unexpected) pass through or
// become UNKNOWN. Dialect-aware mapping happens inside each adapter. This lives
// here rather than in a module of its own: an adapter imports `errors.ts`, so a
// re-export from the adapters' side would make the two import each other.
export function toDbImportError(err: unknown): DbImportError {
  return err instanceof DbImportError
    ? err
    : dbImportErrorForCode(DbImportErrorCode.UNKNOWN);
}
