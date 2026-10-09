import { z } from "zod";

import type { ToolDefinition } from "../context";

const inputSchema = z.object({});
const outputSchema = z.object({
  connections: z.array(
    z.object({
      name: z.string(),
      database: z
        .enum(["postgres", "mysql", "mssql", "unknown"])
        .describe(
          "The kind of database the connection speaks to; unknown when its value is not a supported connection string.",
        ),
    }),
  ),
  hint: z
    .string()
    .optional()
    .describe("How to configure a connection. Present when there are none."),
});

const NONE_CONFIGURED =
  "No connections configured. Set DBML_CONNECTION_<NAME>=<postgres://, mysql:// or sqlserver:// URL> in the server's environment, or pass such a URL (or a SQL Server connection string) as `connection`.";

export const listConnections: ToolDefinition<
  typeof inputSchema,
  typeof outputSchema
> = {
  name: "list_connections",
  title: "List database connections",
  description:
    "The database connections this server knows, each with its name and the kind of database it speaks to (PostgreSQL, MySQL or SQL Server). Pass a name as `connection` to the other tools.",
  inputSchema,
  outputSchema,
  annotations: { readOnlyHint: true },
  run: async (_input, ctx) => {
    const connections = ctx.connections.entries();
    if (connections.length === 0) {
      return {
        text: NONE_CONFIGURED,
        structured: { connections, hint: NONE_CONFIGURED },
      };
    }
    return {
      text: `Connections: ${connections
        .map((c) => `${c.name} (${c.database})`)
        .join(", ")}.`,
      structured: { connections },
    };
  },
};
