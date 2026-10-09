import type { DbImportError } from "../errors";
import type { DatabaseSchema } from "../types";

export type DialectId = "postgres" | "mysql" | "mssql";

export interface Dialect {
  id: DialectId;
  /** True when this dialect owns the (trimmed) string. Never throws. */
  accepts: (connection: string) => boolean;
  /** Validates and normalises; throws DbImportError(INVALID_CONNECTION_STRING) without echoing the input. */
  normalize: (connection: string) => string;
  withDatabase: (connection: string, database: string) => string;
  databaseOf: (connection: string) => string | undefined;
  defaultSchema: (connection: string) => string;
  listDatabases: (connection: string) => Promise<string[]>;
  listSchemas: (connection: string) => Promise<string[]>;
  fetchSchema: (connection: string) => Promise<DatabaseSchema>;
  toDbImportError: (error: unknown) => DbImportError;
}
