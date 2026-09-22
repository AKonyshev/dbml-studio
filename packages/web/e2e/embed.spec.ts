import {
  expect,
  test,
  type Frame,
  type Locator,
  type Page,
  type Request,
} from "@playwright/test";

// Relative paths rather than the package name: Playwright's loader resolves the
// workspace symlink but will not add the `.ts` extension across it. Read from
// the catalogues rather than written out here — English is this repository's
// source language, and a Russian string in a spec file is both a rule broken
// and a translation free to drift.
import { MESSAGES_EN } from "../../json-table-schema-visualizer/src/i18n/messages";
import { MESSAGES_RU } from "../../json-table-schema-visualizer/src/i18n/locales/ru";

import { canvasOf } from "./diagram";

// Three tables and two relations, so that a filter naming two of them has
// something to leave out — both a table and the edge that reached it.
const ACL = `
Table "acl"."analysis" {
  id integer [pk]
  note varchar
}

Table "acl"."analysis_liquid" {
  id integer [pk]
  analysis_id integer
}

Table "acl"."gas_dynamic_research" {
  id integer [pk]
  analysis_id integer
}

Ref: "acl"."analysis"."id" < "acl"."analysis_liquid"."analysis_id"
Ref: "acl"."analysis"."id" < "acl"."gas_dynamic_research"."analysis_id"
`;

// One table wide enough that its detail level decides the whole framing, and
// narrow enough to still open at full detail: fifty columns is fifteen hundred
// pixels of table, against forty-four with the headers alone. Kept apart from
// `ACL` so that the tests above go on describing an ordinary model.
const WIDE = `
Table "wide"."reading" {
${Array.from({ length: 50 }, (_, i) => `  c${i} integer`).join("\n")}
}

Table "wide"."note" {
  id integer [pk]
  reading_id integer
}

Ref: "wide"."reading"."c0" < "wide"."note"."reading_id"
`;

// One table tall enough that fitting it into a page-sized frame puts its rows
// below the size at which they would once have stopped being drawn. Two
// hundred-odd columns in the whole model, which is nothing to draw — that is
// the point.
const TALL = `
Table "tall"."reading" {
${Array.from({ length: 120 }, (_, i) => `  c${i} integer`).join("\n")}
}
`;

// A model that carries its own layout, as every model in a real project does
// once anyone has arranged one. The coordinates are the whole model's: three
// tables, thousands of units apart.
const ARRANGED = `
Table "arr"."left" {
  id integer [pk]
}

Table "arr"."middle" {
  id integer [pk]
  left_id integer
}

Table "arr"."right" {
  id integer [pk]
}

Ref: "arr"."left"."id" < "arr"."middle"."left_id"

/*MetaInfo
[{"name":"arr.left","x":0,"y":0},
{"name":"arr.middle","x":6000,"y":4000},
{"name":"arr.right","x":12000,"y":9000}]
MetaInfo*/
`;

// A model of the size the layout is really asked to handle. One busy table with
// a hundred and fifty others hanging off it is the shape that broke the old
// layered drawer: it packs a shared rank along one axis and turns a schema like
// this into a strip. The measured one came out 1,980 wide by 145,826 tall, at
// which fit-to-view shows a blank canvas — see `computeTablesPositions`.
const LARGE = `
Table "big"."hub" {
  id integer [pk]
}

${Array.from(
  { length: 150 },
  (_, i) => `Table "big"."spoke_${i}" {
  id integer [pk]
  hub_id integer
  note varchar
}`,
).join("\n\n")}

${Array.from({ length: 150 }, (_, i) => `Ref: "big"."hub"."id" < "big"."spoke_${i}"."hub_id"`).join("\n")}
`;

// The built site has no catalogue in it — nginx is what puts one at these paths
// in the container. Same-origin, so fulfilling them here keeps the promise the
// smoke test checks: nothing the page asks for leaves the origin.
const serveModel = async (page: Page): Promise<void> => {
  await page.route("**/schemas/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    const model =
      path === "/schemas/acl.dbml"
        ? ACL
        : path === "/schemas/wide.dbml"
          ? WIDE
          : path === "/schemas/tall.dbml"
            ? TALL
            : path === "/schemas/arranged.dbml"
              ? ARRANGED
              : path === "/schemas/large.dbml"
                ? LARGE
                : null;

    await (model === null
      ? route.fulfill({ status: 404, body: "not found" })
      : route.fulfill({ status: 200, contentType: "text/plain", body: model }));
  });
};

// A model served at a path of the site's own rather than out of the catalogue,
// which is what a documentation site does: it copies a `.dbml` file sitting
// beside its pages into the built site, and the plugin points the frame at it.
const servePlainModel = async (page: Page): Promise<void> => {
  await page.route("**/models/acl.dbml", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/plain", body: ACL });
  });
};

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

