import {
  assertConnectionString,
  DbImportError,
  DbImportErrorCode,
  dialectOf,
  parseAdo,
  UNREADABLE_CONNECTION,
  type DialectId,
} from "db-to-dbml";

import { emptyFields, type ConnectionFields } from "./connectionFields";

// The two directions between the form's fields and the one string that is
// stored. This is the Node side: it reads db-to-dbml's runtime, which the
// webview must not import (see connectionFields.ts for what it may).

export interface ParsedConnection {
  fields: Omit<ConnectionFields, "name">;
  password: string;
  // Parameters that hold a secret ("k=v&…"), kept out of the fields so the form
  // never receives them and handed back to `buildConnection` untouched.
  hiddenOptions: string;
}

// The same sentences db-to-dbml refuses an unreadable string with: they never
// repeat the input, which holds a password.
const unreadable = (dialect: DialectId): DbImportError =>
  new DbImportError(
    DbImportErrorCode.INVALID_CONNECTION_STRING,
    UNREADABLE_CONNECTION[dialect],
  );

const SCHEME: Record<DialectId, string> = {
  postgres: "postgresql",
  mysql: "mysql",
  mssql: "sqlserver",
};

// `Encrypt` is read as the driver reads it: off only when it says so (`strict`
// and `mandatory` are on). The certificate flag is on only when it says so.
const encryptOn = (value: string): boolean =>
  value.trim() === "" ||
  !["false", "no", "0", "optional"].includes(value.trim().toLowerCase());
const trustOn = (value: string): boolean =>
  ["true", "yes", "1"].includes(value.trim().toLowerCase());

// Query text as the drivers read it (URLSearchParams): `+` is a space. Used for
// classifying keys and lifting the password; the options themselves stay as
// written.
const queryDecode = (value: string): string =>
  decodeURIComponent(value.replace(/\+/g, " "));

const safeDecode = (value: string): string => {
  try {
    return queryDecode(value);
  } catch {
    return value;
  }
};

// Keys compare lower-cased and without spaces, the way `Client Secret` and
// `clientsecret` are one key.
const keyOf = (pair: string): string => {
  const eq = pair.indexOf("=");
  return safeDecode(eq === -1 ? pair : pair.slice(0, eq))
    .toLowerCase()
    .replace(/\s/g, "");
};

const PASSWORD_KEYS = new Set(["password", "pwd"]);
const SECRET_KEYS = new Set([
  "password1",
  "password2",
  "password3",
  "passwordsha1",
  "clientsecret",
  "token",
  "accesstoken",
  "msisecret",
]);
// The SQL Server keys that have a field, and so are not written from `options`.
const MSSQL_FIELD_KEYS = new Set([
  "instancename",
  "encrypt",
  "trustservercertificate",
]);

const SERVER_KEYS = [
  "server",
  "data source",
  "address",
  "addr",
  "network address",
];
const DATABASE_KEYS = ["database", "initial catalog"];
// Read into fields (or the password) and so not part of `options`.
const ADO_FIELD_KEYS = new Set([
  ...SERVER_KEYS,
  ...DATABASE_KEYS,
  "user id",
  "uid",
  "password",
  "pwd",
  "encrypt",
  "trustservercertificate",
]);

const firstOf = (map: Map<string, string>, keys: string[]): string =>
  map.get(keys.find((key) => map.has(key)) ?? "") ?? "";

export function parseConnection(text: string): ParsedConnection {
  const trimmed = text.trim();
  // Both throw the fixed INVALID_CONNECTION_STRING sentence.
  const dialect = dialectOf(trimmed);
  assertConnectionString(trimmed);
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? fromUrl(trimmed, dialect)
    : fromAdo(trimmed);
}

// `new URL` puts the whole string, password included, in the error it throws,
// and `decodeURIComponent` throws on a malformed escape: anything that goes
// wrong in here comes out as the dialect's fixed sentence.
function fromUrl(text: string, dialect: DialectId): ParsedConnection {
  try {
    const url = new URL(text);
    const fields = {
      ...emptyFields(dialect),
      host: decodeURIComponent(url.hostname).replace(/^\[(.*)\]$/, "$1"),
      port: url.port,
      user: decodeURIComponent(url.username),
      database: decodeURIComponent(url.pathname.slice(1)),
    };
    let password = decodeURIComponent(url.password);
    let queryPassword: string | undefined;

    const visible: string[] = [];
    const hidden: string[] = [];
    for (const pair of url.search.slice(1).split("&")) {
      if (pair === "") {
        continue;
      }
      const key = keyOf(pair);
      const hasValue = pair.includes("=");
      const value = hasValue
        ? safeDecode(pair.slice(pair.indexOf("=") + 1))
        : "";
      if (PASSWORD_KEYS.has(key)) {
        // The text in front of the host wins; a key it repeats is dropped.
        queryPassword ??= hasValue
          ? queryDecode(pair.slice(pair.indexOf("=") + 1))
          : "";
      } else if (SECRET_KEYS.has(key)) {
        hidden.push(pair);
      } else if (dialect === "mssql" && key === "instancename") {
        fields.instance = value;
      } else if (dialect === "mssql" && key === "encrypt") {
        fields.encrypt = encryptOn(value);
      } else if (dialect === "mssql" && key === "trustservercertificate") {
        fields.trustServerCertificate = trustOn(value);
      } else {
        visible.push(pair);
      }
    }
    if (password === "") {
      password = queryPassword ?? "";
    }

    return {
      fields: { ...fields, options: visible.join("&") },
      password,
      hiddenOptions: hidden.join("&"),
    };
  } catch {
    throw unreadable(dialect);
  }
}

