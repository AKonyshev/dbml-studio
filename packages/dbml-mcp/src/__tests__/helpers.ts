import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { connectionsFromEnv } from "../connections";

import type { Catalog, ToolContext } from "../context";

export const LIBRARY_DBML = `Enum membership_status {
  active
  lapsed
}

Table member {
  id integer [pk]
  status membership_status [not null]
}

Table loan {
  id integer [pk]
  member_id integer [not null, ref: > member.id]
}
`;

const unusedCatalog: Catalog = {
  listDatabases: async () =>
    await Promise.reject(new Error("no database in this test")),
  listSchemas: async () =>
    await Promise.reject(new Error("no database in this test")),
  fetchSchema: async () =>
    await Promise.reject(new Error("no database in this test")),
};

export async function makeContext(
  overrides: Partial<ToolContext> = {},
): Promise<ToolContext> {
  return {
    connections: connectionsFromEnv({}),
    root: await mkdtemp(path.join(tmpdir(), "dbml-mcp-tool-")),
    catalog: unusedCatalog,
    ...overrides,
  };
}

export const codeOf = async (p: Promise<unknown>): Promise<string> =>
  await p.then(
    () => "resolved",
    (error: { code?: string }) => error.code ?? "no code",
  );