const stageScale = async (page: Page): Promise<number> =>
  await page.evaluate(() => window.Konva?.stages[0]?.scaleX() ?? 0);

const drawnTextCount = async (page: Page): Promise<number> =>
  await page.evaluate(() => window.Konva?.stages[0]?.find("Text").length ?? 0);

/** How far apart the tables are, in diagram units rather than pixels. */
const tableSpan = async (page: Page): Promise<number> =>
  await page.evaluate(() => {
    const groups = (window.Konva?.stages[0]?.find("Group") ?? []) as Array<{
      name: () => string;
      x: () => number;
      y: () => number;
    }>;
    const tables = groups.filter((g) => String(g.name()).startsWith("table-"));

    if (tables.length === 0) {
      return 0;
    }

    const xs = tables.map((t) => t.x());
    const ys = tables.map((t) => t.y());

    return Math.max(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
    );
  });

test("the frame draws the model named in its query, and asks for nothing else", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "").origin;
  const offOrigin: string[] = [];
  const schemaRequests: string[] = [];

  page.on("request", (request) => {
    if (!isSameOrigin(request, origin)) {
      offOrigin.push(request.url());
    }

    const path = new URL(request.url()).pathname;

    if (path.startsWith("/schemas/")) {
      schemaRequests.push(path);
    }
  });

  await serveModel(page);
  await page.goto("/embed.html?src=acl.dbml");

  const canvas = canvasOf(page);
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);

  expect(offOrigin).toEqual([]);
  // One file, and only the one the query named: no manifest, no second model.
  // The frame is not the catalogue and must not go looking for one.
  expect(schemaRequests).toEqual(["/schemas/acl.dbml"]);
});

test("the filter reaches the drawing", async ({ page }) => {
  await serveModel(page);

  await page.goto("/embed.html?src=acl.dbml");
  await expect(canvasOf(page)).toBeVisible();
  const whole = await canvasOf(page).screenshot();

  await page.goto("/embed.html?src=acl.dbml&tables=analysis,analysis_liquid");
  await expect(canvasOf(page)).toBeVisible();
  const filtered = await canvasOf(page).screenshot();

  // Not an assertion about which tables are on the canvas — the canvas has no
  // text in it to read, and `filterSchema`'s unit tests say which tables
  // survive. This says the parameter was not quietly ignored.
  expect(Buffer.compare(whole, filtered)).not.toBe(0);
});

test("the diagram arrives already framed", async ({ page }) => {
  await serveModel(page);
  await page.goto("/embed.html?src=acl.dbml");
  await expect(canvasOf(page)).toBeVisible();

  const onArrival = await canvasOf(page).screenshot();

  // Pressing fit-to-view is the definition of framed, so a frame that arrives
  // framed is one the keypress cannot improve. Asserted this way round because
  // the canvas carries no text and no numbers to read: "unchanged by F" is the
  // one thing about the framing a browser can state exactly.
  await page.keyboard.press("f");

  await expect
    .poll(async () =>
      Buffer.compare(await canvasOf(page).screenshot(), onArrival),
    )
    .toBe(0);
});

test("a change of detail level re-frames the diagram", async ({ page }) => {
  await serveModel(page);

  // The shape these props exist for: a frame a few hundred pixels tall in a
  // page of prose. It matters to what is measured below and not only to
  // realism — on a desktop-shaped viewport this diagram is fitted by its width,
  // which no detail level changes, and the scale barely moves however right the
  // framing is.
  await page.setViewportSize({ width: 900, height: 500 });
  await page.goto("/embed.html?src=wide.dbml");
  await expect(canvasOf(page)).toBeVisible();

  const atFullDetail = await stageScale(page);

  // `D` shortens every table to its header — a fiftieth of what the tall one
  // was — so the framing that arrived with the page is now framing something
  // that is not there any more, and the reader is left looking at a smear in
  // the middle of an empty canvas until they think to press `F`.
  await page.keyboard.press("d");

  // Read as a scale rather than compared as an image, which is the one thing
  // about the framing a screenshot cannot state: shrinking the tables changes
  // the picture whether or not the view followed them, so "the picture
  // changed" is true in both worlds and says nothing. The number separates
  // them. `window.Konva` is Konva's own global, not a handle the app adds for
  // testing.
  //
  // Four times is a floor, not the expected figure — the measured jump is
  // a little over five. It is that large because the tables are not the only
  // thing that shrinks: the arrangement is computed from their drawn height, so
  // the room left between them shrinks with them and the whole diagram is laid
  // out in a shape that suits a row of headers. Spacing headers as though every
  // column were still under them scores about two, which is what this floor is
  // set to rule out.
  await expect
    .poll(async () => await stageScale(page))
    .toBeGreaterThan(atFullDetail * 4);

  // And where it landed is a framing, by the same measure the arrival uses:
  // one that pressing fit-to-view cannot improve.
  const framed = await canvasOf(page).screenshot();
  await page.keyboard.press("f");
  await expect
    .poll(async () => Buffer.compare(await canvasOf(page).screenshot(), framed))
    .toBe(0);

  // Round the rest of the cycle, back to where it started, because one press is
  // not enough to catch the way this went wrong: the level that is drawn and
  // the level the arrangement is computed for are kept in two places, and while
  // they were updated one render apart the first press looked right and every
  // press after it arranged for the level before. Coming back to full detail is
  // exact — the arrangement is the stored one, recovered rather than recomputed
  // — so a cycle that ends anywhere but where it began has lost track of which
  // level it is arranging for.
  await page.keyboard.press("d");
  await page.keyboard.press("d");

  await expect.poll(async () => await stageScale(page)).toBe(atFullDetail);
});

