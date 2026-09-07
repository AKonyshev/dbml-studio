import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import * as vscode from "vscode";

import { DIAGRAM_ACTION_COMMANDS } from "../diagramActionCommands";

const EXTENSION_ID = "konyshevav.dbml-studio";
const DIAGRAM_VIEW_TYPE = "dbml-studio-diagram";

const SAMPLE_DBML = `Table users {
  id uuid [pk]
}

Table orders {
  id uuid [pk]
  user_id uuid
}

Ref: orders.user_id > users.id
`;

const openTabs = (): readonly vscode.Tab[] =>
  vscode.window.tabGroups.all.flatMap((group) => group.tabs);

/**
 * The commands kick their work off without awaiting it, so the assertions have
 * to wait for the workbench to settle rather than for the command to return.
 */
const waitFor = async (
  describe: string,
  predicate: () => boolean,
  timeoutMs = 15000,
): Promise<void> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const seen = openTabs().map((tab) => {
    const input = tab.input as { viewType?: string } | undefined;
    return `${tab.label}${input?.viewType ? ` (${input.viewType})` : " (text)"}`;
  });
  assert.fail(
    `timed out waiting for ${describe}; tabs: ${JSON.stringify(seen)}`,
  );
};

const tabsFor = (uri: vscode.Uri, viewType?: string): vscode.Tab[] =>
  openTabs().filter((tab) => {
    const input = tab.input as
      | { uri?: vscode.Uri; viewType?: string }
      | undefined;
    if (input?.uri?.toString() !== uri.toString()) {
      return false;
    }

    return input.viewType === viewType;
  });

suite("text/diagram toggle", () => {
  let uri: vscode.Uri;

  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} not found`);
    await extension.activate();

    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "dbml-toggle-")),
      "schema.dbml",
    );
    fs.writeFileSync(file, SAMPLE_DBML, "utf8");
    uri = vscode.Uri.file(file);
  });

  teardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("the file opens as text and is recognised as dbml", async () => {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    assert.strictEqual(document.languageId, "dbml");
    await waitFor("the text tab", () => tabsFor(uri).length === 1);
  });

  test("opening in place replaces the text tab with the diagram", async () => {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
    await waitFor("the text tab", () => tabsFor(uri).length === 1);

    await vscode.commands.executeCommand("dbmlStudio.previewDiagramsInPlace");

    await waitFor(
      "the diagram tab",
      () => tabsFor(uri, DIAGRAM_VIEW_TYPE).length === 1,
    );
    // The point of the whole feature: one tab, not two.
    await waitFor("the text tab to go", () => tabsFor(uri).length === 0);
    assert.strictEqual(openTabs().length, 1);
  });

  test("showing the source replaces the diagram tab with the text", async () => {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("dbmlStudio.previewDiagramsInPlace");
    await waitFor(
      "the diagram tab",
      () => tabsFor(uri, DIAGRAM_VIEW_TYPE).length === 1,
    );

    await vscode.commands.executeCommand("dbmlStudio.showSource");

    await waitFor("the text tab", () => tabsFor(uri).length === 1);
    await waitFor(
      "the diagram tab to go",
      () => tabsFor(uri, DIAGRAM_VIEW_TYPE).length === 0,
    );
    assert.strictEqual(openTabs().length, 1);
  });

  test("opening beside keeps both the text and the diagram", async () => {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    await vscode.commands.executeCommand("dbmlStudio.previewDiagrams");

    await waitFor(
      "the diagram tab",
      () => tabsFor(uri, DIAGRAM_VIEW_TYPE).length === 1,
    );
    assert.strictEqual(
      tabsFor(uri).length,
      1,
      "the text editor should survive an open-beside",
    );
    assert.strictEqual(vscode.window.tabGroups.all.length, 2);
  });

  test("every diagram action is registered as a command", async () => {
    const registered = new Set(await vscode.commands.getCommands(true));

    for (const [command] of DIAGRAM_ACTION_COMMANDS) {
      assert.ok(registered.has(command), `${command} is not registered`);
    }
  });

  test("a diagram action with no diagram open does nothing", async () => {
    // The `when` clause keeps the keys off, but the palette and a rebound key
    // can still reach the command; it has to be safe with nothing to act on.
    for (const [command] of DIAGRAM_ACTION_COMMANDS) {
      await vscode.commands.executeCommand(command);
    }
  });

  test("the diagram is registered as an optional editor for .dbml", async () => {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
    await waitFor("the text tab", () => tabsFor(uri).length === 1);

    // priority "option" means opening the file plainly must still give text.
    assert.strictEqual(tabsFor(uri, DIAGRAM_VIEW_TYPE).length, 0);
  });
});
