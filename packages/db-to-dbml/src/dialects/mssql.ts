import { fetchSchemaJson } from "@dbml/connector/dist/connectors/mssqlConnector";
// `mssql` ships no types, and `@types/mssql` would bring a second `tedious`
// into the install for the sake of four members, which are described below. A
// declaration file would have to be found by every program that compiles this
// adapter (the extension's, the MCP server's, the diff's), and one of them
// reads every file as a module, where an ambient declaration is refused.
// @ts-expect-error TS7016: no declaration file for module "mssql"
import driver from "mssql";

import {
  DbImportError,
  DbImportErrorCode,
  dbImportErrorForCode,
  inferCodeFromMessage,
} from "../errors";

import { formatAdo, parseAdo } from "./ado";
import {
  CONNECT_TIMEOUT_MS,
  NETWORK_CODES,
  QUERY_TIMEOUT_MS,
  UNSUPPORTED_CONNECTION,
} from "./catalog";

import type { DatabaseSchema } from "../types";
import type { Dialect } from "./types";

interface Pool {
  connect: () => Promise<Pool>;
  request: () => {
    query: <Row>(text: string) => Promise<{ recordset: Row[] }>;
  };
  close: () => Promise<void>;
}

const sql = driver as {
  ConnectionPool: new (config: string) => Pool;
  // Closes the driver's global pool, the one the connector connects with.
  close: () => Promise<void>;
};

const MSSQL_URL = /^(sqlserver|mssql):\/\//i;

// What makes a string an ADO connection string rather than something else.
// `Addr` and `Network Address` are valid spellings too, but a string that has
// only those is not worth claiming from the other dialects' refusal.
const ADO_SERVER = /(^|;)\s*(server|data source|address)\s*=/i;

// Every spelling of the server and the database a connection string may use;
// they are folded into `server` and `database` so the rest of this file, and
// anything that overrides a value, deals with one key each.
const SERVER_KEYS = [
  "server",
  "data source",
  "address",
  "addr",
  "network address",
];
const DATABASE_KEYS = ["database", "initial catalog"];
const CONNECT_TIMEOUT_KEYS = [
  "connect timeout",
  "connection timeout",
  "timeout",
];
const REQUEST_TIMEOUT_KEYS = ["request timeout"];

// The options a URL can carry, by the name they have in an ADO string.
const URL_OPTIONS: Record<string, string> = {
  encrypt: "encrypt",
  trustservercertificate: "trustservercertificate",
  applicationname: "application name",
};

const unreadable = (): DbImportError =>
  new DbImportError(
    DbImportErrorCode.INVALID_CONNECTION_STRING,
    "Connection string is not a readable SQL Server connection string",
  );

// A connection is held as an ADO map, the grammar `mssql` and the connector
// read, whichever form the user wrote.
//
// Everything that can go wrong in taking a URL apart goes wrong here, inside
// one `try`, and comes out as a fixed sentence: `new URL` refuses what it
// cannot read (a password holding a bare `#`, say) and puts the whole string,
// password included, in the error it throws; `decodeURIComponent` throws a
// URIError on a malformed `%` escape. Neither may reach a caller.
function fromUrl(text: string): Map<string, string> {
  try {
    const url = new URL(text.replace(/^(sqlserver|mssql):/i, "mssql:"));
    // IPv6 hosts come bracketed; the driver wants them bare.
    const host = decodeURIComponent(url.hostname).replace(/^\[(.*)\]$/, "$1");
    if (host === "") throw unreadable();

    let instance: string | undefined;
    const options = new Map<string, string>();
    for (const [key, value] of url.searchParams) {
      const name = key.toLowerCase();
      if (name === "instancename") instance = value;
      else if (URL_OPTIONS[name] !== undefined) {
        options.set(URL_OPTIONS[name], value);
      }
    }

    // `host\instance,port`: the form ADO strings use for both at once.
    const server = `${host}${instance !== undefined && instance !== "" ? `\\${instance}` : ""}${url.port !== "" ? `,${url.port}` : ""}`;

    const map = new Map<string, string>([["server", server]]);
    const database = decodeURIComponent(url.pathname.slice(1));
    if (database !== "") map.set("database", database);
    const user = decodeURIComponent(url.username);
    if (user !== "") map.set("user id", user);
    const password = decodeURIComponent(url.password);
    if (password !== "") map.set("password", password);
    map.set("encrypt", "true");
    for (const [key, value] of options) map.set(key, value);
    return map;
  } catch {
    throw unreadable();
  }
}

