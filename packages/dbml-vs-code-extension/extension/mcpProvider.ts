import path from "node:path";

import {
  EventEmitter,
  l10n,
  McpStdioServerDefinition,
  Uri,
  type McpServerDefinitionProvider,
} from "vscode";
import {
  CONNECTION_ENV_PREFIX,
  CONNECTION_NAMES_ENV,
} from "dbml-mcp/connections";
import { VERSION } from "dbml-mcp/version";

import {
  getConnection,
  listConnections,
  type SecretStore,
} from "./connectionStore";

export const MCP_PROVIDER_ID = "dbmlStudio.mcp";

// A saved connection's name is free text in any language, which a variable
// name cannot carry. Each connection travels under a numbered variable, and
// DBML_CONNECTION_NAMES maps the numbers back to the names. The server trims
// the names and refuses to start on a blank one, so they are trimmed here and
// a blank name is left out without a word: it names nothing an agent could
// ask for. The server matches names case-insensitively, so names equal once
// trimmed but for case cannot both be given: every one of them is left out and
// returned as a collision, as saved.
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function connectionEnv(connections: Record<string, string>): {
  env: Record<string, string>;
  collisions: string[][];
} {
  const byKey = new Map<string, { saved: string; name: string }[]>();
  const entries = Object.keys(connections)
    .map((saved) => ({ saved, name: saved.trim() }))
    .filter(({ name }) => name !== "")
    .sort((a, b) => compare(a.name, b.name) || compare(a.saved, b.saved));
  for (const entry of entries) {
    const key = entry.name.toLowerCase();
    byKey.set(key, [...(byKey.get(key) ?? []), entry]);
  }
  const env: Record<string, string> = {};
  const names: Record<string, string> = {};
  const collisions: string[][] = [];
  for (const group of byKey.values()) {
    if (group.length > 1) {
      collisions.push(group.map(({ saved }) => saved));
      continue;
    }
    const suffix = `C${Object.keys(names).length + 1}`;
    names[suffix] = group[0].name;
    env[`${CONNECTION_ENV_PREFIX}${suffix}`] = connections[group[0].saved];
  }
  env[CONNECTION_NAMES_ENV] = JSON.stringify(names);
  return { env, collisions };
}

interface Deps {
  secrets: SecretStore;
  extensionPath: string;
  extensionVersion: string;
  isEnabled: () => boolean;
  workspaceFolder: () => string | undefined;
  warn: (message: string) => void;
}

const BASE_ENV = { ELECTRON_RUN_AS_NODE: "1" };

const serverPath = (deps: Deps): string =>
  path.join(deps.extensionPath, "dist", "mcp", "server.cjs");

// VS Code starts the server with the extension host's own environment under
// the definition's env. A DBML_CONNECTION_* variable in the shell VS Code was
// started from would reach the agent beside the saved connections; null
// removes it.
function inheritedConnectionsRemoved(
  ours: Record<string, string>,
): Record<string, null> {
  const removed: Record<string, null> = {};
  for (const key of Object.keys(process.env)) {
    if (key.toUpperCase().startsWith(CONNECTION_ENV_PREFIX) && !(key in ours)) {
      removed[key] = null;
    }
  }
  return removed;
}

export function createMcpProvider(
  deps: Deps,
): McpServerDefinitionProvider<McpStdioServerDefinition> & {
  refresh: () => void;
} {
  const changed = new EventEmitter<void>();
  // VS Code treats a changed `version` as "this definition is outdated" and
  // restarts the server; an identical definition would leave a running server
  // holding the connections it started with. The counter carries no secrets.
  // The extension's version leads, so an extension update alone is a change.
  let generation = 0;
  return {
    onDidChangeMcpServerDefinitions: changed.event,
    refresh: () => {
      generation += 1;
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
          [serverPath(deps)],
          { ...BASE_ENV },
          `${deps.extensionVersion}-${VERSION}` +
            (generation === 0 ? "" : `+${generation}`),
        ),
      ];
    },
    // Called right before the server starts: the connections are read now,
    // so a connection saved a minute ago is there. Everything is set afresh
    // rather than added, so resolving one definition twice changes nothing.
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
            "DBML Studio: the connections {0} cannot both be given to AI agents, because their names differ only in letter case. Rename one.",
            names.join(", "),
          ),
        );
      }
      definition.env = {
        ...BASE_ENV,
        ...env,
        ...inheritedConnectionsRemoved(env),
      };
      // The server reads and writes files only inside the folder it is told
      // about; with no folder open it is told there is none, rather than
      // falling back to wherever VS Code started it (the home folder).
      const folder = deps.workspaceFolder();
      if (folder !== undefined) {
        definition.args = [serverPath(deps), "--root", folder];
        definition.cwd = Uri.file(folder);
      } else {
        definition.args = [serverPath(deps), "--no-root"];
        definition.cwd = undefined;
      }
      return definition;
    },
  };
}