test("a small schema draws its columns however far out it is fitted", async ({
  page,
}) => {
  await serveModel(page);
  await page.setViewportSize({ width: 900, height: 500 });
  await page.goto("/embed.html?src=tall.dbml");
  await expect(canvasOf(page)).toBeVisible();

  // No keypress: a diagram of one table opens at full detail however tall the
  // table is, because the budget that would otherwise send it to headers is
  // there to protect the other tables and there are none.

  // Fitted into a frame this size, a column row is a few pixels tall — under
  // the size at which drawing the rows stops paying for itself on a schema big
  // enough for that to matter.
  await expect.poll(async () => (await stageScale(page)) * 30).toBeLessThan(6);

  // Drawn all the same, because this schema is not big enough for that to
  // matter. Hiding them here saves nothing and leaves the reader looking at an
  // empty box in a frame they cannot zoom, which is the one thing the filter in
  // the query was for.
  await expect
    .poll(async () => await drawnTextCount(page))
    .toBeGreaterThan(100);
});

test("a filtered diagram is arranged as itself, not as part of the model", async ({
  page,
}) => {
  await serveModel(page);
  await page.setViewportSize({ width: 900, height: 500 });
  await page.goto("/embed.html?src=arranged.dbml&tables=left,middle");
  await expect(canvasOf(page)).toBeVisible();

  // The file puts these two six thousand units apart, because that is where
  // they sit in a diagram of the whole model. Two tables out of three is not
  // that diagram: kept, those coordinates frame the empty rectangle between
  // them and the page shows two specks in opposite corners.
  await expect.poll(async () => await tableSpan(page)).toBeLessThan(2000);
});

test("the controls stay out of the diagram until the reader reaches for them", async ({
  page,
}) => {
  await serveModel(page);
  await page.goto("/embed.html?src=acl.dbml");
  await expect(canvasOf(page)).toBeVisible();

  // A frame is as tall as the page's author made it, and a toolbar sitting on
  // top of a 500px one covers the bottom fifth of the diagram it came to show.
  // The search box covers the top-right corner of it for the same reason.
  const fit = page.getByRole("button", { name: "Fit to view" });
  const search = page.getByPlaceholder("Search tables and columns...");
  await expect(fit).toBeHidden();
  await expect(search).toBeHidden();

  // `mouse.move` rather than `hover()`: the canvas animates its relations, so
  // Playwright can wait forever for it to be "stable" enough to hover.
  const box = await canvasOf(page).boundingBox();
  await page.mouse.move(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  );

  await expect(fit).toBeVisible();
  await expect(search).toBeVisible();
});

test("a hidden search leaves the reader's own find alone", async ({ page }) => {
  await serveModel(page);
  await page.goto("/embed.html?src=acl.dbml");
  await expect(canvasOf(page)).toBeVisible();

  // Registered after the search's own listener, so by the time this runs the
  // search has had its chance to claim the key.
  await page.evaluate(() => {
    window.addEventListener("keydown", (event) => {
      (window as unknown as { claimed?: boolean }).claimed =
        event.defaultPrevented;
    });
  });

  const claimedFind = async (): Promise<boolean | undefined> =>
    await page.evaluate(
      () => (window as unknown as { claimed?: boolean }).claimed,
    );

  await page.keyboard.press("ControlOrMeta+f");

  // A box nobody can see cannot be focused, so claiming the key would spend it
  // on nothing — and in a documentation page Ctrl+F is what the reader presses
  // to search the prose around the diagram.
  expect(await claimedFind()).toBe(false);

  const box = await canvasOf(page).boundingBox();
  await page.mouse.move(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  );
  await expect(
    page.getByPlaceholder("Search tables and columns..."),
  ).toBeVisible();

  await page.keyboard.press("ControlOrMeta+f");

  expect(await claimedFind()).toBe(true);
  await expect(
    page.getByPlaceholder("Search tables and columns..."),
  ).toBeFocused();
});

