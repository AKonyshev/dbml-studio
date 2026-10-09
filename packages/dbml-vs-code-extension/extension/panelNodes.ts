import type { DialectId } from "db-to-dbml";

export type PanelNode =
  | { kind: "group"; id: "actions" | "connections"; label: string }
  | { kind: "action"; label: string; commandId: string; icon: string }
  | { kind: "connection"; name: string }
  | { kind: "database"; connectionName: string; databaseName: string }
  | {
      kind: "schema";
      connectionName: string;
      databaseName: string;
      schemaName: string;
    }
  | { kind: "empty"; label: string }
  | { kind: "error"; label: string };

// The two top-level groups. They live here rather than inline in the tree
// provider so that every static panel string sits in one model — which is what
// lets one test check them all against the translation bundles.
export const GROUP_NODES: PanelNode[] = [
  { kind: "group", id: "actions", label: "Actions" },
  { kind: "group", id: "connections", label: "Connections" },
];

export const ACTION_NODES: PanelNode[] = [
  {
    kind: "action",
    label: "Show diagram",
    commandId: "dbmlStudio.previewDiagrams",
    icon: "graph",
  },
  {
    kind: "action",
    label: "Import from database",
    commandId: "dbmlStudio.importFromDatabase",
    icon: "cloud-download",
  },
  {
    kind: "action",
    label: "Compare with database",
    commandId: "dbmlStudio.compareWithDatabase",
    icon: "diff",
  },
];

export function buildConnectionNodes(names: string[]): PanelNode[] {
  if (names.length === 0) {
    return [{ kind: "empty", label: "No saved connections" }];
  }
  return names.map((name) => ({ kind: "connection", name }));
}

// A node carries the whole path down to itself: a command invoked on a schema
// has to know which database of which connection it belongs to, and a tree item
// is the only thing VS Code hands the command.
//
// MySQL has no level between a server and its tables: a database there is what
// other servers call a schema. So its databases come out as schema nodes, named
// the same either way, and the tree has no empty middle level.
export function buildDatabaseNodes(
  connectionName: string,
  databaseNames: string[],
  dialect: DialectId,
): PanelNode[] {
  if (databaseNames.length === 0) {
    return [{ kind: "empty", label: "No databases" }];
  }
  if (dialect === "mysql") {
    return databaseNames.map((databaseName) => ({
      kind: "schema",
      connectionName,
      databaseName,
      schemaName: databaseName,
    }));
  }
  return databaseNames.map((databaseName) => ({
    kind: "database",
    connectionName,
    databaseName,
  }));
}

export function buildSchemaNodes(
  connectionName: string,
  databaseName: string,
  schemaNames: string[],
): PanelNode[] {
  if (schemaNames.length === 0) {
    return [{ kind: "empty", label: "No user schemas" }];
  }
  return schemaNames.map((schemaName) => ({
    kind: "schema",
    connectionName,
    databaseName,
    schemaName,
  }));
}

// Expanding a node can fail — a server that has gone away, a database the user
// may not read. A tree provider must not throw while producing children: VS Code
// renders an empty node and says nothing. These are the labels it shows instead,
// constants so that the translation test can find them.
//
// Every label in this module reaches the UI as `l10n.t(node.label)` — a variable,
// not a literal. That resolves fine at runtime, because `l10n.t` is a lookup in
// the loaded bundle, and the test below keeps the bundles honest. But
// `@vscode/l10n-dev` extracts literals only: if the bundles under `l10n/` ever
// stop being written by hand, these strings are the ones that will silently go
// missing.
export const CONNECTION_UNAVAILABLE = "This connection is no longer available";
export const DATABASES_UNREADABLE = "Could not read the list of databases";
export const SCHEMAS_UNREADABLE = "Could not read the list of schemas";

export const errorNode = (label: string): PanelNode => ({
  kind: "error",
  label,
});
