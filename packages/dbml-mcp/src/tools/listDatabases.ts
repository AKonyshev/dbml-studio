import { z } from "zod";

import { resolveConnection } from "../connections";

import { connectionShape, onDatabase } from "./shared";

import type { ToolDefinition } from "../context";

const inputSchema = z.object({ connection: connectionShape.connection });
const outputSchema = z.object({ databases: z.array(z.string()) });

export const listDatabases: ToolDefinition<
  typeof inputSchema,
  typeof outputSchema
> = {
  name: "list_databases",
  title: "List databases",
  description:
    "Databases on the PostgreSQL, MySQL or SQL Server server a connection points at.",
  inputSchema,
  outputSchema,
  annotations: { readOnlyHint: true },
  run: async (input, ctx) => {
    const databases = await onDatabase(
      async () =>
        await ctx.catalog.listDatabases(
          resolveConnection(ctx.connections, input.connection),
        ),
    );
    return {
      text: `Databases: ${databases.join(", ")}.`,
      structured: { databases },
    };
  },
};
