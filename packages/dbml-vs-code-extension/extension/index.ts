import {
  commands,
  languages,
  type ExtensionContext,
  type Uri,
  ViewColumn,
  window,
} from "vscode";
import { parseDBMLToJSON } from "dbml-to-json-table-schema";

import { DiagramEditorProvider } from "extension-shared/extension/views/diagramEditorProvider";
import { findTab } from "extension-shared/extension/views/findTab";
import { EXTENSION_CONFIG_SESSION, WEB_VIEW_NAME } from "@/extension/constants";
import { importFromDatabase } from "./importFromDatabase";
import { compareWithDatabase } from "./compareWithDatabase";
import { ConnectionsTreeProvider } from "./connectionsTreeProvider";
import {
  addConnection,
  compareWithConnection,
  deleteConnectionCommand,
  importFromConnection,
} from "./panelCommands";
import { DIAGRAM_ACTION_COMMANDS } from "./diagramActionCommands";
import type { PanelNode } from "./panelNodes";

export function activate(context: ExtensionContext): void {
  const treeProvider = new ConnectionsTreeProvider(context.secrets);
  const diagnostics = languages.createDiagnosticCollection("dbml-studio");

  // Under View → Output → DBML Studio. Editing crosses the page, the extension
  // and the document, and when a reader reports that nothing happened, this is
  // the only place that can say which of the three stopped.
  const output = window.createOutputChannel("DBML Studio");
  context.subscriptions.push(output);

  const { provider, registration } = DiagramEditorProvider.register(
    WEB_VIEW_NAME,
    {
      context,
      diagnostics,
      extensionConfigSession: EXTENSION_CONFIG_SESSION,
      parser: parseDBMLToJSON,
      fileExt: "dbml",
      supportsDbmlFileSync: true,
      log: (line) => {
        output.appendLine(`${new Date().toISOString()} ${line}`);
      },
    },
  );

  // The diagram if one is open, otherwise the file in front of the user.
  const resolveDbmlUri = (): Uri | undefined => {
    const activeDiagram = provider.getActiveView();
    if (activeDiagram !== undefined) {
      return activeDiagram.uri;
    }

    const editor = window.activeTextEditor;
    if (editor?.document.languageId === "dbml") {
      return editor.document.uri;
    }

    void window.showErrorMessage("No active DBML file found.");
    return undefined;
  };

  // `vscode.openWith` cannot replace an editor: it routes through
  // editorService.openEditor, and the workbench keeps replaceEditors — the
  // primitive its own "Reopen Editor With..." uses — to itself. So taking over a
  // tab means opening the replacement and then closing what it replaced.
  // Opening first is what avoids a save prompt: the document is still held open
  // by the new editor, so closing the old tab is not closing its last editor.
  const closeTabFor = async (uri: Uri, viewType?: string): Promise<void> => {
    const tab = findTab(
      window.tabGroups.all.flatMap((group) => group.tabs),
      uri.toString(),
      viewType,
    );
    if (tab === undefined) {
      return;
    }

    await window.tabGroups.close(tab, true);
  };

  const openDiagram = async (viewColumn: ViewColumn): Promise<void> => {
    const uri = resolveDbmlUri();
    if (uri === undefined) {
      return;
    }

    await commands.executeCommand("vscode.openWith", uri, WEB_VIEW_NAME, {
      viewColumn,
    });

    if (viewColumn === ViewColumn.Active) {
      await closeTabFor(uri);
    }
  };

  context.subscriptions.push(
    registration,
    diagnostics,
    window.registerTreeDataProvider("dbmlStudio.panel", treeProvider),
    context.secrets.onDidChange(() => {
      treeProvider.refresh();
    }),
    commands.registerCommand("dbmlStudio.previewDiagrams", () => {
      void openDiagram(ViewColumn.Beside);
    }),
    commands.registerCommand("dbmlStudio.previewDiagramsInPlace", () => {
      void openDiagram(ViewColumn.Active);
    }),
    commands.registerCommand("dbmlStudio.showSource", () => {
      const view = provider.getActiveView();
      if (view === undefined) {
        return;
      }

      const { uri, viewColumn } = view;

      void (async () => {
        // `default` is the documented viewType of the built-in text editor.
        await commands.executeCommand("vscode.openWith", uri, "default", {
          viewColumn,
        });
        await closeTabFor(uri, WEB_VIEW_NAME);
      })();
    }),
    commands.registerCommand("dbmlStudio.importFromDatabase", () => {
      void importFromDatabase(context);
    }),
    commands.registerCommand("dbmlStudio.compareWithDatabase", () => {
      void compareWithDatabase(context);
    }),
    commands.registerCommand("dbmlStudio.addConnection", () => {
      void addConnection(context, treeProvider);
    }),
    commands.registerCommand("dbmlStudio.refreshConnections", () => {
      treeProvider.refresh();
    }),
    commands.registerCommand(
      "dbmlStudio.deleteConnection",
      (node?: PanelNode) => {
        void deleteConnectionCommand(context, treeProvider, node);
      },
    ),
    commands.registerCommand(
      "dbmlStudio.importFromConnection",
      (node?: PanelNode) => {
        void importFromConnection(context, node);
      },
    ),
    commands.registerCommand(
      "dbmlStudio.compareWithConnection",
      (node?: PanelNode) => {
        void compareWithConnection(context, node);
      },
    ),
    // Addressed at the diagram holding focus, which is also what the `when`
    // clause on each keybinding says: with no diagram in front of the reader
    // there is nothing for these to act on, and they do nothing.
    ...DIAGRAM_ACTION_COMMANDS.map(([command, action]) =>
      commands.registerCommand(command, () => {
        provider.getActiveView()?.runAction(action);
      }),
    ),
  );
}

export function deactivate(): void {}
