/**
 * The other end of the editing path, in a real workbench.
 *
 * The pure core is covered by unit tests and so is the keyboard, but what none
 * of them can show is the part that only exists inside VS Code: a message from
 * the page turning into characters in a file the reader has open, through a
 * workspace edit that one undo takes back. The relay test next door proves a
 * command reaches the page; this proves a request from the page reaches the
 * document.
 *
 * The request is posted from inside the diagram's frame using the page's own
 * cached webview API, rather than by clicking a column. Hit-testing a canvas
 * from a test would be measuring Konva's arithmetic, which is not what is at
 * risk here.
 */
import * as assert from "assert";

import * as vscode from "vscode";
import { chromium, type Frame } from "playwright";

import {
  DEBUG_PORT,
  EXTENSION_ID,
  diagramTabIsOpen,
  sleep,
  waitFor,
  writeFixture,
} from "./helpers";

/**
 * Shaped after a schema this feature was first broken on, not after a fixture
 * that suits it: the second table carries an index naming a column that is not
 * declared. The diagram draws such a file without complaint, and the editing
 * core must too — building the DBML model instead rejects it, and used to make
 * every column in the file uneditable while blaming a table nobody touched.
 */
const SAMPLE_DBML = `Table users {
  id uuid [pk]
  email varchar
}

Table reports {
  id uuid [pk]

  Indexes {
    dt
  }
}
`;

/**
 * The diagram writes table positions into the file shortly after it opens, so
 * the text this test starts from is the settled one, not the one on disk.
 */
const settledText = async (document: vscode.TextDocument): Promise<string> => {
  let previous = document.getText();
  for (let quiet = 0; quiet < 5; quiet += 1) {
    await sleep(300);
    const current = document.getText();
    if (current !== previous) {
      previous = current;
      quiet = 0;
    }
  }

  return document.getText();
};

const findDiagramFrame = async (
  browser: Awaited<ReturnType<typeof chromium.connectOverCDP>>,
): Promise<Frame> => {
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
    assert.ok(found.length <= 1, `${found.length} diagram frames are open`);
    diagram = found[0] ?? null;

    return diagram !== null;
  });

  return diagram as unknown as Frame;
};

suite("an edit from the diagram reaches the document", () => {
  teardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("writes one column and undoes as one step", async function (this: Mocha.Context) {
    this.timeout(180000);

    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} not found`);
    await extension.activate();

    const uri = writeFixture("dbml-edit-", SAMPLE_DBML);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("dbmlStudio.previewDiagramsInPlace");
    await waitFor("the diagram tab", diagramTabIsOpen);

    const browser = await chromium.connectOverCDP(
      `http://127.0.0.1:${DEBUG_PORT}`,
    );

    try {
      const diagram = await findDiagramFrame(browser);
      const before = await settledText(document);
      assert.ok(
        before.includes("  email varchar"),
        `the fixture lost its column: ${before}`,
      );

      // Exactly what `useDiagramEditingHost` posts, including the text the
      // popup opened against — so the staleness check is exercised as well.
      const request = {
        command: "APPLY_DIAGRAM_EDIT",
        documentUri: uri.toString(),
        requestId: "integration-1",
        operation: {
          kind: "replaceField",
          table: "users",
          field: "email",
          text: "email varchar [unique]",
        },
        expectedText: "email varchar",
      };

      await diagram.evaluate(
        `window.vsCodeWebviewAPI.postMessage(${JSON.stringify(request)})`,
      );

      await waitFor(
        "the document to carry the edit",
        () => document.getText().includes("email varchar [unique]"),
        30000,
      );

      const after = document.getText();
      assert.ok(
        after.includes("  id uuid [pk]"),
        "the column beside the edited one changed",
      );
      assert.strictEqual(
        after,
        before.replace("  email varchar", "  email varchar [unique]"),
        "more than the edited range was written",
      );

      // One undo, not several: the edit is a workspace edit over the ranges
      // that changed, rather than a rewrite of the whole file.
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand("undo");
      await waitFor(
        "the undo to take the edit back",
        () => !document.getText().includes("[unique]"),
        30000,
      );
      assert.strictEqual(document.getText(), before);
    } finally {
      await browser.close();
    }
  });
});