test("the legend says what the marks on the diagram mean, and fits the frame", async ({
  page,
}) => {
  await serveModel(page);
  // The shape the frame is really used in: a few hundred pixels of a page of
  // prose. The legend has two sections now and is taller than that.
  await page.setViewportSize({ width: 900, height: 420 });
  await page.goto("/embed.html?src=acl.dbml");
  await expect(canvasOf(page)).toBeVisible();

  // Bound to the document, so it works while the toolbar is hidden.
  await page.keyboard.press("?");

  const notation = page.getByText("Required: cannot be null");
  await expect(notation).toBeVisible();
  await expect(page.getByText("Foreign key")).toBeVisible();
  // Both halves: the notation section was added beside the shortcuts, not over
  // them.
  await expect(page.getByRole("heading", { name: "Notation" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Keyboard shortcuts" }),
  ).toBeVisible();

  const dialog = page.locator("div.overflow-y-auto").first();
  const box = await dialog.boundingBox();

  // Inside the frame on both edges. An overflowing dialog looks fine at the top
  // and hides whichever section the reader scrolled down for.
  expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(420);

  await page.keyboard.press("Escape");
  await expect(notation).toBeHidden();
});

test("a name that is in no table is said out loud", async ({ page }) => {
  await serveModel(page);
  await page.goto("/embed.html?src=acl.dbml&tables=analisys");

  await expect(page.getByText("Table not found: analisys")).toBeVisible();
  await expect(page.locator(".konvajs-content")).toHaveCount(0);
});

test("a model that is not there is said out loud", async ({ page }) => {
  await serveModel(page);
  await page.goto("/embed.html?src=nothing.dbml");

  await expect(page.getByText("Schema not found: nothing.dbml")).toBeVisible();
});

test("the frame draws a model addressed by URL, without touching the catalogue", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "").origin;
  const asked: string[] = [];

  page.on("request", (request) => {
    asked.push(request.url());
  });

  await servePlainModel(page);
  await page.goto("/embed.html?model=models/acl.dbml");

  await expect(canvasOf(page)).toBeVisible();

  expect(asked).toContain(`${origin}/models/acl.dbml`);
  expect(asked.filter((url) => url.includes("/schemas/"))).toEqual([]);
});

// Depth is not testable here, and deliberately not faked: `embed.html` sits at
// the root of this build, so a path resolved against the wrong base resolves to
// the same file and a browser test would pass for the wrong reason. That the
// base is the frame document is asserted where it can be — `modelUrl.test.ts`,
// whose frame URL is three directories deep.
test("a model on another site is refused rather than fetched", async ({
  page,
}) => {
  const asked: string[] = [];

  page.on("request", (request) => {
    asked.push(request.url());
  });

  await page.goto("/embed.html?model=https://example.com/acl.dbml");

  await expect(
    page.getByText(
      "The model must be served from this site: https://example.com/acl.dbml",
    ),
  ).toBeVisible();
  // By host, not by substring: the frame's own navigation carries the refused
  // address in its query string, and a plain `includes` would catch that
  // request too and pass for the wrong reason.
  expect(
    asked.filter((url) => new URL(url).hostname === "example.com"),
  ).toEqual([]);
});

// A host that has the model and no server, answering the frame's hello with the
// text itself — which is what a plugin does. Through a real host page rather than
// by posting from the test after `goto`: the frame gives up after two seconds, and
// on a loaded machine the test would lose that race and fail for no reason.
//
// Takes the model as an argument rather than closing over `ACL`: the relayout
// test below needs a host that starts from a different, smaller schema.
const pushingHostPage = (model: string): string => `<!doctype html>
<html><head><style>
  body { margin: 0; padding: 40px; }
  .dbml-diagram { width: 600px; height: 300px; }
  .dbml-diagram iframe { width: 100%; height: 100%; border: 0; }
</style></head>
<body>
<div class="dbml-diagram"><iframe src="/embed.html"></iframe></div>
<script>
;(function () {
  var MODEL = ${JSON.stringify(model)};

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (data === null || typeof data !== 'object' || data.source !== 'dbml-frame') return;
    if (data.type !== 'hello') return;

    var frame = document.querySelector('.dbml-diagram iframe');
    if (frame.contentWindow !== event.source) return;

    frame.contentWindow.postMessage({ source: 'dbml-frame', type: 'ready' }, '*');
    frame.contentWindow.postMessage(
      { source: 'dbml-frame', type: 'document', text: MODEL, tables: null, theme: 'light' },
      '*'
    );
  });
})();
</script>
</body></html>`;

const HOST_PUSHING_PAGE = pushingHostPage(ACL);

const servePushingHost = async (page: Page): Promise<void> => {
  await page.route("**/pushing-host.html", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: HOST_PUSHING_PAGE,
    });
  });
};

