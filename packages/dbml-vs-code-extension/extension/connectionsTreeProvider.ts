import * as vscode from "vscode";
import {
  dialectOf,
  listDatabases,
  listSchemas,
  withDatabase,
  type DialectId,
} from "db-to-dbml";

import { getAllConnections, getConnection } from "./connectionStore";
import {
  ACTION_NODES,
  CONNECTION_UNAVAILABLE,
  DATABASES_UNREADABLE,
  GROUP_NODES,
  SCHEMAS_UNREADABLE,
  buildConnectionNodes,
  buildDatabaseNodes,
  buildSchemaNodes,
  errorNode,
  type PanelNode,
} from "./panelNodes";

function dialectOrNull(connectionString: string): DialectId | null {
  try {
    return dialectOf(connectionString);
  } catch {
    return null;
  }
}

export class ConnectionsTreeProvider implements vscode.TreeDataProvider<PanelNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // VS Code re-asks for the children of every expanded node on each refresh,
  // and every answer below that is not already here costs a connection to the
  // server. Promises rather than values, so two expansions racing each other
  // share one round trip. ⟳ is what empties it.
  private readonly children = new Map<string, Promise<PanelNode[]>>();

  // The database behind each connection, by name. `getTreeItem` is synchronous
  // and a connection string lives in SecretStorage, so the answer is learned
  // while the connections are listed or expanded and read from here. `null` is
  // a saved value that names no supported database; the connection stays in the
  // tree, without a description, so it can still be deleted. Only the dialect is
  // kept, never the string it came from.
  private readonly dialects = new Map<string, DialectId | null>();

  constructor(private readonly secrets: vscode.SecretStorage) {}

  public refresh(): void {
    this.children.clear();
    this.dialects.clear();
    this._onDidChangeTreeData.fire();
  }

  // Labels are translated here rather than in panelNodes: that module is a
  // pure model with no vscode dependency, and its English strings double as the
  // l10n keys. A connection's name is user data and is never translated.
  public getTreeItem(node: PanelNode): vscode.TreeItem {
    switch (node.kind) {
      case "group": {
        const item = new vscode.TreeItem(
          vscode.l10n.t(node.label),
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.contextValue =
          node.id === "actions" ? "dbmlActionsGroup" : "dbmlConnectionsGroup";
        return item;
      }
      case "action": {
        const label = vscode.l10n.t(node.label);
        const item = new vscode.TreeItem(
          label,
          vscode.TreeItemCollapsibleState.None,
        );
        item.command = { command: node.commandId, title: label };
        item.iconPath = new vscode.ThemeIcon(node.icon);
        return item;
      }
      case "connection": {
        const item = new vscode.TreeItem(
          node.name,
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.contextValue = "dbmlConnection";
        // A connection is a server now, and its children are its databases.
        item.iconPath = new vscode.ThemeIcon("server");
        // The database's name is a brand, not a sentence: it is not translated.
        item.description = this.dialects.get(node.name) ?? undefined;
        return item;
      }
      case "database": {
        const item = new vscode.TreeItem(
          node.databaseName,
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.contextValue = "dbmlDatabase";
        item.iconPath = new vscode.ThemeIcon("database");
        return item;
      }
      case "schema": {
        const item = new vscode.TreeItem(
          node.schemaName,
          vscode.TreeItemCollapsibleState.None,
        );
        item.contextValue = "dbmlSchema";
        item.iconPath = new vscode.ThemeIcon("symbol-namespace");
        return item;
      }
      case "error": {
        const item = new vscode.TreeItem(
          vscode.l10n.t(node.label),
          vscode.TreeItemCollapsibleState.None,
        );
        item.contextValue = "dbmlError";
        item.iconPath = new vscode.ThemeIcon("error");
        return item;
      }
      case "empty": {
        const item = new vscode.TreeItem(
          vscode.l10n.t(node.label),
          vscode.TreeItemCollapsibleState.None,
        );
        item.contextValue = "dbmlEmpty";
        return item;
      }
    }
  }

  public async getChildren(node?: PanelNode): Promise<PanelNode[]> {
    if (node === undefined) {
      return GROUP_NODES;
    }
    if (node.kind === "group" && node.id === "actions") {
      return ACTION_NODES;
    }
    if (node.kind === "group" && node.id === "connections") {
      const saved = await getAllConnections(this.secrets);
      for (const [name, connectionString] of Object.entries(saved)) {
        this.dialects.set(name, dialectOrNull(connectionString));
      }
      return buildConnectionNodes(Object.keys(saved).sort());
    }
    if (node.kind === "connection") {
      return await this.cached(
        JSON.stringify(["databases", node.name]),
        async () => await this.databaseNodes(node.name),
      );
    }
    if (node.kind === "database") {
      return await this.cached(
        JSON.stringify(["schemas", node.connectionName, node.databaseName]),
        async () =>
          await this.schemaNodes(node.connectionName, node.databaseName),
      );
    }
    return [];
  }

  private async cached(
    key: string,
    load: () => Promise<PanelNode[]>,
  ): Promise<PanelNode[]> {
    const pending = this.children.get(key);
    if (pending !== undefined) {
      return await pending;
    }

    // A rejection must never be what the cache holds. Every later expansion
    // would re-await the same rejected promise, and VS Code answers a rejected
    // getChildren with a silent empty node — leaving ⟳ as the only way back.
    const started = load().catch((error: unknown) => {
      this.children.delete(key);
      throw error;
    });
    this.children.set(key, started);

    const nodes = await started;
    // A failure is not worth remembering. Collapsing and expanding again is how
    // anyone retries, and ⟳ should not be the only way back from a server that
    // has since come up.
    if (nodes.some((child) => child.kind === "error")) {
      this.children.delete(key);
    }
    return nodes;
  }

  // The secret store can fail as well as come up empty: a locked or broken
  // keychain rejects rather than answering. Either way the connection is what
  // is unavailable, and neither may reach the caller as a rejection.
  private async connectionString(
    connectionName: string,
  ): Promise<string | undefined> {
    try {
      return (await getConnection(this.secrets, connectionName)) ?? undefined;
    } catch (error) {
      console.error("[dbml] reading the connection failed", error);
      return undefined;
    }
  }

  // Nothing here may throw. VS Code answers a rejected getChildren with an
  // empty node and no explanation, so a failure has to become a child that says
  // what happened, with the cause in the Extension Host log.
  private async databaseNodes(connectionName: string): Promise<PanelNode[]> {
    const connectionString = await this.connectionString(connectionName);
    if (connectionString === undefined) {
      return [errorNode(CONNECTION_UNAVAILABLE)];
    }

    // A string that names no supported database cannot be listed either; the
    // error node below is what says so.
    const dialect = dialectOrNull(connectionString);
    this.dialects.set(connectionName, dialect);
    if (dialect === null) {
      return [errorNode(DATABASES_UNREADABLE)];
    }

    try {
      return buildDatabaseNodes(
        connectionName,
        await listDatabases(connectionString),
        dialect,
      );
    } catch (error) {
      console.error("[dbml] listing databases failed", error);
      return [errorNode(DATABASES_UNREADABLE)];
    }
  }

  private async schemaNodes(
    connectionName: string,
    databaseName: string,
  ): Promise<PanelNode[]> {
    const connectionString = await this.connectionString(connectionName);
    if (connectionString === undefined) {
      return [errorNode(CONNECTION_UNAVAILABLE)];
    }

    try {
      return buildSchemaNodes(
        connectionName,
        databaseName,
        await listSchemas(withDatabase(connectionString, databaseName)),
      );
    } catch (error) {
      console.error("[dbml] listing schemas failed", error);
      return [errorNode(SCHEMAS_UNREADABLE)];
    }
  }
}
