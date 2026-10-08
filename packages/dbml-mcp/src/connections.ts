import { DbImportErrorCode, withDatabase } from "db-to-dbml";

import { fromDbImportError, ToolError } from "./errors";

export const CONNECTION_ENV_PREFIX = "DBML_CONNECTION_";

// Optional: a JSON object from a variable's suffix to the name the connection
// goes by. Environment variable names are ASCII by convention and in practice,
// connection names are whatever the user typed, in any language.
export const CONNECTION_NAMES_ENV = "DBML_CONNECTION_NAMES";

export interface ConnectionSource {
  names: () => string[];
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
  return {
    names: () => [...byName.values()].map((c) => c.name).sort(),
    get: (name) => byName.get(name.toLowerCase())?.value,
  };
}

const RAW_URL = /^postgres(ql)?:\/\//i;

// A value that fails the URL check may still be a malformed connection string
// with a password in it, so only something shaped like a name is quoted back.
const LOOKS_LIKE_NAME = /^[\w .-]{1,64}$/;

// pg reads a connection string with `new URL`, after encoding spaces, and
// tries again with a stand-in host for a socket URL such as
// postgres://user@/db?host=/tmp. A string that fails all of that would fail
// inside pg as an error that quotes it, so it is refused here, by code only.
function readableAsUrl(value: string): boolean {
  const encoded = encodeURI(value).replace(/%25(\d\d)/g, "%$1");
  return [value, encoded, encoded.replace("@/", "@localhost/")].some(
    (candidate) => URL.canParse(candidate),
  );
}

export function resolveConnection(
  source: ConnectionSource,
  value: string,
  database?: string,
): string {
  const named = source.get(value.trim());
  let connectionString: string;
  if (named !== undefined) {
    connectionString = named;
  } else if (RAW_URL.test(value.trim())) {
    if (!readableAsUrl(value.trim())) {
      throw new ToolError(
        DbImportErrorCode.INVALID_CONNECTION_STRING,
        "The connection string is not a readable PostgreSQL URL.",
      );
    }
    connectionString = value.trim();
  } else {
    const names = source.names();
    const subject = LOOKS_LIKE_NAME.test(value.trim())
      ? `No connection named "${value}"`
      : "No connection matches that value";
    throw new ToolError(
      "CONNECTION_NOT_FOUND",
      names.length === 0
        ? `${subject}, and none are configured. Set DBML_CONNECTION_<NAME>=postgres://… in the MCP server's environment, or pass a postgres:// URL.`
        : `${subject}. Known connections: ${names.join(", ")}.`,
    );
  }
  if (database === undefined) return connectionString;
  try {
    return withDatabase(connectionString, database);
  } catch (error) {
    throw fromDbImportError(error);
  }
}