test("a frame with no source is handed its model by the host", async ({
  page,
}) => {
  const asked: string[] = [];

  page.on("request", (request) => {
    asked.push(request.url());
  });

  await servePushingHost(page);
  await page.goto("/pushing-host.html");

  const frame = page.frameLocator(".dbml-diagram iframe");
  await expect(frame.locator(".konvajs-content canvas").first()).toBeVisible();

  // Nothing fetched: this mode exists for a host that has the file and no
  // server.
  expect(asked.filter((url) => url.endsWith(".dbml"))).toEqual([]);
});

test("a frame nobody answers says so rather than sitting blank", async ({
  page,
}) => {
  await page.goto("/embed.html");

  // Two seconds, named in the plan and in both designs.
  await expect(page.getByText("No schema given")).toBeVisible({
    timeout: 5_000,
  });
});

// A model an impostor pushes, distinct from `ACL` by name alone, so its
// presence (or absence) on the canvas can be told apart from the real host's.
const IMPOSTOR_MODEL = `
Table "impostor"."malicious_table" {
  id integer [pk]
}
`;

// A page that embeds the diagram frame exactly as `pushingHostPage` does, and
// besides it a second, unrelated iframe — same origin, same page, but not the
// frame's own `window.parent` — that gets hold of the diagram frame's window
// through the DOM (something any same-origin script on the page could do) and
// posts it a `document` on its own, repeatedly, racing to arrive before the
// real host's reply. Built with `iframe.srcdoc` set as a JS string rather than
// written out as HTML, so the inner `<script>` needs no attribute-quoting
// gymnastics.
const IMPOSTOR_PUSHING_PAGE = `<!doctype html>
<html><head><style>
  body { margin: 0; padding: 40px; }
  .dbml-diagram { width: 600px; height: 300px; }
  .dbml-diagram iframe { width: 100%; height: 100%; border: 0; }
</style></head>
<body>
<div class="dbml-diagram"><iframe src="/embed.html"></iframe></div>
<script>
;(function () {
  var MODEL = ${JSON.stringify(ACL)};
  var IMPOSTOR = ${JSON.stringify(IMPOSTOR_MODEL)};

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (data === null || typeof data !== 'object' || data.source !== 'dbml-frame') return;
    if (data.type !== 'hello') return;

    var frame = document.querySelector('.dbml-diagram iframe');
    if (frame.contentWindow !== event.source) return;

    frame.contentWindow.postMessage({ source: 'dbml-frame', type: 'ready' }, '*');
    frame.contentWindow.postMessage(
      { source: 'dbml-frame', type: 'document', text: MODEL, tables: null, theme: 'light' },
      '*'
    );
  });

  var attacker = document.createElement('iframe');
  attacker.style.display = 'none';
  attacker.srcdoc =
    '<script>' +
    'var attempts = 0;' +
    'var timer = setInterval(function () {' +
    '  attempts += 1;' +
    '  var target = window.parent.document.querySelector(".dbml-diagram iframe");' +
    '  if (target && target.contentWindow) {' +
    '    target.contentWindow.postMessage(' +
    '      { source: "dbml-frame", type: "document", text: ' + JSON.stringify(IMPOSTOR) + ', tables: null, theme: "light" },' +
    '      "*"' +
    '    );' +
    '  }' +
    '  if (attempts > 20) clearInterval(timer);' +
    '}, 50);' +
    '<' + '/script>';
  document.body.appendChild(attacker);
})();
</script>
</body></html>`;

const serveImpostorPushingHost = async (page: Page): Promise<void> => {
  await page.route("**/impostor-pushing-host.html", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: IMPOSTOR_PUSHING_PAGE,
    });
  });
};

const embeddedFrame = (page: Page): Frame | undefined =>
  page.frames().find((f) => f.url().includes("embed.html"));

const embeddedTableNames = async (page: Page): Promise<string[]> =>
  (await embeddedFrame(page)?.evaluate(() => {
    const groups = (window.Konva?.stages[0]?.find("Group") ?? []) as Array<{
      name: () => string;
    }>;

    return groups
      .map((g) => g.name())
      .filter((name) => name.startsWith("table-"));
  })) ?? [];

test("a document posted by a window that is not the host is ignored", async ({
  page,
}) => {
  await serveImpostorPushingHost(page);
  await page.goto("/impostor-pushing-host.html");

  const frame = page.frameLocator(".dbml-diagram iframe");
  await expect(frame.locator(".konvajs-content canvas").first()).toBeVisible();

  // The real host's tables, and never the impostor's — whichever of the two
  // arrived at the frame first. `isFromHost` is an identity check, not a
  // first-come-first-served one.
  await expect
    .poll(async () => await embeddedTableNames(page))
    .toContain("table-acl.analysis");
  expect(await embeddedTableNames(page)).not.toContain(
    "table-impostor.malicious_table",
  );
});

