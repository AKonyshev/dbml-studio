import { fetchSchemaJson } from "@dbml/connector/dist/connectors/mysqlConnector";
import { createConnection } from "mysql2/promise";

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

const MYSQL_URL = /^(mysql|mariadb):\/\//i;

// The databases every MySQL and MariaDB server has and nobody imports.
const SYSTEM_DATABASES = new Set([
  "information_schema",
  "mysql",
  "performance_schema",
  "sys",
]);

const unreadable = (): DbImportError =>
  new DbImportError(
    DbImportErrorCode.INVALID_CONNECTION_STRING,
    "Connection string is not a readable MySQL URL",
  );

// `mysql2` reads only `mysql://`, and so does the connector. MariaDB speaks the
// same protocol, so `mariadb://` is the same string with another name on it —
// the scheme is the only thing that changes, so the rest (credentials, options)
// reaches the driver exactly as the user wrote it.
function rewrite(connection: string): string {
  const trimmed = connection.trim();
  if (!MYSQL_URL.test(trimmed)) {
    throw new DbImportError(
      DbImportErrorCode.INVALID_CONNECTION_STRING,
      UNSUPPORTED_CONNECTION,
    );
  }
  return `mysql://${trimmed.replace(MYSQL_URL, "")}`;
}

// The one place a URL is taken apart. Two things can go wrong, and both carry
// the connection string, password included, in the error they throw: `new URL`
// refuses what its parser cannot read (a password holding a bare `#` or `?`),
// putting the whole string in `error.input`, and `decodeURIComponent` throws a
// URIError on a malformed `%` escape. `mysql2` decodes the user, the password
// and the database itself, so a string it would choke on is refused here, with
// a sentence that does not repeat it. Decoding the pieces here, whether or not
// the caller wants them, is what lets every function below read them safely.
function parse(connection: string): URL {
  const text = rewrite(connection);
  try {
    const url = new URL(text);
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
    decodeURIComponent(url.pathname);
    return url;
  } catch {
    throw unreadable();
  }
}

function normalize(connection: string): string {
  parse(connection);
  return rewrite(connection);
}

function databaseOf(connection: string): string | undefined {
  const path = parse(connection).pathname.slice(1);
  return path === "" ? undefined : decodeURIComponent(path);
}

const CODES: Record<string, DbImportErrorCode> = {
  ER_ACCESS_DENIED_ERROR: DbImportErrorCode.AUTH_FAILED,
  ER_BAD_DB_ERROR: DbImportErrorCode.DATABASE_NOT_FOUND,
  ER_DBACCESS_DENIED_ERROR: DbImportErrorCode.ACCESS_DENIED,
  ER_TABLEACCESS_DENIED_ERROR: DbImportErrorCode.ACCESS_DENIED,
};

