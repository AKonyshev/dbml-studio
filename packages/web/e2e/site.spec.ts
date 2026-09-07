import { readFileSync } from "node:fs";

import { expect, test, type Page, type Request } from "@playwright/test";

// A relative path rather than the package name the rest of this package uses:
// Playwright's loader resolves the workspace symlink but will not add the `.ts`
// extension across it, and this file is compiled by Playwright rather than Vite.
import { MESSAGES_EN } from "../../json-table-schema-visualizer/src/i18n/messages";

import {
  canvasOf,
  pointOnTable,
  selectEverything,
  selectedTableCount,
  stageIsDraggable,
  tablePositions,
} from "./diagram";

// Everything the page is allowed to talk to. `blob:` and `data:` are the site
// handing bytes to itself — the download path builds a blob URL on purpose —
// and neither leaves the machine.
//
const isSameOrigin = (request: Request, origin: string): boolean => {
  const url = request.url();

  if (url.startsWith("blob:") || url.startsWith("data:")) {
    return true;
  }

  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
};

test("the built site works, and asks the network for nothing", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "").origin;
  const offOrigin: string[] = [];

  // Recorded rather than blocked. Blocking would prove the page survives without
  // the CDN; recording proves it never wanted it — which is the claim the site
  // actually makes, and the one an operator on a closed network is relying on.
  page.on("request", (request) => {
    if (!isSameOrigin(request, origin)) {
      offOrigin.push(request.url());
    }
  });

  await page.goto("/");

  // The editor, not a container that would exist whether or not it loaded. This
  // element is created by Monaco itself, so its absence is exactly the failure
  // this test exists for: a build that expects to fetch the editor at run time.
  const editor = page.locator(".monaco-editor");
  await expect(editor).toBeVisible();

  // The diagram is drawn to a canvas, so there is no text in it to assert on.
  // What can be asserted is that the canvas exists and the layout gave it a real
  // box rather than collapsing it to nothing.
  const canvas = page.locator(".konvajs-content canvas").first();
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  expect(box?.height ?? 0).toBeGreaterThan(100);

  const beforeTyping = await canvas.screenshot();

  // Typed through the real editor rather than into the React state behind it.
  // This is the seam between the two halves of the page, and it is the seam that
  // is broken when the editor is not really there.
  // Typed in full, closing brace included: no language configuration is
  // registered for DBML, so the editor closes nothing on the reader's behalf and
  // a half-written schema stays a parse error — which unmounts the canvas and
  // shows a message instead, and would leave the assertions below waiting on an
  // element that is no longer there.
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Table smoke_test {\n  id integer [pk]\n}\n");

  await expect(editor).toContainText("smoke_test");

  // Two independent readings of "the typed schema reached the diagram", because
  // neither is enough on its own: the repainted canvas proves something was
  // drawn, and the search list proves what was drawn is a table by that name.
  //
  // The canvas first, and by polling: parsing is debounced, so asking either
  // question the instant the last character lands asks it of the previous
  // schema.
  await expect
    .poll(async () => Buffer.compare(await canvas.screenshot(), beforeTyping), {
      timeout: 10_000,
    })
    .not.toBe(0);

  // The label comes from the catalogue rather than being spelled out here, so a
  // renamed placeholder fails this test instead of silently making it match
  // nothing. The locale is pinned to English in the config, which is what lets
  // the English catalogue be the right one to read.
  await page
    .getByRole("textbox", { name: MESSAGES_EN["search.placeholder"] })
    .fill("smoke");
  await expect(page.getByRole("button", { name: /smoke_test/ })).toBeVisible();

  expect(offOrigin).toEqual([]);
});

test("a marquee selects several tables and drags them together", async ({
  page,
}) => {
  await selectEverything(page);

  const before = await tablePositions(page);
  const names = Object.keys(before);
  expect(names.length).toBeGreaterThan(1);
  // The marquee covered the canvas, so it should have caught all of them.
  expect(await selectedTableCount(page)).toBe(names.length);

  const grip = await pointOnTable(page, names[0]);

  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(grip.x + 80, grip.y + 40, { steps: 10 });
  await page.mouse.up();

  const after = await tablePositions(page);

  const deltas = names.map((name) => ({
    x: after[name].x - before[name].x,
    y: after[name].y - before[name].y,
  }));

  // Something moved, and every table moved by the same amount: that is what
  // makes it a group move rather than one table being dragged.
  expect(Math.abs(deltas[0].x) + Math.abs(deltas[0].y)).toBeGreaterThan(0);

  for (const delta of deltas) {
    expect(delta.x).toBeCloseTo(deltas[0].x, 1);
    expect(delta.y).toBeCloseTo(deltas[0].y, 1);
  }

  // And the move reached the coordinate store, not just the Konva nodes.
  // Asserted through a reload rather than by reaching into the store: the app
  // flushes positions on the way out, so surviving one is what "it was stored"
  // means to the reader, and it is the same thing they would notice if it were
  // not true.
  await page.reload();
  await expect(canvasOf(page)).toBeVisible();

  const restored = await tablePositions(page);

  for (const name of names) {
    expect(restored[name].x).toBeCloseTo(after[name].x, 0);
    expect(restored[name].y).toBeCloseTo(after[name].y, 0);
  }
});

