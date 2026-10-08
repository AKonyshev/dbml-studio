import { z } from "zod";

export const sourceShape = {
  text: z
    .string()
    .optional()
    .describe("The content itself. Give this or `path`, not both."),
  path: z
    .string()
    .optional()
    .describe(
      "A file inside the server's working folder. Give this or `text`, not both.",
    ),
};

export const outputShape = {
  outputPath: z
    .string()
    .optional()
    .describe(
      "Write the result to this file inside the working folder and answer with a summary only.",
    ),
  overwrite: z
    .boolean()
    .default(false)
    .describe("Replace `outputPath` if it exists."),
};

export interface ParseProblem {
  message: string;
  line: number;
  column: number;
}

// @dbml/core throws two shapes: a syntax error from the grammar, with
// `location.start`, and a CompilerError holding `diags`, each with its own
// location. Both become a flat list.
export function parseErrors(error: unknown): ParseProblem[] {
  interface Located {
    message?: string;
    location?: { start?: { line?: number; column?: number } };
  }
  const one = (e: Located): ParseProblem => ({
    message: e.message ?? "Could not parse the input.",
    line: e.location?.start?.line ?? 0,
    column: e.location?.start?.column ?? 0,
  });
  const diags = (error as { diags?: Located[] } | undefined)?.diags;
  if (Array.isArray(diags) && diags.length > 0) return diags.map(one);
  return [one(error as Located)];
}

export const describeProblems = (problems: ParseProblem[]): string =>
  problems
    .map((p) => `line ${p.line}, column ${p.column}: ${p.message}`)
    .join("\n");
