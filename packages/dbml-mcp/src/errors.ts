import { DbImportError, DbImportErrorCode } from "db-to-dbml";

export type ErrorCode =
  | "CONNECTION_NOT_FOUND"
  | "PATH_OUTSIDE_ROOT"
  | "NO_ROOT"
  | "FILE_NOT_FOUND"
  | "FILE_EXISTS"
  | "WRITE_FAILED"
  | "INVALID_INPUT"
  | "SCHEMA_NOT_FOUND"
  | "DBML_PARSE_ERROR"
  | "SQL_PARSE_ERROR"
  | DbImportErrorCode;

export class ToolError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

// Our own errors pass through, and db-to-dbml already writes messages that
// never carry the connection string. Anything else that escapes a database
// call is reduced to UNKNOWN without its text, which may quote the URL.
export const fromDbImportError = (error: unknown): ToolError => {
  if (error instanceof ToolError) return error;
  return error instanceof DbImportError
    ? new ToolError(error.code, error.message)
    : new ToolError(DbImportErrorCode.UNKNOWN, "The database call failed.");
};
