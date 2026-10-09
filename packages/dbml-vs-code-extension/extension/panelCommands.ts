import { ExtensionContext, l10n, window } from "vscode";

import { compareWithDatabase } from "./compareWithDatabase";
import {
  CONNECTION_PLACEHOLDER,
  connectionPrompt,
  validateConnectionInput,
} from "./connectionInput";
import type { ConnectionsTreeProvider } from "./connectionsTreeProvider";
import {
  deleteConnection,
  getConnection,
  saveConnection,
} from "./connectionStore";
import { importFromDatabase } from "./importFromDatabase";
import type { PanelNode } from "./panelNodes";
import type { ImportPreselect } from "./pickImportTargets";

export async function addConnection(
  context: ExtensionContext,
  provider: ConnectionsTreeProvider,
): Promise<void> {
  const name = await window.showInputBox({
    prompt: l10n.t("Name for this connection"),
    ignoreFocusOut: true,
  });
  if (name == null || name === "") {
    return;
  }
  const connectionString = await window.showInputBox({
    prompt: connectionPrompt(),
    placeHolder: CONNECTION_PLACEHOLDER,
    validateInput: validateConnectionInput,
    password: true,
    ignoreFocusOut: true,
  });
  if (connectionString == null || connectionString === "") {
    return;
  }
  await saveConnection(context.secrets, name, connectionString);
  provider.refresh();
}

export async function deleteConnectionCommand(
  context: ExtensionContext,
  provider: ConnectionsTreeProvider,
  node?: PanelNode,
): Promise<void> {
  if (node === undefined || node.kind !== "connection") {
    return;
  }
  // One binding for the button label and the comparison: localizing only the
  // label would make the confirmation never match.
  const deleteLabel = l10n.t("Delete");
  const confirm = await window.showWarningMessage(
    l10n.t('Delete connection "{0}"?', node.name),
    { modal: true },
    deleteLabel,
  );
  if (confirm !== deleteLabel) {
    return;
  }
  await deleteConnection(context.secrets, node.name);
  provider.refresh();
}

// A node knows the whole path down to itself, so one command serves all three
// depths: the wizard skips whatever the node has already answered.
async function preselectFor(
  context: ExtensionContext,
  node?: PanelNode,
): Promise<ImportPreselect | undefined> {
  if (
    node === undefined ||
    (node.kind !== "connection" &&
      node.kind !== "database" &&
      node.kind !== "schema")
  ) {
    return undefined;
  }

  const connectionName =
    node.kind === "connection" ? node.name : node.connectionName;
  const connectionString = await getConnection(context.secrets, connectionName);
  if (connectionString == null) {
    void window.showErrorMessage(
      l10n.t('Connection "{0}" not found.', connectionName),
    );
    return undefined;
  }

  return {
    connectionString,
    databaseName: node.kind === "connection" ? undefined : node.databaseName,
    schemaName: node.kind === "schema" ? node.schemaName : undefined,
  };
}

export async function importFromConnection(
  context: ExtensionContext,
  node?: PanelNode,
): Promise<void> {
  const preselect = await preselectFor(context, node);
  if (preselect === undefined) {
    return;
  }
  await importFromDatabase(context, preselect);
}

export async function compareWithConnection(
  context: ExtensionContext,
  node?: PanelNode,
): Promise<void> {
  const preselect = await preselectFor(context, node);
  if (preselect === undefined) {
    return;
  }
  // A schema node's schema is not what is being compared; only its database
  // matters, and `compareWithDatabase` ignores the rest.
  await compareWithDatabase(context, preselect);
}
