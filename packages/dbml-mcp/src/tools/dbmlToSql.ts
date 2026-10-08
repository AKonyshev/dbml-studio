import { exporter } from "@dbml/core";
import { z } from "zod";

import { ToolError } from "../errors";
import { readSource, writeOutput } from "../paths";

import {
  describeProblems,
  outputShape,
  parseErrors,
  sourceShape,
} from "./shared";

import type { ToolDefinition } from "../context";

const inputSchema = z.object({
  ...sourceShape,
  dialect: z.enum(["postgres", "mysql", "mssql", "oracle"]),
  ...outputShape,
});
const outputSchema = z.object({
  dialect: z.string(),
  outputPath: z.string().optional(),
});

export const dbmlToSql: ToolDefinition<
  typeof inputSchema,
  typeof outputSchema
> = {
  name: "dbml_to_sql",
  title: "DBML to SQL",
  description: "Turn a DBML model into CREATE statements for one SQL dialect.",
  inputSchema,
  outputSchema,
  annotations: { readOnlyHint: false, destructiveHint: true },
  run: async (input, ctx) => {
    const dbml = await readSource(ctx.root, input);
    let sql: string;
    try {
      sql = exporter.export(dbml, input.dialect);
    } catch (error) {
      throw new ToolError(
        "DBML_PARSE_ERROR",
        describeProblems(parseErrors(error)),
      );
    }
    if (input.outputPath === undefined) {
      return {
        text: sql,
        structured: { dialect: input.dialect, outputPath: undefined },
      };
    }
    const written = await writeOutput(
      ctx.root,
      input.outputPath,
      sql,
      input.overwrite,
    );
    return {
      text: `Wrote ${input.dialect} DDL to ${input.outputPath}.`,
      structured: { dialect: input.dialect, outputPath: written },
    };
  },
};
