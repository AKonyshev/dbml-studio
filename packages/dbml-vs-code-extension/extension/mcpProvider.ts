import path from "node:path";

import {
  EventEmitter,
  l10n,
  McpStdioServerDefinition,
  Uri,
  type McpServerDefinitionProvider,
} from "vscode";
import { envSuffix } from "dbml-mcp/envName";
import { VERSION } from "dbml-mcp/version";

import {
  getConnection,
  listConnections,
  type SecretStore,
} from "./connectionStore";

export const MCP_PROVIDER_ID = "dbmlStudio.mcp";
const PREFIX = "DBML_CONNECTION_";

export function connectionEnv(connections: Record<string, string>): {
  env: Record<string, string>;
  collisions: string[][];
} {
  const bySuffix = new Map<string, string[]>();
  for (const name of Object.keys(connections).sort()) {
    const suffix = envSuffix(name);
    bySuffix.set(suffix, [...(bySuffix.get(suffix) ?? []), name]);
  }
  const env: Record<string, string> = {};
  const collisions: string[][] = [];
  for (const [suffix, names] of bySuffix) {
    if (names.length > 1) {
      collisions.push(names);
      continue;
    }
    env[`${PREFIX}${suffix}`] = connections[names[0]];
  }
  return { env, collisions };
}

interface Deps {
  secrets: SecretStore;
  extensionPath: string;
  isEnabled: () => boolean;
  workspaceFolder: () => string | undefined;
  warn: (message: string) => void;
}

export function createMcpProvider(
  deps: Deps,
): McpServerDefinitionProvider<McpStdioServerDefinition> & {
  refresh: () => void;
} {
  const changed = new EventEmitter<void>();
  return {
    onDidChangeMcpServerDefinitions: changed.event,
    refresh: () => {
      changed.fire();
    },
    // Called eagerly by VS Code, so it carries no secrets and asks nothing.
    provideMcpServerDefinitions: async () => {
      if (!deps.isEnabled()) {
        return [];
      }
      return [
        new McpStdioServerDefinition(
          "DBML Studio",
          process.execPath,
          [path.join(deps.extensionPath, "dist", "mcp", "server.cjs")],
          { ELECTRON_RUN_AS_NODE: "1" },
          VERSION,
        ),
      ];
    },
    // Called right before the server starts: the connections are read now,
    // so a connection saved a minute ago is there.
    resolveMcpServerDefinition: async (definition) => {
      const saved: Record<string, string> = {};
      for (const name of await listConnections(deps.secrets)) {
        const value = await getConnection(deps.secrets, name);
        if (value !== undefined) {
          saved[name] = value;
        }
      }
      const { env, collisions } = connectionEnv(saved);
      for (const names of collisions) {
        deps.warn(
          l10n.t(
            "DBML Studio: the connections {0} cannot both be given to AI agents, because their names differ only in punctuation or case. Rename one.",
            names.join(", "),
          ),
        );
      }
      definition.env = { ...definition.env, ...env };
      const folder = deps.workspaceFolder();
      if (folder !== undefined) {
        definition.cwd = Uri.file(folder);
      }
      return definition;
    },
  };
}
