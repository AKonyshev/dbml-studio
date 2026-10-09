import { assertConnectionString, dialectOf, withDatabase } from "db-to-dbml";

import { fromDbImportError, ToolError } from "./errors";

import type { DialectId } from "db-to-dbml";

export const CONNECTION_ENV_PREFIX = "DBML_CONNECTION_";

// Optional: a JSON object from a variable's suffix to the name the connection
// goes by. Environment variable names are ASCII by convention and in practice,
// connection names are whatever the user typed, in any language.
export const CONNECTION_NAMES_ENV = "DBML_CONNECTION_NAMES";

export interface ConnectionEntry {
  name: string;
  // "unknown" is a configured value no supported database accepts.
  database: DialectId | "unknown";
}

export interface ConnectionSource {
  names: () => string[];
  // Sorted by name, like `names`.
  entries: () => ConnectionEntry[];
  get: (name: string) => string | undefined;
}

// Throws one short line naming the variable. The message never quotes the
// map's values: it is only names, but it does not need to.
function displayNames(raw: string | undefined): Map<string, string> {
  const names = new Map<string, string>();
  if (raw === undefined || raw.trim() === "") return names;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${CONNECTION_NAMES_ENV} is not valid JSON.`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `${CONNECTION_NAMES_ENV} must be a JSON object from a variable suffix to a connection name.`,
    );
  }
  for (const [suffix, name] of Object.entries(parsed)) {
    if (typeof name !== "string" || name.trim() === "") {
      throw new Error(
        `${CONNECTION_NAMES_ENV} gives the suffix "${suffix}" no name; every value must be a non-empty string.`,
      );
    }
    names.set(suffix, name.trim());
  }
  return names;
}

function kindOf(value: string): ConnectionEntry["database"] {
  try {
    return dialectOf(value);
  } catch {
    return "unknown";
  }
}

export function connectionsFromEnv(
  env: Record<string, string | undefined>,
): ConnectionSource {
  const mapped = displayNames(env[CONNECTION_NAMES_ENV]);
  // Keyed by the name lower-cased, which is how names are matched.
  const byName = new Map<
    string,
    { name: string; variable: string; value: string }
  >();
  for (const [variable, value] of Object.entries(env)) {
    const upper = variable.toUpperCase();
    if (!upper.startsWith(CONNECTION_ENV_PREFIX)) continue;
    if (upper === CONNECTION_NAMES_ENV) continue;
    if (value === undefined || value.trim() === "") continue;
    const suffix = variable.slice(CONNECTION_ENV_PREFIX.length);
    if (suffix === "") continue;
    const name = mapped.get(suffix) ?? suffix.toLowerCase();
    const key = name.toLowerCase();
    const earlier = byName.get(key);
    if (earlier !== undefined) {
      throw new Error(
        `${earlier.variable} and ${variable} both name the connection "${name}"; keep one.`,
      );
    }
    byName.set(key, { name, variable, value: value.trim() });
  }
  const entries = (): ConnectionEntry[] =>
    [...byName.values()]
      .map((c) => ({ name: c.name, database: kindOf(c.value) }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return {
    names: () => [...byName.values()].map((c) => c.name).sort(),
    entries,
    get: (name) => byName.get(name.toLowerCase())?.value,
  };
}

// A value no database claims may still be a malformed connection string with a
// password in it, so only something shaped like a name is quoted back.
const LOOKS_LIKE_NAME = /^[\w .-]{1,64}$/;

export function resolveConnection(
  source: ConnectionSource,
  value: string,
  database?: string,
): string {
  const named = source.get(value.trim());
  let connectionString: string;
  if (named !== undefined) {
    connectionString = named;
  } else if (kindOf(value.trim()) !== "unknown") {
    connectionString = value.trim();
  } else {
    const names = source.names();
    const subject = LOOKS_LIKE_NAME.test(value.trim())
      ? `No connection named "${value}"`
      : "No connection matches that value";
    throw new ToolError(
      "CONNECTION_NOT_FOUND",
      names.length === 0
        ? `${subject}, and none are configured. Set DBML_CONNECTION_<NAME>=<postgres://, mysql:// or sqlserver:// URL> in the MCP server's environment, or pass such a URL (or a SQL Server connection string) as the connection.`
        : `${subject}. Known connections: ${names.join(", ")}.`,
    );
  }
  // Every value is read by its database's own rules before it goes anywhere,
  // so one nobody accepts (a configured typo, a URL the driver could not read)
  // fails here by code and fixed sentence, never inside a driver. The result
  // is the string as given, not the normalised one: that form can carry the
  // password in a different shape and is never stored.
  try {
    assertConnectionString(connectionString);
  } catch (error) {
    throw fromDbImportError(error);
  }
  if (database === undefined) return connectionString;
  try {
    return withDatabase(connectionString, database);
  } catch (error) {
    throw fromDbImportError(error);
  }
}