function fromAdo(text: string): ParsedConnection {
  try {
    const map = parseAdo(text);
    const fields = emptyFields("mssql");

    // `host`, `host,port` and `host\instance`; the driver ignores a port next to
    // a named instance, so the instance wins and the port is left open.
    const server = firstOf(map, SERVER_KEYS).trim().replace(/^tcp:/i, "");
    const comma = server.indexOf(",");
    const hostPart = comma === -1 ? server : server.slice(0, comma);
    const port = comma === -1 ? "" : server.slice(comma + 1).trim();
    const slash = hostPart.indexOf("\\");
    fields.host = slash === -1 ? hostPart : hostPart.slice(0, slash);
    fields.instance = slash === -1 ? "" : hostPart.slice(slash + 1);
    fields.port = fields.instance === "" ? port : "";

    fields.database = firstOf(map, DATABASE_KEYS);
    fields.user = firstOf(map, ["user id", "uid"]);
    const encrypt = map.get("encrypt");
    if (encrypt !== undefined) {
      fields.encrypt = encryptOn(encrypt);
    }
    const trust = map.get("trustservercertificate");
    if (trust !== undefined) {
      fields.trustServerCertificate = trustOn(trust);
    }

    // The URL form is the one this is stored in, and the adapter reads its
    // query keys as ADO keys, so the rest travel by their own names.
    const visible: string[] = [];
    const hidden: string[] = [];
    for (const [key, value] of map) {
      if (ADO_FIELD_KEYS.has(key)) {
        continue;
      }
      const pair = `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
      (SECRET_KEYS.has(key.replace(/\s/g, "")) ? hidden : visible).push(pair);
    }
    fields.options = visible.join("&");

    return {
      fields,
      password: firstOf(map, ["password", "pwd"]),
      hiddenOptions: hidden.join("&"),
    };
  } catch {
    throw unreadable("mssql");
  }
}

const withoutLeadingMarks = (text: string): string =>
  text.trim().replace(/^[?&]+/, "");

// The options as they go into the query: a `#` would start a fragment, and the
// SQL Server keys that have a field are the field's to write.
function writtenOptions(fields: ConnectionFields): string {
  const pairs = withoutLeadingMarks(fields.options)
    .split("&")
    .filter((pair) => pair !== "");
  const kept =
    fields.dialect === "mssql"
      ? pairs.filter((pair) => !MSSQL_FIELD_KEYS.has(keyOf(pair)))
      : pairs;
  return kept.join("&").replace(/#/g, "%23");
}

export function buildConnection(
  fields: ConnectionFields,
  password: string,
  hiddenOptions = "",
): string {
  const enc = encodeURIComponent;
  const auth =
    fields.user === "" && password === ""
      ? ""
      : `${enc(fields.user)}${password === "" ? "" : `:${enc(password)}`}@`;
  const sqlInstance =
    fields.dialect === "mssql" && fields.instance.trim() !== "";
  const port =
    sqlInstance || fields.port.trim() === "" ? "" : `:${fields.port.trim()}`;
  const bare = fields.host.trim().replace(/^\[(.*)\]$/, "$1");
  const host = bare.includes(":") ? `[${bare}]` : bare;
  const params: string[] = [];
  if (fields.dialect === "mssql") {
    if (sqlInstance) {
      params.push(`instanceName=${enc(fields.instance.trim())}`);
    }
    params.push(`encrypt=${String(fields.encrypt)}`);
    if (fields.trustServerCertificate) {
      params.push("trustServerCertificate=true");
    }
  }
  for (const rest of [
    writtenOptions(fields),
    withoutLeadingMarks(hiddenOptions),
  ]) {
    if (rest !== "") {
      params.push(rest);
    }
  }
  const query = params.length === 0 ? "" : `?${params.join("&")}`;
  return `${SCHEME[fields.dialect]}://${auth}${host}${port}/${enc(fields.database.trim())}${query}`;
}
