import { importer } from "@dbml/core";
import { z } from "zod";

import { ToolError } from "../errors";
import { readSource, writeOutput } from "../paths";

import {
  describeProblems,
  isParseError,
  outputShape,
  parseErrors,
  sourceShape,
} from "./shared";

import type { ToolDefinition } from "../context";

const inputSchema = z.object({
  ...sourceShape,
  dialect: z.enum(["postgres", "mysql", "mssql", "oracle", "snowflake"]),
  ...outputShape,
});
const outputSchema = z.object({
  dialect: z.string(),
  dbml: z
    .string()
    .optional()
    .describe("The DBML. Present unless it was written to outputPath."),
  outputPath: z.string().optional(),
});

export const sqlToDbml: ToolDefinition<
  typeof inputSchema,
  typeof outputSchema
> = {
  name: "sql_to_dbml",
  title: "SQL to DBML",
  description: "Turn SQL CREATE statements of one dialect into a DBML model.",
  inputSchema,
  outputSchema,
  annotations: { readOnlyHint: false, destructiveHint: true },
  run: async (input, ctx) => {
    const sql = await readSource(ctx.root, input);
    let dbml: string;
    try {
      dbml = importer.import(sql, input.dialect);
    } catch (error) {
      if (!isParseError(error)) throw error;
      throw new ToolError(
        "SQL_PARSE_ERROR",
        describeProblems(parseErrors(error)),
      );
    }
    if (input.outputPath === undefined) {
      return {
        text: dbml,
        structured: { dialect: input.dialect, dbml, outputPath: undefined },
      };
    }
    const written = await writeOutput(
      ctx.root,
      input.outputPath,
      dbml,
      input.overwrite,
    );
    return {
      text: `Wrote DBML to ${input.outputPath}.`,
      structured: { dialect: input.dialect, outputPath: written },
    };
  },
};
