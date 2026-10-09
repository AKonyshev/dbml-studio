import type { DialectId } from "db-to-dbml";

// The form's model of a connection: what the fields are, their defaults, and
// when they are acceptable. Nothing here reads or writes a connection string
// (see connectionString.ts), so the webview can import this file without
// pulling the database drivers in with it. The password is never a field: it
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

const normalized = (name: string): string => name.trim().toLowerCase();

// An IPv6 literal, with or without its brackets: at least two colons, and
// nothing but hex digits, colons and dots between them.
const isIpv6 = (host: string): boolean =>
  /^[0-9a-f:.]+$/i.test(host) && host.split(":").length > 2;

const unbracketed = (host: string): string => host.replace(/^\[(.*)\]$/, "$1");

// A host is a name or an address. Anything that would be read as a port, a
// path, a login or a query once it is written into a URL is refused here, where
// the field can say so. A comma is the ADO `host,port` form, which the drivers
// would read as part of the name.
function hostIsUnusable(host: string): boolean {
  if (/[\s/?#@%\\,]/.test(host)) {
    return true;
  }
  const bare = unbracketed(host);
  if (bare !== host && !isIpv6(bare)) {
    return true;
  }
  if (bare.includes(":") && !isIpv6(bare)) {
    return true;
  }
  return /[[\]]/.test(bare);
}

// `savedNames` is every saved name except the edited connection's own key: that
// key is not a collision, and any other key, a case variant included, is.
export function validateFields(
  fields: ConnectionFields,
  savedNames: string[],
): FieldErrors {
  const errors: FieldErrors = {};
  const name = normalized(fields.name);
  if (name === "") {
    errors.name = "Give the connection a name.";
  } else if (savedNames.some((saved) => normalized(saved) === name)) {
    errors.name = "A connection with this name already exists.";
  }

  const host = fields.host.trim();
  if (host === "") {
    errors.host = "Enter a host.";
  } else if (hostIsUnusable(host)) {
    errors.host = "The host is a name or address, without a port or path.";
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

// Spelling is not difference: padding, a bracketed IPv6 host, `08080` for
// `8080`, a leading `?` or `&` on the options, and the SQL Server fields on a
// dialect that has none.
export function sameFields(
  a: Omit<ConnectionFields, "name">,
  b: Omit<ConnectionFields, "name">,
): boolean {
  const key = (f: Omit<ConnectionFields, "name">): string[] => {
    const port = f.port.trim();
    return [
      f.dialect,
      unbracketed(f.host.trim()),
      /^\d+$/.test(port) ? String(Number(port)) : port,
      f.user.trim(),
      f.database.trim(),
      f.options.trim().replace(/^[?&]+/, ""),
      ...(f.dialect === "mssql"
        ? [
            f.instance.trim(),
            String(f.encrypt),
            String(f.trustServerCertificate),
          ]
        : []),
    ];
  };
  const [left, right] = [key(a), key(b)];
  return left.length === right.length && left.every((v, i) => v === right[i]);
}
