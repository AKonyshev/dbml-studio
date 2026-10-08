import { listSchemaNames } from "db-to-dbml";
import { z } from "zod";

import { fromDbImportError, ToolError } from "../errors";

import type { DatabaseSchema } from "db-to-dbml";

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
interface Located {
  message?: string;
  location?: { start?: { line?: number; column?: number } };
}

// True for the two shapes above. Anything else (a TypeError from inside the
// library, say) is a bug, not a problem with the user's text, and must not be
// reported as invalid input at line 0, column 0.
export function isParseError(error: unknown): boolean {
  const e = error as { diags?: unknown; location?: Located["location"] } | null;
  if (typeof e !== "object" || e === null) return false;
  return (
    (Array.isArray(e.diags) && e.diags.length > 0) ||
    e.location?.start !== undefined
  );
}

export function parseErrors(error: unknown): ParseProblem[] {
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

export const connectionShape = {
  connection: z
    .string()
    .describe("A connection name from list_connections, or a postgres:// URL."),
  database: z
    .string()
    .optional()
    .describe(
      "A database on that server (see list_databases); defaults to the connection's own.",
    ),
};

// Every database call goes through here, so no error from a driver reaches
// the response with its text.
export async function onDatabase<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw fromDbImportError(error);
  }
}

export function assertSchemasExist(db: DatabaseSchema, wanted: string[]): void {
  const present = listSchemaNames(db);
  const missing = wanted.filter((name) => !present.includes(name));
  if (missing.length > 0) {
    const existing = present.length === 0 ? "none" : present.join(", ");
    throw new ToolError(
      "SCHEMA_NOT_FOUND",
      `No tables or enums in schema ${missing.join(", ")}. Schemas with tables or enums: ${existing}.`,
    );
  }
}