// One table, so a second push that adds one more has somewhere new to place
// it: the shape Important 2's bug needed to show itself.
const SOLO_MODEL = `
Table "solo"."hub" {
  id integer [pk]
}
`;

const HUB_AND_SPOKE_MODEL = `
Table "solo"."hub" {
  id integer [pk]
}

Table "solo"."spoke" {
  id integer [pk]
  hub_id integer
}

Ref: "solo"."hub"."id" < "solo"."spoke"."hub_id"
`;

const serveSoloPushingHost = async (page: Page): Promise<void> => {
  await page.route("**/solo-pushing-host.html", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: pushingHostPage(SOLO_MODEL),
    });
  });
};

/** Posted from the test itself: a second `document`, after the frame has its first. */
const pushDocument = async (page: Page, model: string): Promise<void> => {
  await page.evaluate((text) => {
    const iframe = document.querySelector<HTMLIFrameElement>(
      ".dbml-diagram iframe",
    );

    iframe?.contentWindow?.postMessage(
      {
        source: "dbml-frame",
        type: "document",
        text,
        tables: null,
        theme: "light",
      },
      "*",
    );
  }, model);
};

const positionOf = async (
  page: Page,
  groupName: string,
): Promise<{ x: number; y: number } | null> =>
  (await embeddedFrame(page)?.evaluate((name) => {
    const groups = (window.Konva?.stages[0]?.find("Group") ?? []) as Array<{
      name: () => string;
      x: () => number;
      y: () => number;
    }>;
    const match = groups.find((g) => g.name() === name);

    return match !== undefined ? { x: match.x(), y: match.y() } : null;
  }, groupName)) ?? null;

test("a host that pushes a changed model lays the new tables out instead of stacking them at one point", async ({
  page,
}) => {
  await serveSoloPushingHost(page);
  await page.goto("/solo-pushing-host.html");

  const frame = page.frameLocator(".dbml-diagram iframe");
  await expect(frame.locator(".konvajs-content canvas").first()).toBeVisible();
  await expect
    .poll(async () => await embeddedTableNames(page))
    .toEqual(["table-solo.hub"]);

  // The same document key, a table the frame has never held a position for.
  await pushDocument(page, HUB_AND_SPOKE_MODEL);

  await expect
    .poll(async () => await embeddedTableNames(page))
    .toEqual(expect.arrayContaining(["table-solo.hub", "table-solo.spoke"]));

  // Not `defaultTableCoord` — the bug this guards piles a table with no
  // recovered entry exactly there, on top of nothing a reader could tell apart
  // from an empty canvas.
  const spoke = await positionOf(page, "table-solo.spoke");
  expect(spoke).not.toBeNull();
  expect(spoke).not.toEqual({ x: 0, y: 0 });
});

test("the frame leaves no trace in storage", async ({ page }) => {
  await serveModel(page);

  await page.goto("/embed.html?src=acl.dbml");
  await page.evaluate(() => {
    window.localStorage.setItem("web:theme", "dark");
  });

  await page.goto("/embed.html?src=acl.dbml&tables=analysis,analysis_liquid");
  await expect(canvasOf(page)).toBeVisible();

  const state = await page.evaluate(() => ({
    // Computing the layout is also what stores it, so the frame has to take it
    // back out. A key per frame per page would accumulate against a quota the
    // full application shares.
    ours: Object.keys(window.localStorage).filter((key) =>
      key.includes("embed:"),
    ),
    // And the theme is the reader's, not the page's: `web:theme` is one key for
    // this whole origin.
    theme: window.localStorage.getItem("web:theme"),
  }));

  expect(state.ours).toEqual([]);
  expect(state.theme).toBe("dark");
});

// A page that embeds the frame the way the site of documentation does. The real
// one is built by `antora/docs/lib/dbml-frame-host.js` in the documentation
// repository; this is the same protocol written out small, because the two
// repositories cannot import from each other and what is under test here is the
// frame's half of it.
//
// The box is deliberately small — 400×200 in a viewport several times that — so
// that expanding it is a change worth measuring rather than a few pixels.
const HOST_PAGE = `<!doctype html>
<html><head><style>
  body { margin: 0; padding: 40px; }
  .dbml-diagram { width: 400px; height: 200px; }
  .dbml-diagram iframe { width: 100%; height: 100%; border: 0; }
  .dbml-diagram--expanded {
    position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 1000; margin: 0;
    width: auto; height: auto; max-width: none; max-height: none;
  }
  html.locked, html.locked body { overflow: hidden; }
</style></head>
<body>
<div class="dbml-diagram"><iframe src="/embed.html?src=acl.dbml"></iframe></div>
<script>
;(function () {
  var expandedFrame = null;

  function frameOf(source) {
    var frames = document.querySelectorAll('.dbml-diagram iframe');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === source) return frames[i];
    }
    return null;
  }

  function post(frame, message) {
    frame.contentWindow.postMessage(message, window.location.origin);
  }

  function apply(frame, expanded) {
    frame.parentNode.classList.toggle('dbml-diagram--expanded', expanded);
    document.documentElement.classList.toggle('locked', expanded);
    expandedFrame = expanded ? frame : null;
    post(frame, { source: 'dbml-frame', type: 'expanded', expanded: expanded });
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin) return;
    var data = event.data;
    if (data === null || typeof data !== 'object' || data.source !== 'dbml-frame') return;
    var frame = frameOf(event.source);
    if (frame === null) return;
    if (data.type === 'hello') { post(frame, { source: 'dbml-frame', type: 'ready' }); return; }
    if (data.type === 'expand') apply(frame, data.expanded);
  });
})();
</script>
</body></html>`;

