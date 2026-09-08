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

const fixturePath = (): string => {
  let dir = __dirname;
  while (path.basename(dir) !== "packages") {
    dir = path.dirname(dir);
  }

  return path.join(
    dir,
    "dbml-to-json-table-schema/src/utils/sourceEdit/__fixtures__/realistic.dbml",
  );
};

const coordsOf = async (frame: Frame): Promise<string> =>
  (await frame.evaluate(`(() => {
    const parts = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("tableCoords:file")) continue;
      const entries = JSON.parse(localStorage.getItem(key) || "[]");
      parts.push(key.split("#")[1] + ":" + entries.slice(0, 3).map((e) => e[0] + "@" + Math.round(e[1].x) + "," + Math.round(e[1].y)).join(" "));
    }
    return parts.join(" | ");
  })()`)) as string;

const nodeAt = async (frame: Frame, table: string): Promise<string> =>
  (await frame.evaluate(`(() => {
    const K = window.Konva;
    if (!K || !K.stages || !K.stages.length) return "no-konva";
    const node = K.stages[0].findOne(${JSON.stringify(`.table-${table.replace(/\s+/g, "_")}`)});
    return node ? Math.round(node.x()) + "," + Math.round(node.y()) : "no-node";
  })()`)) as string;

/**
 * Auto-arrange after a drag, in a real workbench.
 *
 * The one case the unit tests cannot see: a table dragged by hand and then
 * arranged back onto the very numbers it started from. The store-level test
 * proves a fresh layout hands out fresh objects; this proves the table on the
 * canvas actually goes back. It reads the table's own Konva node, which is
 * what the reader is looking at, rather than the store or a screenshot.
 */
suite("auto-arrange after a drag", () => {
  teardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("puts a dragged table back where the layout has it", async function (this: Mocha.Context) {
    this.timeout(180000);
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension);
    await extension.activate();

    const uri = writeFixture(
      "dbml-arrange-",
      fs.readFileSync(fixturePath(), "utf8"),
    );
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("dbmlStudio.previewDiagramsInPlace");
    await waitFor("the diagram tab", diagramTabIsOpen);

    const browser = await chromium.connectOverCDP(
      `http://127.0.0.1:${DEBUG_PORT}`,
    );
    try {
      let diagram: Frame | null = null;
      await waitFor("the diagram frame", async () => {
        for (const page of browser.contexts().flatMap((c) => c.pages())) {
          for (const frame of page.frames()) {
            const ours = await frame
              .evaluate("typeof acquireVsCodeApi === 'function'")
              .catch(() => false);
            if (ours === true) {
              diagram = frame;
            }
          }
        }
        return diagram !== null;
      });
      const frame = diagram as unknown as Frame;
      frame.page().on("console", (m) => {
        const text = m.text();
        if (m.type() === "error" || text.startsWith("AA ")) {
          console.log("PAGE:", text);
        }
      });
      for (let i = 0; i < 6; i += 1) {
        await sleep(300);
      }

      // Find a table header: sweep until F2 opens a box holding a bare name.
      await vscode.commands.executeCommand("dbmlStudio.fitToView");
      await sleep(800);
      const box = await frame.locator("canvas").first().boundingBox();
      assert.ok(box, "no canvas");
      let header: { x: number; y: number; name: string } | null = null;
      outer: for (let ry = 1; ry <= 6; ry += 1) {
        for (let rx = 1; rx <= 8; rx += 1) {
          const x = box.x + (box.width * rx) / 9;
          const y = box.y + (box.height * ry) / 7;
          await frame.page().mouse.move(x, y);
          await sleep(60);
          await vscode.commands.executeCommand("dbmlStudio.quickEdit");
          await sleep(120);
          if ((await frame.locator("textarea").count()) > 0) {
            const held = await frame.locator("textarea").first().inputValue();
            await frame.locator("textarea").first().press("Escape");
            await sleep(80);
            if (!/\s/.test(held.trim())) {
              header = { x, y, name: held.trim() };
              break outer;
            }
          }
        }
      }
      assert.ok(header, "no table header found on the canvas");

      const arranged = await coordsOf(frame);
      const nodeBefore = await nodeAt(frame, header.name);
      assert.ok(
        /^-?\d+,-?\d+$/.test(nodeBefore),
        `no Konva node for ${header.name}: ${nodeBefore}`,
      );

      // Drag it well away from where the layout put it.
      await frame.page().mouse.move(header.x, header.y);
      await frame.page().mouse.down();
      await frame.page().mouse.move(header.x + 60, header.y + 40, { steps: 6 });
      await frame
        .page()
        .mouse.move(header.x + 180, header.y + 120, { steps: 6 });
      await frame.page().mouse.up();
      await sleep(700);
      const nodeMoved = await nodeAt(frame, header.name);
      assert.notStrictEqual(
        nodeMoved,
        nodeBefore,
        "the drag did not move the table",
      );

      await vscode.commands.executeCommand("dbmlStudio.autoArrange");
      await sleep(1200);
      const back = await coordsOf(frame);
      const nodeAfter = await nodeAt(frame, header.name);
      assert.strictEqual(
        nodeAfter,
        nodeBefore,
        "auto-arrange left the table where it was dragged",
      );
      assert.strictEqual(back, arranged, "the stored layout was not restored");
    } finally {
      await browser.close();
    }
  });
});
