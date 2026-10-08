import { withDatabase } from "db-to-dbml";

import { fromDbImportError, ToolError } from "./errors";

export const CONNECTION_ENV_PREFIX = "DBML_CONNECTION_";

export interface ConnectionSource {
  names: () => string[];
  get: (name: string) => string | undefined;
}

export function connectionsFromEnv(
  env: Record<string, string | undefined>,
): ConnectionSource {
  const byName = new Map<string, { variable: string; value: string }>();
  for (const [variable, value] of Object.entries(env)) {
    if (!variable.toUpperCase().startsWith(CONNECTION_ENV_PREFIX)) continue;
    if (value === undefined || value.trim() === "") continue;
    const name = variable.slice(CONNECTION_ENV_PREFIX.length).toLowerCase();
    const earlier = byName.get(name);
    if (earlier !== undefined) {
      throw new Error(
        `${earlier.variable} and ${variable} both name the connection "${name}"; keep one.`,
      );
    }
    byName.set(name, { variable, value: value.trim() });
  }
  return {
    names: () => [...byName.keys()].sort(),
    get: (name) => byName.get(name.toLowerCase())?.value,
  };
}

const RAW_URL = /^postgres(ql)?:\/\//i;

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
    connectionString = value.trim();
  } else {
    const names = source.names();
    throw new ToolError(
      "CONNECTION_NOT_FOUND",
      names.length === 0
        ? `No connection named "${value}", and none are configured. Set DBML_CONNECTION_<NAME>=postgres://… in the MCP server's environment, or pass a postgres:// URL.`
        : `No connection named "${value}". Known connections: ${names.join(", ")}.`,
    );
  }
  if (database === undefined) return connectionString;
  try {
    return withDatabase(connectionString, database);
  } catch (error) {
    throw fromDbImportError(error);
  }
}
