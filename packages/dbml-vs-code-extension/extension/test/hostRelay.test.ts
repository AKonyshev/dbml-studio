/**
 * The one test that watches a command arrive in the page.
 *
 * Everything else about the relay is checked in pieces — the manifest declares
 * the command, the extension registers it, `readDiagramAction` decides what
 * counts — and every piece was green while the whole thing did nothing: the
 * page dropped each message on a sender check that cannot hold inside a
 * webview. Only a test that runs a command in a real VS Code and then looks at
 * what the page did notices that.
 *
 * It attaches to the running instance over the debugging port rather than
 * asking the page anything, because the page has no way to answer: the
 * extension can post to a webview but a test cannot read one.
 */
import * as assert from "assert";

import * as vscode from "vscode";
import { chromium, type Frame } from "playwright";

import {
  DEBUG_PORT,
  EXTENSION_ID,
  diagramTabIsOpen,
  waitFor,
  writeFixture,
} from "./helpers";

/**
 * `colorRelations` because it needs nothing from the pointer and writes what it
 * does straight to local storage, where this test can see it.
 *
 * The literal is `STORAGE_KEYS.COLOR_RELATIONS`, restated rather than imported:
 * `tsconfig.tests.json` keeps `rootDir` at this package, and the constant lives
 * in the visualizer. Renaming it there has to fail here, and it will — the
 * assertion below is the only thing this test asserts.
 */
const COLOR_RELATIONS_KEY = "enableAlwaysHover";

const SAMPLE_DBML = `Table users {
  id uuid [pk]
}
`;

suite("a command reaches the diagram", () => {
  teardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("running one changes what the page has stored", async function (this: Mocha.Context) {
    this.timeout(120000);

    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} not found`);
    await extension.activate();

    const uri = writeFixture("dbml-relay-", SAMPLE_DBML);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("dbmlStudio.previewDiagramsInPlace");
    await waitFor("the diagram tab", diagramTabIsOpen);

    const browser = await chromium.connectOverCDP(
      `http://127.0.0.1:${DEBUG_PORT}`,
    );

    try {
      // `acquireVsCodeApi` is what tells our page apart from the workbench
      // around it and from VS Code's own webview shell.
      let diagram: Frame | null = null;
      await waitFor("the diagram's frame to appear", async () => {
        const found: Frame[] = [];
        for (const page of browser.contexts().flatMap((c) => c.pages())) {
          for (const frame of page.frames()) {
            const isOurs = await frame
              .evaluate("typeof acquireVsCodeApi === 'function'")
              .catch(() => false);
            if (isOurs === true) {
              found.push(frame);
            }
          }
        }
        // More than one would mean a second diagram left open by an earlier
        // test, and picking either of them would be a coin toss.
        assert.ok(found.length <= 1, `${found.length} diagram frames are open`);
        diagram = found[0] ?? null;

        return diagram !== null;
      });

      const storedValue = async (): Promise<string | null> =>
        (await diagram!.evaluate(
          `localStorage.getItem(${JSON.stringify(COLOR_RELATIONS_KEY)})`,
        )) as string | null;

      // Cleared rather than assumed absent. VS Code gives each webview a fresh
      // origin, so in practice this starts empty — but that is its detail to
      // change, and a test that only passes the first time on a given machine
      // is worse than no test.
      await diagram!.evaluate(
        `localStorage.removeItem(${JSON.stringify(COLOR_RELATIONS_KEY)})`,
      );

      // Asked repeatedly, not once after a fixed wait. The extension drops a
      // command that arrives before the page has registered its actions
      // (`DiagramView.runAction`), rather than queueing it — so a single
      // command issued against a slow boot is lost, and the failure would read
      // exactly like the regression this test exists to catch.
      await waitFor(
        "the page to act on the command",
        async () => {
          await vscode.commands.executeCommand("dbmlStudio.colorRelations");
          return (await storedValue()) !== null;
        },
        60000,
      );
    } finally {
      await browser.close();
    }
  });
});
