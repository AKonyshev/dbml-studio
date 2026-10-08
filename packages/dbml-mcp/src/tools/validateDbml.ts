import { Parser } from "@dbml/core";
import { z } from "zod";

import { readSource } from "../paths";

import {
  describeProblems,
  isParseError,
  parseErrors,
  sourceShape,
} from "./shared";

import type { ToolDefinition } from "../context";

const inputSchema = z.object(sourceShape);
const outputSchema = z.object({
  valid: z.boolean(),
  errors: z.array(
    z.object({ message: z.string(), line: z.number(), column: z.number() }),
  ),
  tables: z.number().optional(),
  refs: z.number().optional(),
});

export const validateDbml: ToolDefinition<
  typeof inputSchema,
  typeof outputSchema
> = {
  name: "validate_dbml",
  title: "Validate DBML",
  description:
    "Check DBML with the DBML compiler: syntax, unknown tables and columns in references, duplicates. Errors come with line and column. Invalid DBML is a normal answer (valid: false), not a failure: read the errors and fix the text.",
  inputSchema,
  outputSchema,
  annotations: { readOnlyHint: true },
  run: async (input, ctx) => {
    const text = await readSource(ctx.root, input);
    try {
      // The full compiler resolves references and catches duplicates; the
      // JSON parser below accepts texts that dbml_to_sql then rejects.
      Parser.parse(text, "dbmlv2");
      const parsed = Parser.parseDBMLToJSON(text) as {
        tables?: unknown[];
        refs?: unknown[];
      };
      const tables = parsed.tables?.length ?? 0;
      const refs = parsed.refs?.length ?? 0;
      return {
        text: `Valid DBML: ${tables} tables, ${refs} references.`,
        structured: { valid: true, errors: [], tables, refs },
      };
    } catch (error) {
      if (!isParseError(error)) throw error;
      const errors = parseErrors(error);
      return {
        text: `Invalid DBML:\n${describeProblems(errors)}`,
        structured: { valid: false, errors },
      };
    }
  },
};
