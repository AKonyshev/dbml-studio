import { McpServer } from "@modelcontextprotocol/server";

import { ToolError } from "./errors";
import { TOOLS } from "./tools";
import { VERSION } from "./version";

import type { ToolContext, ToolResult } from "./context";
import type { CallToolResult } from "@modelcontextprotocol/server";

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

export function createServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: "dbml-mcp", version: VERSION });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
      },
      async (input: unknown) =>
        await toCallResult(async () => await tool.run(input as never, ctx)),
    );
  }
  return server;
}
