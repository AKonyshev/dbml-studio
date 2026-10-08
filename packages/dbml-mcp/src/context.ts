import type { DatabaseSchema } from "db-to-dbml";
import type { z } from "zod";
import type { ConnectionSource } from "./connections";

export interface Catalog {
  listDatabases: (connectionString: string) => Promise<string[]>;
  listSchemas: (connectionString: string) => Promise<string[]>;
  fetchSchema: (connectionString: string) => Promise<DatabaseSchema>;
}

export interface ToolContext {
  connections: ConnectionSource;
  root: string | undefined;
  catalog: Catalog;
}

export interface ToolResult<O> {
  text: string;
  structured: O;
}

export interface ToolDefinition<
  I extends z.ZodObject = z.ZodObject,
  O extends z.ZodObject = z.ZodObject,
> {
  name: string;
  title: string;
  description: string;
  inputSchema: I;
  outputSchema: O;
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean };
  run: (input: z.infer<I>, ctx: ToolContext) => Promise<ToolResult<z.infer<O>>>;
}
