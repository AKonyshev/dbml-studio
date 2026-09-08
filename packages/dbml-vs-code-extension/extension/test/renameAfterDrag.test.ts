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

const selectorFor = (name: string): string =>
  `.table-${name.replace(/\s+/g, "_")}`;

/** Every table the canvas is drawing, by name, in one string. */
const drawnTables = async (frame: Frame): Promise<string> =>
  (await frame.evaluate(`(() => {
    const stage = window.Konva.stages[0];
    const nodes = stage.find((n) => typeof n.name === "function" && String(n.name()).indexOf("table-") === 0);
    return nodes.map((n) => String(n.name()).slice(6)).join(" ");
  })()`)) as string;

/**
 * What the popup is showing: the text in the box and the reason under it.
 *
 * Both, because a refused edit is only half a defect. The other half is the
 * reader being told nothing — a box that swallows `Enter` and leaves the
 * diagram as it was is indistinguishable from a broken key.
 */
const popupState = async (
  frame: Frame,
): Promise<{ open: boolean; text: string; message: string }> =>
  JSON.parse(
    (await frame.evaluate(`(() => {
      const box = document.querySelector("textarea");
      const message = box === null ? "" : (box.parentElement?.querySelector("p")?.textContent ?? "");
      return JSON.stringify({
        open: box !== null,
        text: box === null ? "" : box.value,
        message,
      });
    })()`)) as string,
  ) as { open: boolean; text: string; message: string };

/**
 * A rename after the table has been dragged.
 *
 * The drag is what makes this different from `renameRepaint.test.ts`: moving a
 * table has the page write its layout back into the document, and that write
 * and the rename's own write are two paths into the same file. Renaming twice
 * is what exposed it — the first rename went through and the second did
 * nothing at all, in the file and on the canvas, with no reason shown anywhere.
 *
 * Everything here is read from where the reader would read it: the text
 * document the workbench holds, and the table's own Konva node.
 */
suite("renaming a table that has been dragged", () => {
  teardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("lands the second rename as well as the first", async function (this: Mocha.Context) {
    this.timeout(240000);
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension);
    await extension.activate();

    const uri = writeFixture(
      "dbml-drag-rename-",
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

      // At full detail, where the reader works. The file's own layout opens at
      // header level, so this is two steps away.
      await vscode.commands.executeCommand("dbmlStudio.detailLevel");
      await sleep(700);
      await vscode.commands.executeCommand("dbmlStudio.detailLevel");
      await sleep(900);
      await vscode.commands.executeCommand("dbmlStudio.fitToView");
      await sleep(800);

      const canvasBox = await frame.locator("canvas").first().boundingBox();
      assert.ok(canvasBox, "no canvas");

      // Konva knows where a table is on screen; the only thing missing is
      // where the frame sits inside the page, which is the canvas rectangle as
      // Playwright sees it. Aim at the header row rather than sweeping: at
      // full detail a table is mostly columns.
      const pickHeader = async (
        only: string | null,
      ): Promise<{ name: string; x: number; y: number }> => {
        const wanted = only === null ? "" : selectorFor(only);
        const picked = (await frame.evaluate(`(() => {
          const stage = window.Konva.stages[0];
          const wanted = ${JSON.stringify(wanted)};
          const nodes = wanted === ""
            ? stage.find((n) => typeof n.name === "function" && String(n.name()).indexOf("table-") === 0)
            : [stage.findOne(wanted)].filter(Boolean);
          for (const node of nodes) {
            const p = node.getAbsolutePosition();
            const w = node.width() * stage.scaleX();
            const x = p.x + Math.min(60, w / 2);
            const y = p.y + 12 * stage.scaleY();
            if (x > 20 && y > 20 && x < stage.width() - 20 && y < stage.height() - 20) {
              return JSON.stringify({ name: String(node.name()).slice(6), x, y });
            }
          }
          return "";
        })()`)) as string;
        assert.ok(
          picked !== "",
          `no header on screen for ${only ?? "any table"}: drawn ${await drawnTables(frame)}`,
        );

        return JSON.parse(picked) as { name: string; x: number; y: number };
      };

      const nodeAt = async (table: string): Promise<string> =>
        (await frame.evaluate(
          `(() => { const n = window.Konva.stages[0].findOne(${JSON.stringify(selectorFor(table))}); return n ? Math.round(n.x()) + "," + Math.round(n.y()) : "none"; })()`,
        )) as string;

      let name = (await pickHeader(null)).name;
      const start = await pickHeader(name);
      const before = await nodeAt(name);

      // Move it well away from where the file's layout put it. The rename that
      // follows deliberately does not wait for the page's debounced write-back
      // to land: the two writes overlapping is the whole point.
      await frame
        .page()
        .mouse.move(start.x + canvasBox.x, start.y + canvasBox.y);
      await frame.page().mouse.down();
      await frame
        .page()
        .mouse.move(start.x + canvasBox.x + 60, start.y + canvasBox.y + 40, {
          steps: 6,
        });
      await frame
        .page()
        .mouse.move(start.x + canvasBox.x + 180, start.y + canvasBox.y + 120, {
          steps: 6,
        });
      await frame.page().mouse.up();
      await sleep(200);

      const dragged = await nodeAt(name);
      assert.notStrictEqual(
        dragged,
        before,
        `the drag did not move ${name}: still at ${before}`,
      );

      for (let round = 1; round <= 2; round += 1) {
        const header = await pickHeader(name);
        await frame
          .page()
          .mouse.move(header.x + canvasBox.x, header.y + canvasBox.y);
        await sleep(150);

        await vscode.commands.executeCommand("dbmlStudio.quickEdit");
        await waitFor(
          `the edit box to open on the table for rename ${round}`,
          async () => (await frame.locator("textarea").count()) > 0,
          10000,
        );
        const held = await frame.locator("textarea").first().inputValue();
        assert.strictEqual(
          held.trim(),
          name,
          `rename ${round} opened on something else: ${held}`,
        );

        const renamed = `${name}1`;
        await frame.locator("textarea").first().fill(renamed);
        await frame.locator("textarea").first().press("Enter");

        // Waited for rather than slept past, so a failure says what the file,
        // the canvas and the popup each held when time ran out instead of only
        // that the name was missing.
        const written = (): boolean =>
          document.getText().includes(`"${renamed}"`);
        const evidence = async (): Promise<string> =>
          `rename ${round} of ${name} to ${renamed}: written=${written()} ` +
          `popup=${JSON.stringify(await popupState(frame))} ` +
          `drawn=${await drawnTables(frame)}`;

        const deadline = Date.now() + 8000;
        while (Date.now() < deadline && !written()) {
          await sleep(150);
        }
        assert.ok(
          written(),
          `the document was not changed — ${await evidence()}`,
        );

        // A rename the reader cannot see is the same defect from the other
        // side, so the canvas has to arrive at the new name too.
        while (
          Date.now() < deadline &&
          !(await drawnTables(frame)).split(" ").includes(renamed)
        ) {
          await sleep(150);
        }
        assert.ok(
          (await drawnTables(frame)).split(" ").includes(renamed),
          `the canvas still draws the old name — ${await evidence()}`,
        );

        name = renamed;
      }
    } finally {
      await browser.close();
    }
  });
});
