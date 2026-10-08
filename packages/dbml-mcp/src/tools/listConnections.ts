import { z } from "zod";

import type { ToolDefinition } from "../context";

const inputSchema = z.object({});
const outputSchema = z.object({
  connections: z.array(z.string()),
  hint: z
    .string()
    .optional()
    .describe("How to configure a connection. Present when there are none."),
});

const NONE_CONFIGURED =
  "No connections configured. Set DBML_CONNECTION_<NAME>=postgres://… in the server's environment, or pass a postgres:// URL as `connection`.";

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
    if (connections.length === 0) {
      return {
        text: NONE_CONFIGURED,
        structured: { connections, hint: NONE_CONFIGURED },
      };
    }
    return {
      text: `Connections: ${connections.join(", ")}.`,
      structured: { connections },
    };
  },
};
