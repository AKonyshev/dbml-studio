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

  /**
   * Rename a table `rounds` times over, and measure the last of them.
   *
   * Renaming twice is not padding. The first rename leaves state behind — a
   * pair kept for undo, a re-keyed layout, a table drawn under a name that was
   * not in the file when the document opened — and the reader in the recording
   * that started this was on their second rename when the table flew to the
   * corner. One rename from a fresh document is the easier case and was
   * already passing while the defect was there to see.
   */
  const measure = async (source: string, rounds: number): Promise<void> => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension);
    await extension.activate();

    const uri = writeFixture("dbml-flash-", source);
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

      // At full detail, which is where the reader works and where the table
      // carries its columns. The file's own layout opens at header level, so
      // this is two steps away.
      await vscode.commands.executeCommand("dbmlStudio.detailLevel");
      await sleep(700);
      await vscode.commands.executeCommand("dbmlStudio.detailLevel");
      await sleep(900);
      await vscode.commands.executeCommand("dbmlStudio.fitToView");
      await sleep(800);

      const canvasBox = await frame.locator("canvas").first().boundingBox();
      assert.ok(canvasBox, "no canvas");
      const selectorFor = (name: string): string =>
        `.table-${name.replace(/\s+/g, "_")}`;

      // Point at a table's header exactly, rather than sweeping the canvas
      // and hoping. At full detail a table is mostly columns, and a sweep
      // coarse enough to finish never lands on the thin header — which is how
      // this measurement quietly failed to run at the level the reader uses.
      //
      // Konva knows where the table is on screen; the only thing missing is
      // where the frame sits inside the page, which is the difference between
      // the canvas rectangle as Playwright sees it and as the page does.
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
            // Well inside the header row, and comfortably on screen.
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
          `no header on screen for ${only ?? "any table"}`,
        );

        return JSON.parse(picked) as { name: string; x: number; y: number };
      };

      let name = (await pickHeader(null)).name;

      for (let round = 1; round <= rounds; round += 1) {
        const header = await pickHeader(name);
        const last = round === rounds;

        // Konva measures the pointer from the canvas, so the canvas's own
        // place on the page is the whole conversion. Subtracting the canvas
        // offset *within the frame* as well put every aim twenty pixels to
        // the left, which is how this quietly pointed at nothing.
        await frame
          .page()
          .mouse.move(header.x + canvasBox.x, header.y + canvasBox.y);
        await sleep(150);

        await vscode.commands.executeCommand("dbmlStudio.quickEdit");
        await waitFor(
          "the edit box to open on the table",
          async () => (await frame.locator("textarea").count()) > 0,
          10000,
        );
        const held = await frame.locator("textarea").first().inputValue();
        assert.strictEqual(
          held.trim(),
          name,
          `the box opened on something else: ${held}`,
        );

        const renamed = `${name}1`;
        // Where it stands now, to compare the settled position against.
        const settledAt = (await frame.evaluate(
          `(() => { const n = window.Konva.stages[0].findOne(${JSON.stringify(selectorFor(name))}); return n ? Math.round(n.x()) + "," + Math.round(n.y()) : "none"; })()`,
        )) as string;

        if (last) {
          // Sample the new node's position on every animation frame.
          // The stage, not the node: panning moves the stage and leaves every
          // node's own coordinates exactly where they were.
          await frame.evaluate(`(() => {
            window.__samples = [];
            let frames = 0;
            const tick = () => {
              const stage = window.Konva.stages[0];
              const node = stage.findOne(${JSON.stringify(selectorFor(renamed))});
              const was = stage.findOne(${JSON.stringify(selectorFor(name))});
              window.__samples.push(
                "stage " + Math.round(stage.x()) + "," + Math.round(stage.y()) +
                " x" + stage.scaleX().toFixed(3) +
                " was " + (was ? Math.round(was.x()) + "," + Math.round(was.y()) : "-") +
                " node " + (node ? Math.round(node.x()) + "," + Math.round(node.y()) : "-")
              );
              if (++frames < 180) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          })()`);
        }

        await frame.locator("textarea").first().fill(renamed);
        await frame.locator("textarea").first().press("Enter");
        await sleep(2000);

        if (!last) {
          name = renamed;
          continue;
        }

        const samples = (await frame.evaluate("window.__samples")) as string[];
        const distinct = samples.filter(
          (s, i) => i === 0 || s !== samples[i - 1],
        );
        const settled = samples[samples.length - 1];

        // Both names, because for as long as the host takes to reply the table
        // on the canvas is still the one drawn under the *old* name. That is
        // the table the reader watched fly into the corner, and a measurement
        // that waited for the new name to appear could not see it happen.
        const drawn = samples.flatMap((state) => {
          const [, was = "-", node = "-"] =
            /was (\S+) node (\S+)/.exec(state) ?? [];

          return [was, node].filter((place) => place !== "-");
        });
        const atOrigin = drawn.filter((place) => place === "0,0");
        const places = [...new Set(drawn)];

        assert.ok(drawn.length > 0, `the renamed table never appeared`);
        assert.deepStrictEqual(
          places,
          [settledAt],
          `the table was drawn in more than one place: ${JSON.stringify(distinct)}`,
        );
        assert.strictEqual(
          atOrigin.length,
          0,
          `the table was drawn at the origin: ${JSON.stringify(distinct)}`,
        );
        assert.ok(settled.endsWith(`node ${settledAt}`), settled);
        assert.ok(
          !samples[samples.length - 1].includes(`was ${settledAt}`),
          `the old name was still drawn when the run ended: ${settled}`,
        );
      }
    } finally {
      await browser.close();
    }
  };

  test("never shows the table at the origin", async function (this: Mocha.Context) {
    this.timeout(240000);
    await measure(fs.readFileSync(fixturePath(), "utf8"), 1);
  });

  test("nor on a second rename in the same session", async function (this: Mocha.Context) {
    this.timeout(240000);
    await measure(fs.readFileSync(fixturePath(), "utf8"), 2);
  });
});
