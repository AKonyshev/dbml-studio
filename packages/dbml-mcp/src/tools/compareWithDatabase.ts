import { defaultSchema, dialectOf } from "db-to-dbml";
import {
  databaseSchemaToModel,
  DbmlParseError,
  diffSchemas,
  parseDbmlToModel,
  renderDiffMarkdown,
} from "schema-diff";
import { z } from "zod";

import { resolveConnection } from "../connections";
import { ToolError } from "../errors";
import { readSource } from "../paths";

import {
  assertSchemasExist,
  connectionShape,
  onDatabase,
  sourceShape,
} from "./shared";

import type { CanonSchema } from "schema-diff";
import type { ToolDefinition } from "../context";

// Mirrors packages/schema-diff/src/model.ts field by field. The SDK validates
// every response against this, so a drift there fails the protocol test.
const ref = z.object({
  fromTable: z.string(),
  fromColumns: z.array(z.string()),
  toTable: z.string(),
  toColumns: z.array(z.string()),
});
const column = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean(),
  pk: z.boolean(),
});
const index = z.object({
  columns: z.array(z.string()),
  unique: z.boolean(),
  name: z.string().optional(),
});

const inputSchema = z.object({
  ...sourceShape,
  ...connectionShape,
  schema: z
    .string()
    .optional()
    .describe(
      "The database schema to compare with. Defaults to public (PostgreSQL), the database itself (MySQL) or dbo (SQL Server).",
    ),
});

const outputSchema = z.object({
  report: z
    .string()
    .describe("The differences as markdown, ready to show the user."),
  identical: z.boolean(),
  tablesOnlyInDbml: z.array(z.string()),
  tablesOnlyInDatabase: z.array(z.string()),
  columnDiffs: z.array(
    z.object({
      table: z.string(),
      onlyInDbml: z.array(z.string()),
      onlyInDatabase: z.array(z.string()),
      changed: z.array(
        z.object({
          column: z.string(),
          model: column,
          database: column,
          differs: z.array(z.enum(["type", "nullable", "pk"])),
        }),
      ),
    }),
  ),
  enumsOnlyInDbml: z.array(z.string()),
  enumsOnlyInDatabase: z.array(z.string()),
  enumValueDiffs: z.array(
    z.object({
      enumName: z.string(),
      onlyInDbml: z.array(z.string()),
      onlyInDatabase: z.array(z.string()),
    }),
  ),
  refsOnlyInDbml: z.array(ref),
  refsOnlyInDatabase: z.array(ref),
  indexDiffs: z.array(
    z.object({
      table: z.string(),
      onlyInDbml: z.array(index),
      onlyInDatabase: z.array(index),
    }),
  ),
});

export const compareWithDatabase: ToolDefinition<
  typeof inputSchema,
  typeof outputSchema
> = {
  name: "compare_with_database",
  title: "Compare DBML with a database",
  description:
    "Compare a DBML model with one schema of a live PostgreSQL, MySQL or SQL Server database: tables, columns, enums, references and indexes on either side only, or different.",
  inputSchema,
  outputSchema,
  annotations: { readOnlyHint: true },
  run: async (input, ctx) => {
    const dbml = await readSource(ctx.root, input);
    let model: CanonSchema;
    try {
      model = parseDbmlToModel(dbml);
    } catch (error) {
      if (error instanceof DbmlParseError) {
        throw new ToolError(
          "DBML_PARSE_ERROR",
          `line ${error.line}, column ${error.column}: ${error.message}`,
        );
      }
      throw error;
    }
    const resolved = resolveConnection(
      ctx.connections,
      input.connection,
      input.database,
    );
    const db = await onDatabase(
      async () => await ctx.catalog.fetchSchema(resolved),
    );
    const schema =
      input.schema ?? (await onDatabase(async () => defaultSchema(resolved)));
    assertSchemasExist(db, [schema]);
    // The database's own rules (MySQL has no named enums, SQL Server keeps them
    // as check constraints) decide what counts as a difference.
    const diff = diffSchemas(model, databaseSchemaToModel(db, schema), {
      dialect: dialectOf(resolved),
    });
    const report = renderDiffMarkdown(diff);
    return { text: report, structured: { report, ...diff } };
  },
};