test("a middle-button pan that ends off the canvas leaves select mode intact", async ({
  page,
}) => {
  await selectEverything(page);
  expect(await selectedTableCount(page)).toBeGreaterThan(1);

  const box = await canvasOf(page).boundingBox();
  const left = box?.x ?? 0;
  const top = box?.y ?? 0;

  // Panning by the middle button makes the stage draggable for the length of
  // the gesture. Releasing outside the canvas sends the stage no mouse-up at
  // all, so nothing but a handler on the way out puts it back — and without one
  // select mode silently became pan mode, with the next drag both drawing a
  // marquee and moving the canvas.
  await page.mouse.move(left + 200, top + 200);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(left + 260, top + 240, { steps: 5 });
  await page.mouse.move(left - 80, top + 240, { steps: 5 });
  await page.mouse.up({ button: "middle" });

  await expect.poll(async () => await stageIsDraggable(page)).toBe(false);
  // And the gesture took nothing away with it.
  expect(await selectedTableCount(page)).toBeGreaterThan(1);
});

test("holding space pans without drawing a marquee or losing the selection", async ({
  page,
}) => {
  await selectEverything(page);
  const selected = await selectedTableCount(page);

  const box = await canvasOf(page).boundingBox();
  const left = box?.x ?? 0;
  const top = box?.y ?? 0;

  await page.keyboard.down("Space");
  await expect.poll(async () => await stageIsDraggable(page)).toBe(true);

  // Actually pan, rather than only checking the flag: the reason panning has to
  // stay reachable in select mode is so the reader can look around without
  // losing what they have picked. A drag that also opened a marquee would end
  // by committing an empty one over the top of them.
  await page.mouse.move(left + 200, top + 200);
  await page.mouse.down();
  await page.mouse.move(left + 320, top + 260, { steps: 10 });
  await page.mouse.up();

  await page.keyboard.up("Space");
  await expect.poll(async () => await stageIsDraggable(page)).toBe(false);

  expect(await selectedTableCount(page)).toBe(selected);
});

test("Escape drops the selection, and so does leaving the mode", async ({
  page,
}) => {
  await selectEverything(page);
  expect(await selectedTableCount(page)).toBeGreaterThan(1);

  await page.keyboard.press("Escape");
  await expect.poll(async () => await selectedTableCount(page)).toBe(0);

  // And again, this time by going back to panning: a selection that outlived
  // the mode would silently change what a plain drag does.
  await selectEverything(page);
  expect(await selectedTableCount(page)).toBeGreaterThan(1);

  await page.keyboard.press("v");
  await expect.poll(async () => await selectedTableCount(page)).toBe(0);
});

test("shift adds one table to the selection and takes it away again", async ({
  page,
}) => {
  await selectEverything(page);
  expect(await selectedTableCount(page)).toBeGreaterThan(1);

  const names = Object.keys(await tablePositions(page));
  const grip = await pointOnTable(page, names[0]);

  // A plain click narrows the selection to the one table under it.
  await page.mouse.click(grip.x, grip.y);
  await expect.poll(async () => await selectedTableCount(page)).toBe(1);

  // Shift takes that one back out, leaving nothing selected.
  await page.keyboard.down("Shift");
  await page.mouse.click(grip.x, grip.y);
  await page.keyboard.up("Shift");

  await expect.poll(async () => await selectedTableCount(page)).toBe(0);
});

