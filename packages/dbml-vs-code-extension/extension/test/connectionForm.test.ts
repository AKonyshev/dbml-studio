import * as assert from "assert";

import * as vscode from "vscode";

import { EXTENSION_ID, openTabs, waitFor } from "./helpers";

const FORM_VIEW_TYPE = "dbmlStudio.connectionForm";

// A webview panel's viewType is reported with a prefix VS Code adds, so the
// match is on the end of it.
const formTabIsOpen = (): boolean =>
  openTabs().some((tab) => {
    const input = tab.input as { viewType?: string } | undefined;
    return input?.viewType?.endsWith(FORM_VIEW_TYPE) === true;
  });

suite("connection form", () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} not found`);
    await extension.activate();
  });

  teardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("Add connection opens the form in an editor tab", async () => {
    assert.strictEqual(formTabIsOpen(), false);

    await vscode.commands.executeCommand("dbmlStudio.addConnection");

    await waitFor("the connection form tab", formTabIsOpen);

    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    await waitFor("the connection form tab to close", () => !formTabIsOpen());
  });
});
