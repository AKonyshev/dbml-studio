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

/**
 * The frame a renamed table is first drawn in.
 *
 * A rename gives the table a new name, and the name is its React key, so the
 * table is torn down and built again. Its position used to be applied by an
 * effect, which runs *after* the first paint — so for a frame or two the table
 * sat at the canvas origin and then jumped to its place. Reported as "it flies
 * off to the left and comes back", and invisible to every test that compared
 * the state before with the state after.
 *
 * Measured rather than eyeballed: the table's own Konva node is sampled on
 * every animation frame, and the stage is sampled with it so that a pan can be
 * told apart from a table that moved.
 */
suite("the frame a renamed table is first drawn in", () => {
  teardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("never shows the table at the origin", async function (this: Mocha.Context) {
    this.timeout(240000);
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension);
    await extension.activate();

    const uri = writeFixture(
      "dbml-flash-",
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
      for (let i = 0; i < 6; i += 1) {
        await sleep(300);
      }

      await vscode.commands.executeCommand("dbmlStudio.fitToView");
      await sleep(800);

      // Find a table header the same way the reader reaches one.
      const box = await frame.locator("canvas").first().boundingBox();
      assert.ok(box);
      let name: string | null = null;
      outer: for (let ry = 1; ry <= 6; ry += 1) {
        for (let rx = 1; rx <= 8; rx += 1) {
          await frame
            .page()
            .mouse.move(
              box.x + (box.width * rx) / 9,
              box.y + (box.height * ry) / 7,
            );
          await sleep(60);
          await vscode.commands.executeCommand("dbmlStudio.quickEdit");
          await sleep(120);
          if ((await frame.locator("textarea").count()) > 0) {
            const held = await frame.locator("textarea").first().inputValue();
            if (!/\s/.test(held.trim())) {
              name = held.trim();
              break outer;
            }
            await frame.locator("textarea").first().press("Escape");
            await sleep(80);
          }
        }
      }
      assert.ok(name, "no table header found");

      const renamed = `${name}1`;
      const selector = `.table-${renamed.replace(/\s+/g, "_")}`;
      // Where it stands now, to compare the settled position against.
      const settledAt = (await frame.evaluate(
        `(() => { const n = window.Konva.stages[0].findOne(${JSON.stringify(`.table-${name.replace(/\s+/g, "_")}`)}); return n ? Math.round(n.x()) + "," + Math.round(n.y()) : "none"; })()`,
      )) as string;

      // Sample the new node's position on every animation frame.
      // The stage, not the node: panning moves the stage and leaves every
      // node's own coordinates exactly where they were.
      await frame.evaluate(`(() => {
        window.__samples = [];
        let frames = 0;
        const tick = () => {
          const stage = window.Konva.stages[0];
          const node = stage.findOne(${JSON.stringify(selector)});
          window.__samples.push(
            "stage " + Math.round(stage.x()) + "," + Math.round(stage.y()) +
            " x" + stage.scaleX().toFixed(3) +
            " node " + (node ? Math.round(node.x()) + "," + Math.round(node.y()) : "-")
          );
          if (++frames < 180) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })()`);

      await frame.locator("textarea").first().fill(renamed);
      await frame.locator("textarea").first().press("Enter");
      await sleep(2000);

      const samples = (await frame.evaluate("window.__samples")) as string[];
      const distinct = samples.filter(
        (s, i) => i === 0 || s !== samples[i - 1],
      );
      const atOrigin = samples.filter((state) => state.endsWith("node 0,0"));
      const settled = samples[samples.length - 1];

      assert.ok(
        samples.some((state) => !state.endsWith("node -")),
        `the renamed table never appeared: ${JSON.stringify(distinct)}`,
      );
      assert.strictEqual(
        atOrigin.length,
        0,
        `the table was drawn at the origin: ${JSON.stringify(distinct)}`,
      );
      assert.ok(
        settled.endsWith(`node ${settledAt}`),
        `the table did not settle where it stood: ${settled}, was ${settledAt}`,
      );
    } finally {
      await browser.close();
    }
  });
});