const serveHost = async (page: Page): Promise<void> => {
  await page.route("**/host.html", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: HOST_PAGE,
    });
  });
};

/** Puts the pointer over the diagram, which is what raises the toolbar. */
const reachForTheToolbar = async (page: Page, box: Locator): Promise<void> => {
  const bounds = await box.boundingBox();

  // `mouse.move` rather than `hover()`: the canvas animates its relations, so
  // Playwright can wait forever for it to be "stable" enough to hover.
  await page.mouse.move(
    (bounds?.x ?? 0) + (bounds?.width ?? 0) / 2,
    (bounds?.y ?? 0) + (bounds?.height ?? 0) / 2,
  );
};

const embeddedStageScale = async (page: Page): Promise<number> => {
  const frame = page.frames().find((f) => f.url().includes("embed.html"));

  return (
    (await frame?.evaluate(() => window.Konva?.stages[0]?.scaleX() ?? 0)) ?? 0
  );
};

test("a frame nobody is listening to offers no way out of the page", async ({
  page,
}) => {
  await serveModel(page);
  await page.goto("/embed.html?src=acl.dbml");
  await expect(canvasOf(page)).toBeVisible();
  await reachForTheToolbar(page, canvasOf(page));

  // The toolbar is up — this is not a test that passes because nothing rendered.
  await expect(page.getByRole("button", { name: "Fit to view" })).toBeVisible();

  // And there is no button, because there is no page around us to make room. A
  // frame opened straight from the address bar has `window.parent === window`,
  // so it would otherwise hear its own hello and believe it had a host.
  await expect(
    page.getByRole("button", { name: "Expand across the page" }),
  ).toHaveCount(0);
});