function fromAdo(text: string): Map<string, string> {
  const map = parseAdo(text);
  const serverKey = SERVER_KEYS.find((key) => map.has(key));
  const server = serverKey === undefined ? "" : (map.get(serverKey) ?? "");
  if (server === "") throw unreadable();
  for (const key of SERVER_KEYS) map.delete(key);
  map.set("server", server);

  const databaseKey = DATABASE_KEYS.find((key) => map.has(key));
  if (databaseKey !== undefined) {
    const database = map.get(databaseKey) ?? "";
    for (const key of DATABASE_KEYS) map.delete(key);
    map.set("database", database);
  }
  return map;
}

function toAdo(connection: string): Map<string, string> {
  const trimmed = connection.trim();
  if (MSSQL_URL.test(trimmed)) return fromUrl(trimmed);
  if (ADO_SERVER.test(trimmed)) return fromAdo(trimmed);
  throw new DbImportError(
    DbImportErrorCode.INVALID_CONNECTION_STRING,
    UNSUPPORTED_CONNECTION,
  );
}

const hasAny = (map: Map<string, string>, keys: string[]): boolean =>
  keys.some((key) => map.has(key));

const replaceKeys = (
  map: Map<string, string>,
  keys: string[],
  name: string,
  value: string,
): void => {
  for (const key of keys) map.delete(key);
  map.set(name, value);
};

// Expanding a tree node must not be able to hang, so a catalogue query sets its
// own bounds whatever the string says. `connect timeout` is in seconds and
// `request timeout` in milliseconds, as the driver reads them.
function bounded(map: Map<string, string>): string {
  replaceKeys(
    map,
    CONNECT_TIMEOUT_KEYS,
    "connect timeout",
    String(CONNECT_TIMEOUT_MS / 1000),
  );
  replaceKeys(
    map,
    REQUEST_TIMEOUT_KEYS,
    "request timeout",
    String(QUERY_TIMEOUT_MS),
  );
  return formatAdo(map);
}

// Reading a whole schema is allowed to be configured, since a large catalogue
// is slower than a name list; what it may not be is unbounded by default. The
// driver's own defaults happen to be 15 s, but this does not lean on that.
function boundedByDefault(map: Map<string, string>): string {
  if (!hasAny(map, CONNECT_TIMEOUT_KEYS)) {
    map.set("connect timeout", String(CONNECT_TIMEOUT_MS / 1000));
  }
  if (!hasAny(map, REQUEST_TIMEOUT_KEYS)) {
    map.set("request timeout", String(QUERY_TIMEOUT_MS));
  }
  return formatAdo(map);
}

// SQL Server reports 4060 both for a database that does not exist and for one
// the login may not open. It is mapped to DATABASE_NOT_FOUND, the more common
// case; the message the driver adds is matched, never repeated.
const CODES_BY_NUMBER: Record<number, DbImportErrorCode> = {
  18456: DbImportErrorCode.AUTH_FAILED,
  4060: DbImportErrorCode.DATABASE_NOT_FOUND,
  229: DbImportErrorCode.ACCESS_DENIED,
  230: DbImportErrorCode.ACCESS_DENIED,
  916: DbImportErrorCode.ACCESS_DENIED,
};

// The connector re-throws a connection-phase error as
// `new Error(\`SQL connection error: ${error.message}\`)`, which drops the
// driver's `.code` and `.number`. As elsewhere we only ever MATCH on that text,
// never echo it: it names the login and the host.
const MESSAGE_PATTERNS: Array<[RegExp, DbImportErrorCode]> = [
  [/Cannot open database/i, DbImportErrorCode.DATABASE_NOT_FOUND],
  [/Login failed for user/i, DbImportErrorCode.AUTH_FAILED],
  [
    /permission was denied|is not able to access the database/i,
    DbImportErrorCode.ACCESS_DENIED,
  ],
  [/Failed to connect to/i, DbImportErrorCode.UNREACHABLE],
];

interface DriverError {
  code?: string;
  number?: number;
  message?: string;
  originalError?: { number?: number; info?: { number?: number } };
}

