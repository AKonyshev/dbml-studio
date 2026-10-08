import { z } from "zod";

import type { ToolDefinition } from "../context";

const inputSchema = z.object({});
const outputSchema = z.object({ connections: z.array(z.string()) });

export const listConnections: ToolDefinition<
  typeof inputSchema,
  typeof outputSchema
> = {
  name: "list_connections",
  title: "List database connections",
  description:
    "Names of the database connections this server knows. Pass one as `connection` to the other tools.",
  inputSchema,
  outputSchema,
  annotations: { readOnlyHint: true },
  run: async (_input, ctx) => {
    const connections = ctx.connections.names();
    return {
      text:
        connections.length === 0
          ? "No connections configured. Set DBML_CONNECTION_<NAME>=postgres://… in the server's environment, or pass a postgres:// URL as `connection`."
          : `Connections: ${connections.join(", ")}.`,
      structured: { connections },
    };
  },
};
