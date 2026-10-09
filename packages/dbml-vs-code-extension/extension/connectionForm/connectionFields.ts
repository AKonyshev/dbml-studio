import {
  assertConnectionString,
  DbImportError,
  DbImportErrorCode,
  dialectOf,
  parseAdo,
  UNSUPPORTED_CONNECTION,
  type DialectId,
} from "db-to-dbml";

// The form's model of a connection, and the two directions between it and the
// one string that is stored. The password is never part of the fields: it
// travels separately so the form never has to hold it.
export interface ConnectionFields {
  name: string;
  dialect: DialectId;
  host: string;
  port: string;
  instance: string;
  user: string;
  database: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  // "k=v&k2=v2": the parameters there is no field for, kept as they were written.
  options: string;
}

// Values are l10n keys: the English source strings, translated where shown.
export type FieldErrors = Partial<Record<"name" | "host" | "port", string>>;

type Parsed = { fields: Omit<ConnectionFields, "name">; password: string };

export const DEFAULT_PORTS: Record<DialectId, string> = {
  postgres: "5432",
  mysql: "3306",
  mssql: "1433",
};

export const emptyFields = (
  dialect: DialectId = "postgres",
): ConnectionFields => ({
  name: "",
  dialect,
  host: "localhost",
  port: DEFAULT_PORTS[dialect],
  instance: "",
  user: "",
  database: "",
  encrypt: true,
  trustServerCertificate: false,
  options: "",
});

const SCHEME: Record<DialectId, string> = {
  postgres: "postgresql",
  mysql: "mysql",
  mssql: "sqlserver",
};

// The same sentence db-to-dbml refuses a string with: it never repeats the
// input, which holds a password.
const unreadable = (): DbImportError =>
  new DbImportError(
    DbImportErrorCode.INVALID_CONNECTION_STRING,
    UNSUPPORTED_CONNECTION,
  );

const isTrue = (value: string): boolean =>
  ["true", "yes"].includes(value.trim().toLowerCase());

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

export function parseConnection(text: string): Parsed {
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
// wrong in here comes out as the fixed sentence.
function fromUrl(text: string, dialect: DialectId): Parsed {
  try {
    const url = new URL(text);
    const fields = {
      ...emptyFields(dialect),
      host: decodeURIComponent(url.hostname).replace(/^\[(.*)\]$/, "$1"),
      port: url.port,
      user: decodeURIComponent(url.username),
      database: decodeURIComponent(url.pathname.slice(1)),
    };
    const query = url.search.slice(1);
    if (dialect !== "mssql") {
      return {
        fields: { ...fields, options: query },
        password: decode(url.password),
      };
    }

    const rest: string[] = [];
    for (const pair of query.split("&")) {
      if (pair === "") {
        continue;
      }
      const eq = pair.indexOf("=");
      const key = decodeURIComponent(
        eq === -1 ? pair : pair.slice(0, eq),
      ).toLowerCase();
      const value = eq === -1 ? "" : decodeURIComponent(pair.slice(eq + 1));
      if (key === "instancename") {
        fields.instance = value;
      } else if (key === "encrypt") {
        fields.encrypt = isTrue(value);
      } else if (key === "trustservercertificate") {
        fields.trustServerCertificate = isTrue(value);
      } else {
        rest.push(pair);
      }
    }
    return {
      fields: { ...fields, options: rest.join("&") },
      password: decode(url.password),
    };
  } catch {
    throw unreadable();
  }
}

const decode = (value: string): string => decodeURIComponent(value);

function fromAdo(text: string): Parsed {
  try {
    const map = parseAdo(text);
    const fields = emptyFields("mssql");

    // `host`, `host,port` and `host\instance`; the driver refuses a port and an
    // instance together, so a named instance leaves the port open.
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
      fields.encrypt = isTrue(encrypt);
    }
    const trust = map.get("trustservercertificate");
    if (trust !== undefined) {
      fields.trustServerCertificate = isTrue(trust);
    }

    // The URL form is the one this is stored in, and it reads only
    // `applicationName` of the rest; the other keys travel as they are.
    fields.options = [...map]
      .filter(([key]) => !ADO_FIELD_KEYS.has(key))
      .map(([key, value]) => {
        const name = key === "application name" ? "applicationName" : key;
        return `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
      })
      .join("&");

    return { fields, password: firstOf(map, ["password", "pwd"]) };
  } catch {
    throw unreadable();
  }
}

export function buildConnection(
  fields: ConnectionFields,
  password: string,
): string {
  const enc = encodeURIComponent;
  const auth =
    fields.user === ""
      ? ""
      : `${enc(fields.user)}${password === "" ? "" : `:${enc(password)}`}@`;
  const sqlInstance =
    fields.dialect === "mssql" && fields.instance.trim() !== "";
  const port =
    sqlInstance || fields.port.trim() === "" ? "" : `:${fields.port.trim()}`;
  const host = fields.host.trim().includes(":")
    ? `[${fields.host.trim()}]`
    : fields.host.trim();
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
  if (fields.options.trim() !== "") {
    params.push(fields.options.trim().replace(/^[?&]+/, ""));
  }
  const query = params.length === 0 ? "" : `?${params.join("&")}`;
  return `${SCHEME[fields.dialect]}://${auth}${host}${port}/${enc(fields.database.trim())}${query}`;
}

const normalized = (name: string): string => name.trim().toLowerCase();

export function validateFields(
  fields: ConnectionFields,
  savedNames: string[],
  editing?: string,
): FieldErrors {
  const errors: FieldErrors = {};
  const name = normalized(fields.name);
  if (name === "") {
    errors.name = "Give the connection a name.";
  } else if (
    savedNames.some(
      (saved) =>
        normalized(saved) === name &&
        (editing === undefined || normalized(editing) !== name),
    )
  ) {
    errors.name = "A connection with this name already exists.";
  }

  if (fields.host.trim() === "") {
    errors.host = "Enter a host.";
  }

  const port = fields.port.trim();
  if (
    port !== "" &&
    !(/^\d+$/.test(port) && Number(port) >= 1 && Number(port) <= 65535)
  ) {
    errors.port = "The port is a number from 1 to 65535.";
  }
  return errors;
}

// Spelling is not difference: padding, a leading `?` or `&` on the options, and
// the SQL Server flags on a dialect that has none.
export function sameFields(
  a: Omit<ConnectionFields, "name">,
  b: Omit<ConnectionFields, "name">,
): boolean {
  const key = (f: Omit<ConnectionFields, "name">): string[] => [
    f.dialect,
    f.host.trim(),
    f.port.trim(),
    f.user.trim(),
    f.database.trim(),
    f.options.trim().replace(/^[?&]+/, ""),
    ...(f.dialect === "mssql"
      ? [f.instance.trim(), String(f.encrypt), String(f.trustServerCertificate)]
      : []),
  ];
  const [left, right] = [key(a), key(b)];
  return left.length === right.length && left.every((v, i) => v === right[i]);
}
