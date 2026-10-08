import { filterDatabaseSchema, schemaToDbml } from "db-to-dbml";
import { z } from "zod";

import { resolveConnection } from "../connections";
import { writeOutput } from "../paths";

import {
  assertSchemasExist,
  connectionShape,
  onDatabase,
  outputShape,
} from "./shared";

import type { ToolDefinition } from "../context";

const inputSchema = z.object({
  ...connectionShape,
  schemas: z
    .array(z.string())
    .min(1)
    .describe('Schemas to import, e.g. ["public"]. See list_schemas.'),
  ...outputShape,
});
const outputSchema = z.object({
  tables: z.number(),
  enums: z.number(),
  refs: z.number(),
  droppedCrossSchemaRefs: z.number(),
  outputPath: z.string().optional(),
});

export const importSchema: ToolDefinition<
  typeof inputSchema,
  typeof outputSchema
> = {
  name: "import_schema",
  title: "Import a database schema as DBML",
  description:
    "Read the structure (not the data) of schemas in a live Postgres database and return it as DBML. For large databases pass outputPath to write a file instead of returning the text.",
  inputSchema,
  outputSchema,
  annotations: { readOnlyHint: false, destructiveHint: true },
  run: async (input, ctx) => {
    const db = await onDatabase(
      async () =>
        await ctx.catalog.fetchSchema(
          resolveConnection(ctx.connections, input.connection, input.database),
        ),
    );
    assertSchemasExist(db, input.schemas);
    const { dbml, droppedCrossSchemaRefs } = schemaToDbml(db, input.schemas);
    const { schema } = filterDatabaseSchema(db, input.schemas);
    const counts = {
      tables: schema.tables.length,
      enums: schema.enums.length,
      refs: schema.refs.length,
      droppedCrossSchemaRefs,
    };
    const dropped =
      droppedCrossSchemaRefs > 0
        ? ` ${droppedCrossSchemaRefs} references to schemas not imported were left out.`
        : "";
    if (input.outputPath === undefined) {
      return {
        text: dbml + (dropped === "" ? "" : `\n//${dropped}\n`),
        structured: { ...counts, outputPath: undefined },
      };
    }
    const written = await writeOutput(
      ctx.root,
      input.outputPath,
      dbml,
      input.overwrite,
    );
    return {
      text: `Wrote ${counts.tables} tables, ${counts.enums} enums and ${counts.refs} references to ${input.outputPath}.${dropped}`,
      structured: { ...counts, outputPath: written },
    };
  },
};
