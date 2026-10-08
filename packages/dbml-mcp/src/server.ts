import { McpServer } from "@modelcontextprotocol/server";

import { ToolError } from "./errors";
import { TOOLS } from "./tools";
import { VERSION } from "./version";

import type { ToolContext, ToolResult } from "./context";
import type {
  CallToolResult,
  StandardSchemaWithJSON,
} from "@modelcontextprotocol/server";
import type { z } from "zod";

// Something to go on when a tool fails unexpectedly, on stderr, which the
// client logs and the model never sees. Only the error's name and code: the
// message may quote a connection string. Either is left out unless it looks
// like an identifier.
const IDENTIFIER = /^[\w.-]{1,64}$/;

function logUnexpected(error: unknown): void {
  const { name, code } = (error ?? {}) as { name?: unknown; code?: unknown };
  const parts = ["dbml-mcp: unexpected"];
  parts.push(
    typeof name === "string" && IDENTIFIER.test(name) ? name : "error",
  );
  if (
    (typeof code === "string" || typeof code === "number") &&
    IDENTIFIER.test(String(code))
  ) {
    parts.push(String(code));
  }
  process.stderr.write(`${parts.join(" ")}\n`);
}

// An error result carries no structuredContent: the SDK skips output
// validation for `isError` results, so a declared outputSchema is fine.
export async function toCallResult(
  run: () => Promise<ToolResult<unknown>>,
): Promise<CallToolResult> {
  try {
    const { text, structured } = await run();
    return {
      content: [{ type: "text", text }],
      structuredContent: structured as Record<string, unknown>,
    };
  } catch (error) {
    if (error instanceof ToolError) {
      const text = `${error.code}: ${error.message}`;
      return { isError: true, content: [{ type: "text", text }] };
    }
    logUnexpected(error);
    return {
      isError: true,
      content: [
        { type: "text", text: "UNKNOWN: The tool failed unexpectedly." },
      ],
    };
  }
}

// The SDK asks a schema for its JSON Schema with `target: "draft-2020-12"`
// hard-coded, and zod then stamps `$schema: ".../draft/2020-12/schema"` on it.
// VS Code's Copilot cannot resolve that meta-schema, logs "Error compiling
// input schema" for every tool and skips argument validation. The SDK has no
// option for the dialect, but it accepts any Standard Schema that supplies its
// own JSON form, so this wraps the zod schema with the same JSON Schema minus
// the `$schema` key (MCP clients assume 2020-12 when it is absent). Parsing is
// zod's own `validate`, untouched, so input and structuredContent are still
// checked the same way.
export function withoutSchemaKey(
  schema: z.ZodType,
): StandardSchemaWithJSON<unknown, unknown> {
  const standard = schema["~standard"];
  const convert =
    (io: "input" | "output") =>
    (options: Parameters<typeof standard.jsonSchema.input>[0]) => {
      const { $schema: _dialect, ...rest } = standard.jsonSchema[io](options);
      return rest;
    };
  return {
    "~standard": {
      ...standard,
      jsonSchema: { input: convert("input"), output: convert("output") },
    },
  };
}

export function createServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: "dbml-mcp", version: VERSION });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: withoutSchemaKey(tool.inputSchema),
        outputSchema: withoutSchemaKey(tool.outputSchema),
        annotations: tool.annotations,
      },
      async (input: unknown) =>
        await toCallResult(async () => await tool.run(input as never, ctx)),
    );
  }
  return server;
}