function toDbImportError(error: unknown): DbImportError {
  if (error instanceof DbImportError) return error;

  const e = (error ?? {}) as DriverError;
  const number =
    e.number ?? e.originalError?.number ?? e.originalError?.info?.number;
  if (
    number !== undefined &&
    Object.prototype.hasOwnProperty.call(CODES_BY_NUMBER, number)
  ) {
    return dbImportErrorForCode(CODES_BY_NUMBER[number]);
  }
  if (e.code !== undefined && NETWORK_CODES.has(e.code)) {
    return dbImportErrorForCode(DbImportErrorCode.UNREACHABLE);
  }
  return dbImportErrorForCode(
    inferCodeFromMessage(
      typeof e.message === "string" ? e.message : "",
      MESSAGE_PATTERNS,
    ),
  );
}

const DATABASES_SQL = `
  SELECT name FROM sys.databases
  WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb') AND state_desc = 'ONLINE'
  ORDER BY name`;

// Reads the schemas of whatever database the string points at; the fixed roles
// (`db_owner`, ...) each own a schema, and nobody imports from them.
const SCHEMAS_SQL = `
  SELECT name FROM sys.schemas
  WHERE name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest') AND name NOT LIKE 'db[_]%'
  ORDER BY name`;

// `close` waits for the connections the pool lent out, and after a timeout the
// request that timed out may still be holding one. Awaiting it on a failure
// path would hold the caller for as long as that takes, which is what the
// timeout is there to prevent: it is started, and its outcome is nobody's
// business. It can throw before it returns a promise, so it starts from a
// `then`.
function closeInBackground(close: () => Promise<unknown>): void {
  void Promise.resolve()
    .then(async () => {
      await close();
    })
    .catch(() => undefined);
}

async function queryNames(connection: string, text: string): Promise<string[]> {
  // Outside the try on purpose: a bad string is already a DbImportError, and
  // there is no pool to close.
  const config = bounded(toAdo(connection));

  // A pool of its own for each call: the driver's global one is shared by
  // whoever connects next, with whatever string.
  let pool: Pool;
  try {
    // The constructor parses the string, and throws from it synchronously.
    pool = await new sql.ConnectionPool(config).connect();
  } catch (error) {
    throw toDbImportError(error);
  }

  let succeeded = false;
  try {
    const result = await pool.request().query<{ name: string }>(text);
    const names = result.recordset.map((row) => row.name);
    succeeded = true;
    // An abandoned tree expansion would otherwise keep the sockets open.
    await Promise.resolve()
      .then(async () => {
        await pool.close();
      })
      .catch(() => undefined);
    return names;
  } catch (error) {
    throw toDbImportError(error);
  } finally {
    if (!succeeded)
      closeInBackground(async () => {
        await pool.close();
      });
  }
}

// The connector connects through the driver's one global pool: a second
// `connect` with another string silently shares the first, and the first read
// to finish closes it under the other. Reads therefore take turns.
let reading: Promise<unknown> = Promise.resolve();
async function exclusively<T>(run: () => Promise<T>): Promise<T> {
  const turn = reading.then(run, run);
  reading = turn.catch(() => undefined);
  return await turn;
}

export const mssql: Dialect = {
  id: "mssql",
  accepts: (connection) =>
    MSSQL_URL.test(connection) || ADO_SERVER.test(connection),

  // Both forms come out as the ADO string, which is what `mssql` and the
  // connector read.
  normalize: (connection) => formatAdo(toAdo(connection)),

  withDatabase: (connection, database) => {
    const map = toAdo(connection);
    replaceKeys(map, DATABASE_KEYS, "database", database);
    return formatAdo(map);
  },

  databaseOf: (connection) => {
    const database = toAdo(connection).get("database");
    return database === undefined || database === "" ? undefined : database;
  },

  defaultSchema: () => "dbo",

  listDatabases: async (connection) =>
    await queryNames(connection, DATABASES_SQL),
  listSchemas: async (connection) => await queryNames(connection, SCHEMAS_SQL),

  // The connector's output already names the schema of every table, enum and
  // reference end, and keys `fields`, `indexes` and `tableConstraints` by
  // `<schema>.<table>`, so it needs no reshaping.
  fetchSchema: async (connection) => {
    const config = boundedByDefault(toAdo(connection));

    return await exclusively(async () => {
      try {
        return (await fetchSchemaJson(config)) as unknown as DatabaseSchema;
      } catch (error) {
        // A read that fails part-way leaves the global pool open, and the next
        // read would be handed it.
        closeInBackground(async () => {
          await sql.close();
        });
        throw toDbImportError(error);
      }
    });
  },

  toDbImportError,
};