test("the reader can put the diagram across the page, and Escape puts it back", async ({
  page,
}) => {
  await serveModel(page);
  await serveHost(page);
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto("/host.html");

  const box = page.locator(".dbml-diagram");
  const frame = page.frameLocator(".dbml-diagram iframe");
  await expect(frame.locator(".konvajs-content canvas").first()).toBeVisible();

  const inTheColumn = await box.boundingBox();
  expect(inTheColumn?.width).toBe(400);

  const fittedSmall = await embeddedStageScale(page);
  expect(fittedSmall).toBeGreaterThan(0);

  await reachForTheToolbar(page, box);
  await frame.getByRole("button", { name: "Expand across the page" }).click();

  await expect.poll(async () => (await box.boundingBox())?.width).toBe(1100);
  expect((await box.boundingBox())?.height).toBe(700);

  // The room is no use unless the diagram takes it: the view is positioned once
  // on mount for every other host, and a frame that kept that framing would
  // answer the reader by putting the same small picture in the corner of a
  // large empty one.
  await expect
    .poll(async () => await embeddedStageScale(page))
    .toBeGreaterThan(fittedSmall * 2);

  // The button says what it does now, and the focus is inside the frame — which
  // is why the frame has to answer Escape itself. The page around it never sees
  // the keypress.
  await expect(
    frame.getByRole("button", { name: "Back into the page" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");

  await expect.poll(async () => (await box.boundingBox())?.width).toBe(400);
  await expect
    .poll(async () => await embeddedStageScale(page))
    .toBe(fittedSmall);
});

test("a model of a hundred and fifty tables opens, framed and not as a strip", async ({
  page,
}) => {
  await serveModel(page);

  const started = Date.now();
  await page.goto("/embed.html?src=large.dbml");
  await expect(canvasOf(page)).toBeVisible();

  const spread = await page.evaluate(() => {
    const groups = (window.Konva?.stages[0]?.find("Group") ?? []) as Array<{
      name: () => string;
      x: () => number;
      y: () => number;
    }>;
    const tables = groups.filter((group) =>
      String(group.name()).startsWith("table-"),
    );
    const xs = tables.map((table) => table.x());
    const ys = tables.map((table) => table.y());

    return {
      count: tables.length,
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  });

  const opened = Date.now() - started;

  // Every table, not the first screenful.
  expect(spread.count).toBe(151);

  // And laid out as a shape a reader can look at. The failure this guards is
  // not slowness but a strip: a hundred and fifty tables sharing one rank,
  // stacked down a single column, which fit-to-view then shows as an empty
  // canvas. Ten to one is far looser than the layout aims for and still an
  // order of magnitude tighter than that.
  const ratio =
    Math.max(spread.width, spread.height) /
    Math.max(1, Math.min(spread.width, spread.height));
  expect(ratio).toBeLessThan(10);

  // A budget, not a benchmark: it is here to fail on a change that turns the
  // arrangement quadratic, not to measure this machine.
  expect(opened).toBeLessThan(15_000);
});

test("the theme in the query reaches the canvas, not only the chrome", async ({
  page,
}) => {
  await serveModel(page);

  const background = async (): Promise<string> =>
    await page.evaluate(() => {
      const stage = window.Konva?.stages[0] as unknown as {
        container: () => HTMLElement;
      };
      return getComputedStyle(stage.container()).backgroundColor;
    });

  await page.goto("/embed.html?src=acl.dbml&theme=light");
  await expect(canvasOf(page)).toBeVisible();
  const light = {
    canvas: await background(),
    root: await page.evaluate(() => document.documentElement.className),
  };

  await page.goto("/embed.html?src=acl.dbml&theme=dark");
  await expect(canvasOf(page)).toBeVisible();
  const dark = {
    canvas: await background(),
    root: await page.evaluate(() => document.documentElement.className),
  };

  // The canvas takes its colours from a palette the chrome cannot reach — Konva
  // is given hex strings, not classes — so the two are separately capable of
  // being wrong. Checking the class alone would pass on a dark page with a
  // white diagram in it.
  expect(dark.canvas).not.toBe(light.canvas);
  expect(dark.root).toContain("dark");
  expect(light.root).not.toContain("dark");
});

test("the host can turn the diagram's lights off without reloading it", async ({
  page,
}) => {
  await serveModel(page);
  await serveHost(page);
  await page.goto("/host.html");

  const frame = page.frameLocator(".dbml-diagram iframe");
  await expect(frame.locator(".konvajs-content canvas").first()).toBeVisible();

  const inFrame = async <T>(fn: () => T): Promise<T> => {
    const found = page.frames().find((f) => f.url().includes("embed.html"));

    return (await found?.evaluate(fn)) as T;
  };

  const background = async (): Promise<string> =>
    await inFrame(() => {
      const stage = window.Konva?.stages[0] as unknown as {
        container: () => HTMLElement;
      };

      return getComputedStyle(stage.container()).backgroundColor;
    });

  const light = await background();
  // Something to lose: the view the reader is looking at, which a reload or a
  // remount would take with it.
  const before = await inFrame(() => window.Konva?.stages[0]?.scaleX() ?? 0);

  await page.evaluate(() => {
    const frameElement = document.querySelector<HTMLIFrameElement>(
      ".dbml-diagram iframe",
    );

    frameElement?.contentWindow?.postMessage(
      { source: "dbml-frame", type: "theme", theme: "dark" },
      "*",
    );
  });

  await expect.poll(async () => await background()).not.toBe(light);

  // The class on the frame's own root, not only the canvas: Konva is given hex
  // strings rather than classes, so the two are separately capable of being
  // wrong, and checking one would pass on a dark canvas in a white page.
  expect(await inFrame(() => document.documentElement.className)).toContain(
    "dark",
  );

  // Same stage, same view: nothing was rebuilt.
  expect(await inFrame(() => window.Konva?.stages[0]?.scaleX() ?? 0)).toBe(
    before,
  );
});

test.describe("in a browser that asks for Russian", () => {
  test.use({ locale: "ru-RU" });

  test("the interface answers in Russian", async ({ page }) => {
    await serveModel(page);
    await page.goto("/embed.html?src=acl.dbml");
    await expect(canvasOf(page)).toBeVisible();

    // The frame follows the browser rather than a setting: a documentation page
    // has no preferences screen to put one on.
    await expect(
      page.getByPlaceholder(MESSAGES_RU["search.placeholder"]),
    ).toBeAttached();
  });
});

test.describe("in a browser that asks for a language nobody has", () => {
  test.use({ locale: "is-IS" });

  test("the interface answers in English", async ({ page }) => {
    await serveModel(page);
    await page.goto("/embed.html?src=acl.dbml");
    await expect(canvasOf(page)).toBeVisible();

    await expect(
      page.getByPlaceholder(MESSAGES_EN["search.placeholder"]),
    ).toBeAttached();
  });
});
