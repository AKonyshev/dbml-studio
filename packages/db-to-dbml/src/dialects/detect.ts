import { DbImportError, DbImportErrorCode } from "../errors";

import { UNSUPPORTED_CONNECTION } from "./catalog";
import { mssql } from "./mssql";
import { mysql } from "./mysql";
import { postgres } from "./postgres";

import type { Dialect, DialectId } from "./types";

// Ordered; the first dialect that accepts the string owns it.
const DIALECTS: Dialect[] = [postgres, mysql, mssql];

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
