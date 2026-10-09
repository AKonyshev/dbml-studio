import { defaultSchema, filterDatabaseSchema, schemaToDbml } from "db-to-dbml";
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
    .describe(
      'Schemas to import, e.g. ["public"] (PostgreSQL), ["shop"] (MySQL: the database) or ["dbo"] (SQL Server). See list_schemas.',
    ),
  ...outputShape,
});
const outputSchema = z.object({
  tables: z.number(),
  enums: z.number(),
  refs: z.number(),
  droppedCrossSchemaRefs: z.number(),
  dbml: z
    .string()
    .optional()
    .describe("The DBML. Present unless it was written to outputPath."),
  outputPath: z.string().optional(),
});

export const importSchema: ToolDefinition<
  typeof inputSchema,
  typeof outputSchema
> = {
  name: "import_schema",
  title: "Import a database schema as DBML",
  description:
    "Read the structure (not the data) of schemas in a live PostgreSQL, MySQL or SQL Server database and return it as DBML. For large databases pass outputPath to write a file instead of returning the text.",
  inputSchema,
  outputSchema,
  annotations: { readOnlyHint: false, destructiveHint: true },
  run: async (input, ctx) => {
    const resolved = resolveConnection(
      ctx.connections,
      input.connection,
      input.database,
    );
    const db = await onDatabase(
      async () => await ctx.catalog.fetchSchema(resolved),
    );
    assertSchemasExist(db, input.schemas);
    // The database's default schema is written without a prefix, the way
    // PostgreSQL's public is: the database itself for MySQL, dbo for SQL Server.
    const { dbml, droppedCrossSchemaRefs } = schemaToDbml(db, input.schemas, {
      unqualified: await onDatabase(async () => defaultSchema(resolved)),
    });
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
        structured: { ...counts, dbml, outputPath: undefined },
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