test("the diagram recovers after its container had no size", async ({
  page,
}) => {
  await page.goto("/");
  await expect(canvasOf(page)).toBeVisible();

  const stageSize = async (): Promise<{ w: number; h: number }> =>
    await page.evaluate(() => {
      const stage = window.Konva?.stages[0] as unknown as {
        width: () => number;
        height: () => number;
      };
      return { w: stage.width(), h: stage.height() };
    });

  expect((await stageSize()).w).toBeGreaterThan(0);

  // The container loses its box. Not a contrivance: the extension's webview is
  // laid out at nothing while its tab is in the background, and a pane the
  // reader collapses does the same. What the diagram must not do is stay
  // collapsed once the box comes back.
  await page.evaluate(() => {
    const el = document
      .querySelector(".konvajs-content")
      ?.closest("main") as HTMLElement | null;
    if (el?.parentElement != null) el.parentElement.style.display = "none";
  });
  await page.waitForTimeout(500);
  expect((await stageSize()).w).toBe(0);

  // And gets it back.
  await page.evaluate(() => {
    const el = document
      .querySelector(".konvajs-content")
      ?.closest("main") as HTMLElement | null;
    if (el?.parentElement != null) el.parentElement.style.display = "";
  });
  await page.waitForTimeout(800);

  expect((await stageSize()).w).toBeGreaterThan(0);
});

/**
 * The width and height an encoded PNG declares.
 *
 * Read out of the IHDR chunk, which is fixed at the front of every PNG: eight
 * bytes of signature, four of length, four of type, then the two dimensions as
 * big-endian 32-bit integers. Decoding the image would answer the same question
 * and pull in a dependency to do it.
 */
