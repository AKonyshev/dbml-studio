import { z } from "zod";

import { resolveConnection } from "../connections";

import { connectionShape, onDatabase } from "./shared";

import type { ToolDefinition } from "../context";

const inputSchema = z.object(connectionShape);
const outputSchema = z.object({ schemas: z.array(z.string()) });

export const listSchemas: ToolDefinition<
  typeof inputSchema,
  typeof outputSchema
> = {
  name: "list_schemas",
  title: "List schemas",
  description:
    "Schemas in a PostgreSQL, MySQL or SQL Server database, system schemas left out. MySQL has no schemas apart from the database itself, so it answers that one.",
  inputSchema,
  outputSchema,
  annotations: { readOnlyHint: true },
  run: async (input, ctx) => {
    const schemas = await onDatabase(
      async () =>
        await ctx.catalog.listSchemas(
          resolveConnection(ctx.connections, input.connection, input.database),
        ),
    );
    return { text: `Schemas: ${schemas.join(", ")}.`, structured: { schemas } };
  },
};
