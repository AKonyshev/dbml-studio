import { DbImportError, DbImportErrorCode } from "../errors";

import { UNSUPPORTED_CONNECTION } from "./catalog";
import { postgres } from "./postgres";

import type { Dialect, DialectId } from "./types";

// Ordered; the first dialect that accepts the string owns it. Tasks 3 and 4
// add mysql and mssql here.
const DIALECTS: Dialect[] = [postgres];

export { UNSUPPORTED_CONNECTION };

export function dialectFor(connection: string): Dialect {
  const trimmed = connection.trim();
  const dialect = DIALECTS.find((d) => d.accepts(trimmed));
  if (dialect === undefined) {
    throw new DbImportError(
      DbImportErrorCode.INVALID_CONNECTION_STRING,
      UNSUPPORTED_CONNECTION,
    );
  }
  return dialect;
}

export const dialectOf = (connection: string): DialectId =>
  dialectFor(connection).id;