const pngSize = (bytes: Buffer): { width: number; height: number } => {
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(bytes.subarray(12, 16).toString("latin1")).toBe("IHDR");

  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

const download = async (
  page: Page,
  open: () => Promise<void>,
): Promise<Buffer> => {
  const [downloaded] = await Promise.all([
    page.waitForEvent("download"),
    open(),
  ]);
  const path = await downloaded.path();

  return readFileSync(path);
};

const exportAs = async (page: Page, format: string): Promise<Buffer> =>
  await download(page, async () => {
    await page.getByRole("button", { name: /^Export/ }).click();
    await page.getByRole("button", { name: format, exact: true }).click();
  });

test("an exported image holds the whole diagram, not the part on screen", async ({
  page,
}) => {
  await page.goto("/");
  await expect(canvasOf(page)).toBeVisible();

  // Zoom in and pan away, so that what is on screen is a fraction of the model.
  // An export that took the viewport would come out at the size of the canvas.
  await page.evaluate(() => {
    const stage = window.Konva?.stages[0] as unknown as {
      scale: (s: { x: number; y: number }) => void;
      position: (p: { x: number; y: number }) => void;
      batchDraw: () => void;
    };
    stage.scale({ x: 3, y: 3 });
    stage.position({ x: -400, y: -300 });
    stage.batchDraw();
  });

  // What the whole diagram measures, in its own units. The export squares off
  // the larger side and draws at twice the resolution.
  const expected = await page.evaluate(() => {
    const stage = window.Konva?.stages[0] as unknown as {
      scaleX: () => number;
      scale: (s: { x: number; y: number }) => void;
      position: (p: { x: number; y: number }) => void;
      getClientRect: (o: { relativeTo: unknown }) => {
        width: number;
        height: number;
      };
      x: () => number;
      y: () => number;
    };
    const scale = stage.scaleX();
    const at = { x: stage.x(), y: stage.y() };

    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    const bounds = stage.getClientRect({ relativeTo: stage });
    stage.scale({ x: scale, y: scale });
    stage.position(at);

    return Math.round(Math.max(bounds.width, bounds.height) * 2);
  });

  const view = await page.evaluate(() => {
    const stage = window.Konva?.stages[0] as unknown as {
      scaleX: () => number;
      x: () => number;
      y: () => number;
    };
    return { scale: stage.scaleX(), x: stage.x(), y: stage.y() };
  });

  const png = pngSize(await exportAs(page, "PNG"));

  // Square, and the size of the model rather than of the window.
  expect(png.width).toBe(png.height);
  expect(Math.abs(png.width - expected)).toBeLessThanOrEqual(2);

  // And the reader is left looking at what they were looking at: the export
  // moves the stage to measure it and has to put it back.
  const after = await page.evaluate(() => {
    const stage = window.Konva?.stages[0] as unknown as {
      scaleX: () => number;
      x: () => number;
      y: () => number;
    };
    return { scale: stage.scaleX(), x: stage.x(), y: stage.y() };
  });
  expect(after).toEqual(view);
});

test("an exported file names every table in the model", async ({ page }) => {
  await page.goto("/");
  await expect(canvasOf(page)).toBeVisible();

  const tables = Object.keys(await tablePositions(page)).map((name) =>
    name.replace(/^table-/, ""),
  );
  expect(tables.length).toBeGreaterThan(1);

  // Three formats, one question each time: is the model actually in there. A
  // download that arrives empty or holding one table looks exactly like a
  // download that worked.
  const svg = (await exportAs(page, "SVG")).toString("utf8");
  expect(svg).toContain("<svg");

  const adoc = (await exportAs(page, "AsciiDoc")).toString("utf8");
  const markdown = (await exportAs(page, "Markdown")).toString("utf8");

  for (const table of tables) {
    expect(svg, `SVG is missing ${table}`).toContain(table);
    expect(adoc, `AsciiDoc is missing ${table}`).toContain(table);
    expect(markdown, `Markdown is missing ${table}`).toContain(table);
  }
});

/**
 * The schema as the file would be written.
 *
 * Through the app's own Download rather than by reading Monaco: the editor is
 * bundled and puts nothing on `window`, its DOM only holds the lines currently
 * scrolled into view, and what matters here is the text that would reach the
 * file — which is exactly what Download hands over.
 */
const schemaText = async (page: Page): Promise<string> =>
  (
    await download(page, async () => {
      await page.getByRole("button", { name: /^Download/ }).click();
    })
  ).toString("utf8");

const drawnRelations = async (page: Page): Promise<number> =>
  await page.evaluate(() => window.Konva?.stages[0]?.find("Path").length ?? 0);

test("hiding a table's relations changes the view and not the file", async ({
  page,
}) => {
  await page.goto("/");
  await expect(canvasOf(page)).toBeVisible();

  const before = await schemaText(page);
  expect(before).toContain("Ref:");
  expect(await drawnRelations(page)).toBeGreaterThan(0);

  const names = Object.keys(await tablePositions(page));
  const grip = await pointOnTable(page, names[0]);

  // H acts on whatever the pointer is over, so the pointer has to be over
  // something first. The click is what takes focus off the editor: a bare
  // letter is a shortcut on the diagram and a character in the text.
  await page.mouse.click(grip.x, grip.y);
  await page.keyboard.press("h");

  await expect.poll(async () => await drawnRelations(page)).toBe(0);

  // The one thing this feature promises: it is a view, not an edit. A `Ref`
  // commented out to hide a line would be a data loss the reader never asked
  // for, and it would travel to everyone else through the file.
  expect(await schemaText(page)).toBe(before);

  // Remembered per document, in the browser.
  await page.reload();
  await expect(canvasOf(page)).toBeVisible();
  expect(await drawnRelations(page)).toBe(0);

  // And it comes back the same way it went.
  const gripAgain = await pointOnTable(page, names[0]);
  await page.mouse.click(gripAgain.x, gripAgain.y);
  await page.keyboard.press("h");

  await expect.poll(async () => await drawnRelations(page)).toBeGreaterThan(0);
  expect(await schemaText(page)).toBe(before);
});

test("the editor's find widget draws its icons", async ({ page }) => {
  await page.goto("/");

  const editor = page.locator(".monaco-editor");
  await expect(editor).toBeVisible();

  await editor.click();

  // The modifier is read off the page rather than off the host. Monaco picks
  // Cmd or Ctrl from the browser's own user agent, and the browser this test
  // drives reports Windows whatever machine it is running on — so
  // `ControlOrMeta` would press Cmd on a Mac against an editor listening for
  // Ctrl, and the widget would never open.
  const isMac = await page.evaluate(() =>
    navigator.userAgent.includes("Macintosh"),
  );
  await page.keyboard.press(isMac ? "Meta+f" : "Control+f");

  const findWidget = page.locator(".monaco-editor .find-widget");
  await expect(findWidget).toBeVisible();

  // Monaco draws every button in this widget as a glyph from a font it ships.
  // The markup for those buttons is there whether or not the font is — a
  // missing `@font-face` leaves them blank rather than absent — so neither the
  // element nor its class says anything. These two questions do: is the icon
  // asking to be drawn in that font, and did the font arrive.
  const icon = findWidget.locator(".codicon").first();
  await expect(icon).toBeVisible();

  expect(
    await icon.evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain("codicon");

  expect(
    await page.evaluate(async () => {
      await document.fonts.load("16px codicon");

      return [...document.fonts].some(
        (face) => face.family.replace(/["']/g, "") === "codicon",
      );
    }),
  ).toBe(true);
});