// The @dbml/connector MySQL submodule re-throws a connection-phase error as
// `new Error(\`MySQL connection error: ${error.message}\`)`, which drops the
// original `.code`. As with PostgreSQL, we only ever MATCH on that text, never
// echo it: it names the user and the host.
const MESSAGE_PATTERNS: Array<[RegExp, DbImportErrorCode]> = [
  [/Access denied for user .*\(using password/i, DbImportErrorCode.AUTH_FAILED],
  [/Unknown database/i, DbImportErrorCode.DATABASE_NOT_FOUND],
  [/Access denied for user .* to database/i, DbImportErrorCode.ACCESS_DENIED],
];

function toDbImportError(error: unknown): DbImportError {
  if (error instanceof DbImportError) return error;

  const code = (error as { code?: string })?.code;
  if (code !== undefined) {
    const known = CODES[code];
    if (known !== undefined) return dbImportErrorForCode(known);
    if (NETWORK_CODES.has(code)) {
      return dbImportErrorForCode(DbImportErrorCode.UNREACHABLE);
    }
  }
  const message = (error as { message?: string })?.message ?? "";
  return dbImportErrorForCode(inferCodeFromMessage(message, MESSAGE_PATTERNS));
}

// What the connector returns for MySQL. In MySQL a schema is a database, and
// the connector reads one database at a time without saying which: tables,
// enums and the ends of a reference carry no `schemaName`, and the keys of
// `fields`, `indexes` and `tableConstraints` are bare table names. Everything
// downstream addresses a table as `schema.table`, so the database is named here,
// once, and the result has the shape the PostgreSQL connector's has.
interface ConnectorSchema {
  tables?: Array<Record<string, unknown> & { name: string }>;
  enums?: Array<Record<string, unknown> & { name: string }>;
  refs?: Array<{ endpoints: Array<Record<string, unknown>> }>;
  fields?: Record<string, unknown[]>;
  indexes?: Record<string, unknown>;
  tableConstraints?: Record<string, unknown>;
  checks?: Record<string, unknown>;
}

const keyedBy = (
  dict: Record<string, unknown> | undefined,
  database: string,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(dict ?? {}).map(([table, value]) => [
      `${database}.${table}`,
      value,
    ]),
  );

function inDatabase(raw: ConnectorSchema, database: string): DatabaseSchema {
  const enumNames = new Set((raw.enums ?? []).map((e) => e.name));

  // A column typed by an enum names the enum's schema, as PostgreSQL's does.
  // Every other type belongs to no schema.
  const fields = Object.fromEntries(
    Object.entries(raw.fields ?? {}).map(([table, columns]) => [
      `${database}.${table}`,
      columns.map((column) => {
        const type = (column as { type?: { type_name?: string } }).type;
        return type?.type_name !== undefined && enumNames.has(type.type_name)
          ? { ...(column as object), type: { ...type, schemaName: database } }
          : column;
      }),
    ]),
  );

  return {
    tables: (raw.tables ?? []).map((t) => ({ ...t, schemaName: database })),
    enums: (raw.enums ?? []).map((e) => ({ ...e, schemaName: database })),
    refs: (raw.refs ?? []).map((ref) => ({
      ...ref,
      endpoints: ref.endpoints.map((e) => ({
        ...e,
        schemaName: database,
        tableName: e.tableName as string,
      })),
    })),
    fields,
    indexes: keyedBy(raw.indexes, database),
    tableConstraints: keyedBy(raw.tableConstraints, database),
    checks: keyedBy(raw.checks, database),
  };
}

export const mysql: Dialect = {
  id: "mysql",
  accepts: (connection) => MYSQL_URL.test(connection),
  normalize,

  // A saved connection names a server; the database in it is only the entry
  // point, and may be absent altogether. Switching is a path rewrite, and the
  // credentials, the host and every query parameter (`?ssl=` decides whether
  // the connection is encrypted at all) survive it untouched.
  withDatabase: (connection, database) => {
    const url = parse(connection);
    url.pathname = `/${encodeURIComponent(database)}`;
    return url.toString();
  },

  databaseOf,

  // In MySQL a schema is a database, so the default one is whichever the URL
  // names. A URL that names none has no default; the empty string selects
  // nothing, and `fetchSchema` refuses such a URL before it matters.
  defaultSchema: (connection) => databaseOf(connection) ?? "",

  // Server-level on purpose: it works on a URL with no database in it, which is
  // how a saved connection to a server looks before the user picks one.
  listDatabases: async (connection) => {
    // Outside the try on purpose: a bad string is already a DbImportError, and
    // there is no client to close.
    const uri = normalize(connection);

    const client = await createConnection({
      uri,
      connectTimeout: CONNECT_TIMEOUT_MS,
    }).catch((error: unknown) => {
      throw toDbImportError(error);
    });

    try {
      const [rows] = await client.query({
        sql: "SHOW DATABASES",
        timeout: QUERY_TIMEOUT_MS,
      });
      // `SHOW DATABASES` names its column `Database`; the first value of a row
      // is the name without depending on that.
      return (rows as Array<Record<string, string>>)
        .map((row) => Object.values(row)[0])
        .filter((name) => !SYSTEM_DATABASES.has(name.toLowerCase()))
        .sort();
    } catch (error) {
      throw toDbImportError(error);
    } finally {
      // An abandoned tree expansion would otherwise keep the socket open.
      await client.end().catch(() => undefined);
    }
  },

  // A MySQL schema is a database, and the URL names it: there is nothing to ask
  // the server, so this does not connect.
  listSchemas: async (connection) => {
    const database = databaseOf(connection);
    return database === undefined ? [] : [database];
  },

  fetchSchema: async (connection) => {
    const uri = normalize(connection);
    const database = databaseOf(connection);
    if (database === undefined) {
      // The connector reads the one database the connection selects and fails
      // with a message of its own when there is none.
      throw new DbImportError(
        DbImportErrorCode.INVALID_CONNECTION_STRING,
        "A MySQL connection string must name a database to read, e.g. mysql://user:password@host:3306/database",
      );
    }

    try {
      return inDatabase(
        (await fetchSchemaJson(uri)) as unknown as ConnectorSchema,
        database,
      );
    } catch (error) {
      throw toDbImportError(error);
    }
  },

  toDbImportError,
};
