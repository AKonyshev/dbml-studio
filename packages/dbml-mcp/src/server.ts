import { McpServer } from "@modelcontextprotocol/server";

import { ToolError } from "./errors";
import { TOOLS } from "./tools";
import { VERSION } from "./version";

import type { ToolContext, ToolResult } from "./context";
import type { CallToolResult } from "@modelcontextprotocol/server";

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
    const text =
      error instanceof ToolError
        ? `${error.code}: ${error.message}`
        : "UNKNOWN: The tool failed unexpectedly.";
    return { isError: true, content: [{ type: "text", text }] };
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
