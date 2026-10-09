import { ExtensionContext, QuickPickItem, l10n, window } from "vscode";

import { openConnectionForm } from "./connectionForm/connectionFormPanel";
import { getConnection, listConnections } from "./connectionStore";

// A function, not a constant: l10n.t must not run at module load, before the
// bundle is available. The `$(add)` icon token stays outside the translated
// text so a translator cannot break the markup.
export const newConnectionLabel = (): string =>
  `$(add) ${l10n.t("New connection")}`;

export interface PickedConnection {
  connectionString: string;
}

type ConnectionPickItem = QuickPickItem &
  ({ pickKind: "saved"; connectionName: string } | { pickKind: "new" });

export async function pickDatabaseConnection(
  context: ExtensionContext,
): Promise<PickedConnection | undefined> {
  const saved = await listConnections(context.secrets);
  const items: ConnectionPickItem[] = [
    ...saved.map((name): ConnectionPickItem => ({
      label: name,
      pickKind: "saved",
      connectionName: name,
    })),
    { label: newConnectionLabel(), pickKind: "new" },
  ];
  const choice = await window.showQuickPick(items, {
    placeHolder: l10n.t("Select a saved connection or create a new one"),
  });
  if (choice === undefined) {
    return undefined;
  }

  if (choice.pickKind === "saved") {
    const existing = await getConnection(
      context.secrets,
      choice.connectionName,
    );
    if (existing == null) {
      void window.showErrorMessage(
        l10n.t(
          'Saved connection "{0}" is no longer available.',
          choice.connectionName,
        ),
      );
      return undefined;
    }
    return { connectionString: existing };
  }

  // The form saves what it makes, and the tree refreshes itself when the
  // secret changes, so there is nothing to refresh here and nothing to offer
  // to save afterwards.
  const outcome = await openConnectionForm({
    context,
    refresh: () => undefined,
  });
  return outcome === undefined
    ? undefined
    : { connectionString: outcome.connectionString };
}
