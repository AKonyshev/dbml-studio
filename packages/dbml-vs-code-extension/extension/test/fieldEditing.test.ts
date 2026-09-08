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
import * as fs from "fs";
import * as path from "path";

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
 * A real schema, anonymised, rather than a fixture written to suit the code.
 *
 * Shared with the unit tests next door, and the reason is the two defects it
 * caught after everything else was green: one index naming a column that is
 * never declared made every column in the file uneditable, and refs written as
 * `"sch.a"."col"` were invisible to the rename. Neither shape exists in a
 * fixture somebody invents while writing the feature.
 */
const FIXTURE =
  "dbml-to-json-table-schema/src/utils/sourceEdit/__fixtures__/realistic.dbml";

/**
 * Found by walking up to `packages/`, because this file runs from `out/` where
 * a path counted from the source tree lands one directory short.
 */
const fixturePath = (): string => {
  let dir = __dirname;
  while (path.basename(dir) !== "packages") {
    const parent = path.dirname(dir);
    assert.notStrictEqual(parent, dir, "packages/ not found above the tests");
    dir = parent;
  }

  return path.join(dir, FIXTURE);
};

const SAMPLE_DBML = fs.readFileSync(fixturePath(), "utf8");

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
        before.includes(`  "col_005" numeric [note: 'Description 5']`),
        "the fixture lost the column this test edits",
      );

      // Exactly what `useDiagramEditingHost` posts, including the text the
      // popup opened against — so the staleness check is exercised as well.
      const request = {
        command: "APPLY_DIAGRAM_EDIT",
        documentUri: uri.toString(),
        requestId: "integration-1",
        operation: {
          kind: "replaceField",
          table: "sch.entity_01",
          field: "col_005",
          text: `"col_005" numeric [not null, note: 'Description 5']`,
        },
        expectedText: `"col_005" numeric [note: 'Description 5']`,
      };

      await diagram.evaluate(
        `window.vsCodeWebviewAPI.postMessage(${JSON.stringify(request)})`,
      );

      await waitFor(
        "the document to carry the edit",
        () => document.getText().includes(`"col_005" numeric [not null`),
        30000,
      );

      const after = document.getText();
      assert.ok(
        after.includes(
          `  "col_004" timestamp [not null, note: 'Description 4']`,
        ),
        "the column beside the edited one changed",
      );
      assert.strictEqual(
        after,
        before.replace(
          `"col_005" numeric [note: 'Description 5']`,
          `"col_005" numeric [not null, note: 'Description 5']`,
        ),
        "more than the edited range was written",
      );

      // One undo, not several: the edit is a workspace edit over the ranges
      // that changed, rather than a rewrite of the whole file.
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand("undo");
      await waitFor(
        "the undo to take the edit back",
        () => !document.getText().includes(`"col_005" numeric [not null`),
        30000,
      );
      assert.strictEqual(document.getText(), before);
    } finally {
      await browser.close();
    }
  });

  test("renames a table, its relations and its saved layout", async function (this: Mocha.Context) {
    this.timeout(180000);

    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} not found`);
    await extension.activate();

    const uri = writeFixture("dbml-rename-", SAMPLE_DBML);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("dbmlStudio.previewDiagramsInPlace");
    await waitFor("the diagram tab", diagramTabIsOpen);

    const browser = await chromium.connectOverCDP(
      `http://127.0.0.1:${DEBUG_PORT}`,
    );

    try {
      const diagram = await findDiagramFrame(browser);
      await settledText(document);

      await diagram.evaluate(
        `window.vsCodeWebviewAPI.postMessage(${JSON.stringify({
          command: "APPLY_DIAGRAM_EDIT",
          documentUri: uri.toString(),
          requestId: "integration-rename",
          operation: {
            kind: "renameTable",
            table: "sch.entity_11",
            newName: "sch.renamed_entity",
          },
        })})`,
      );

      await waitFor(
        "the rename to land",
        () => document.getText().includes(`Table "sch.renamed_entity"`),
        30000,
      );

      const after = document.getText();
      // The three places a name lives, all of which a rename has to carry.
      assert.ok(
        !after.includes(`"sch.entity_11"`),
        "the old name survived somewhere",
      );
      assert.ok(
        after.includes(`"sch.renamed_entity"."col_`),
        "the relations did not follow the rename",
      );
      assert.ok(
        after.includes(`{"name":"sch.renamed_entity"`),
        "the saved layout did not follow the rename",
      );
    } finally {
      await browser.close();
    }
  });
});
