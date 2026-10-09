import { fetchSchemaJson } from "@dbml/connector/dist/connectors/postgresConnector";
import { Client } from "pg";

import {
  DbImportError,
  DbImportErrorCode,
  dbImportErrorForCode,
  inferCodeFromMessage,
} from "../errors";

import {
  CONNECT_TIMEOUT_MS,
  NETWORK_CODES,
  QUERY_TIMEOUT_MS,
  UNSUPPORTED_CONNECTION,
} from "./catalog";

import type { DatabaseSchema } from "../types";
import type { Dialect } from "./types";

const POSTGRES_URL = /^postgres(ql)?:\/\//i;

// `template0`/`template1` are not databases anyone imports, and one that
// refuses connections cannot be read at all — offering either would only
// produce a failure the user has to interpret. Note that this still lists
// databases the user has no rights to: PostgreSQL shows them in the catalogue,
// and finding out costs a connection attempt (see ACCESS_DENIED).
const LIST_DATABASES_SQL = `
  SELECT datname AS name
  FROM pg_database
  WHERE datallowconn AND NOT datistemplate
  ORDER BY datname
`;

// Reads the schemas of whatever database the string points at — pair it with
// `withDatabase` to ask about another one. `pg\_%` covers pg_catalog, pg_toast
// and the per-session pg_temp_N schemas in one pattern; the backslash is the
// LIKE escape character, doubled here for the JavaScript literal.
const LIST_SCHEMAS_SQL = `
  SELECT nspname AS name
  FROM pg_namespace
  WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'
  ORDER BY nspname
`;

// pg reads a connection string with `new URL`, after encoding spaces, and tries
// again with a stand-in host for a socket URL such as postgres://user@/db?host=/tmp.
// A string that fails all of that would fail inside pg as an error that quotes
// it, password and all, so it is refused here instead.
function readable(value: string): boolean {
  const encoded = encodeURI(value).replace(/%25(\d\d)/g, "%$1");
  return [value, encoded, encoded.replace("@/", "@localhost/")].some(
    (candidate) => URL.canParse(candidate),
  );
}

// One guard for every entry point that takes a connection string. It returns
// the trimmed value, so a caller passes on exactly what was validated rather
// than trimming again on its own.
function normalize(value: string): string {
  const trimmed = value.trim();
  if (!POSTGRES_URL.test(trimmed)) {
    throw new DbImportError(
      DbImportErrorCode.INVALID_CONNECTION_STRING,
      UNSUPPORTED_CONNECTION,
    );
  }
  if (!readable(trimmed)) {
    throw new DbImportError(
      DbImportErrorCode.INVALID_CONNECTION_STRING,
      "Connection string is not a readable PostgreSQL URL",
    );
  }
  return trimmed;
}

function parseUrl(connection: string): URL {
  // `new URL` refuses what its own parser cannot read — a password holding a
  // bare `#` or `?`, say — and the TypeError it throws carries the entire
  // connection string, password and all, in `error.input`. Every caller of this
  // function logs what it catches, so that string would land in the Extension
  // Host log; `pg-connection-string` blanks the same field for the same reason.
  // Anything refused here is refused by pg's own parser too, so the string
  // really is invalid: say so, without repeating it back.
  try {
    return new URL(normalize(connection));
  } catch (error) {
    if (error instanceof DbImportError) throw error;
    throw new DbImportError(
      DbImportErrorCode.INVALID_CONNECTION_STRING,
      "Connection string is not a readable PostgreSQL URL",
    );
  }
}

// The cheap half of this package. `@dbml/connector` only knows how to read a
// whole database, which is far too much work to answer "what is in here?" while
// the user is expanding a node in a tree. These queries open their own
// short-lived connection, ask one question, and close it.
async function queryNames(connection: string, sql: string): Promise<string[]> {
  // Outside the try on purpose: a bad string is already a DbImportError, and
  // there is no client to close.
  const client = new Client({
    connectionString: normalize(connection),
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    statement_timeout: QUERY_TIMEOUT_MS,
  });

  try {
    await client.connect();
    const result = await client.query<{ name: string }>(sql);
    return result.rows.map((row) => row.name);
  } catch (error) {
    throw toDbImportError(error);
  } finally {
    // A failed connect leaves nothing to close and `end` says so quietly; a
    // successful one leaves a socket that an abandoned tree expansion would
    // otherwise keep open.
    await client.end().catch(() => undefined);
  }
}

// The @dbml/connector postgres submodule catches connection-phase errors and
// re-throws `new Error(\`PostgreSQL connection error: ${err}\`)`, which drops
// the original `.code`. When that happens we fall back to matching on the
// (still-original, un-redacted-by-us) message text. We only ever MATCH on the
// incoming message here — we never echo/interpolate it into the returned
// error, since it may contain connection details.
const MESSAGE_PATTERNS: Array<[RegExp, DbImportErrorCode]> = [
  [/password authentication failed/i, DbImportErrorCode.AUTH_FAILED],
  [/database .* does not exist/i, DbImportErrorCode.DATABASE_NOT_FOUND],
  [/permission denied for database/i, DbImportErrorCode.ACCESS_DENIED],
];

function toDbImportError(err: unknown): DbImportError {
  if (err instanceof DbImportError) return err;

  const code = (err as { code?: string })?.code;

  switch (code) {
    case "28P01":
      return dbImportErrorForCode(DbImportErrorCode.AUTH_FAILED);
    case "3D000":
      return dbImportErrorForCode(DbImportErrorCode.DATABASE_NOT_FOUND);
    case "42501":
      return dbImportErrorForCode(DbImportErrorCode.ACCESS_DENIED);
    default: {
      if (code !== undefined && NETWORK_CODES.has(code)) {
        return dbImportErrorForCode(DbImportErrorCode.UNREACHABLE);
      }
      const message = (err as { message?: string })?.message ?? "";
      return dbImportErrorForCode(
        inferCodeFromMessage(message, MESSAGE_PATTERNS),
      );
    }
  }
}

export const postgres: Dialect = {
  id: "postgres",
  accepts: (connection) => POSTGRES_URL.test(connection),
  normalize,

  // A saved connection names a server; the database inside it is only the entry
  // point. Switching databases is therefore a path rewrite — and the credentials,
  // the host and every query parameter (`?sslmode=require` decides whether the
  // connection is encrypted at all) have to survive it untouched.
  withDatabase: (connection, database) => {
    const url = parseUrl(connection);
    url.pathname = `/${encodeURIComponent(database)}`;
    return url.toString();
  },

  databaseOf: (connection) => {
    const path = parseUrl(connection).pathname.slice(1);
    if (path === "") return undefined;
    // A malformed `%` escape makes `decodeURIComponent` throw a URIError whose
    // message quotes the offending text; say it in the fixed sentence instead.
    try {
      return decodeURIComponent(path);
    } catch {
      throw new DbImportError(
        DbImportErrorCode.INVALID_CONNECTION_STRING,
        "Connection string is not a readable PostgreSQL URL",
      );
    }
  },

  defaultSchema: () => "public",

  listDatabases: async (connection) =>
    await queryNames(connection, LIST_DATABASES_SQL),

  listSchemas: async (connection) =>
    await queryNames(connection, LIST_SCHEMAS_SQL),

  fetchSchema: async (connection) => {
    const trimmed = normalize(connection);

    try {
      return (await fetchSchemaJson(trimmed)) as unknown as DatabaseSchema;
    } catch (err) {
      throw toDbImportError(err);
    }
  },

  toDbImportError,
};
