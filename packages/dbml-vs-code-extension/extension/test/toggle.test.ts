import * as assert from "assert";

import * as vscode from "vscode";

import { DIAGRAM_ACTION_COMMANDS } from "../diagramActionCommands";

import {
  DIAGRAM_VIEW_TYPE,
  EXTENSION_ID,
  openTabs,
  waitFor,
  writeFixture,
} from "./helpers";

const SAMPLE_DBML = `Table users {
  id uuid [pk]
}

Table orders {
  id uuid [pk]
  user_id uuid
}

Ref: orders.user_id > users.id
`;

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

    uri = writeFixture("dbml-toggle-", SAMPLE_DBML);
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
