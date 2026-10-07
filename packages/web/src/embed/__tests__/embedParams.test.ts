import { Theme } from "json-table-schema-visualizer/src/types/theme";

import { parseEmbedParams } from "../embedParams";

const FRAME_URL = "https://docs.example/project/_dbml/embed.html";

describe("parseEmbedParams", () => {
  it("reads a path, a table list and a theme", () => {
    expect(
      parseEmbedParams(
        "?src=shop.dbml&tables=order,order_item&theme=dark",
        FRAME_URL,
      ),
    ).toEqual({
      ok: true,
      params: {
        source: { kind: "catalog", path: "shop.dbml" },
        tables: ["order", "order_item"],
        theme: Theme.dark,
      },
    });
  });

  it("reads a nested path", () => {
    expect(parseEmbedParams("?src=integration/asodu.dbml", FRAME_URL)).toEqual({
      ok: true,
      params: {
        source: { kind: "catalog", path: "integration/asodu.dbml" },
        tables: null,
        theme: Theme.light,
      },
    });
  });

  // The macro writes the query, but a reader can edit the address bar, and a
  // half-written attribute in a page is a real thing to survive.
  it("trims the names and drops empty ones", () => {
    expect(
      parseEmbedParams(
        "?src=shop.dbml&tables=%20order%20,,order_item",
        FRAME_URL,
      ),
    ).toEqual({
      ok: true,
      params: {
        source: { kind: "catalog", path: "shop.dbml" },
        tables: ["order", "order_item"],
        theme: Theme.light,
      },
    });
  });

  it("treats an empty table list as no filter at all", () => {
    expect(parseEmbedParams("?src=shop.dbml&tables=", FRAME_URL)).toEqual({
      ok: true,
      params: {
        source: { kind: "catalog", path: "shop.dbml" },
        tables: null,
        theme: Theme.light,
      },
    });
  });

  // Light rather than a refusal: the theme does not change what the diagram
  // means, and there is nothing to gain from failing the block over it.
  it("falls back to light for a theme it does not know", () => {
    expect(
      parseEmbedParams("?src=shop.dbml&theme=solarized", FRAME_URL),
    ).toEqual({
      ok: true,
      params: {
        source: { kind: "catalog", path: "shop.dbml" },
        tables: null,
        theme: Theme.light,
      },
    });
  });

  // The path is joined to `/schemas/` by `loadSchemaText`. A leading slash or a
  // `..` segment would aim it somewhere else, and a documentation page must not
  // be able to do that by accident.
  it("refuses a path that leaves the catalogue", () => {
    expect(parseEmbedParams("?src=/shop.dbml", FRAME_URL)).toEqual({
      ok: false,
      error: { kind: "srcInvalid", value: "/shop.dbml" },
    });
    expect(parseEmbedParams("?src=../../etc/passwd", FRAME_URL)).toEqual({
      ok: false,
      error: { kind: "srcInvalid", value: "../../etc/passwd" },
    });
    expect(parseEmbedParams("?src=a/../../b.dbml", FRAME_URL)).toEqual({
      ok: false,
      error: { kind: "srcInvalid", value: "a/../../b.dbml" },
    });
    expect(
      parseEmbedParams("?src=https://example.com/x.dbml", FRAME_URL),
    ).toEqual({
      ok: false,
      error: { kind: "srcInvalid", value: "https://example.com/x.dbml" },
    });
  });

  it("reads a model addressed by URL", () => {
    expect(
      parseEmbedParams("?model=../models/shop.dbml&tables=order", FRAME_URL),
    ).toEqual({
      ok: true,
      params: {
        source: {
          kind: "url",
          url: "https://docs.example/project/models/shop.dbml",
        },
        tables: ["order"],
        theme: Theme.light,
      },
    });
  });

  // Neither parameter is not a mistake any more: it is how a plugin frame says
  // "my host will hand me the model". The frame waits, and says the old thing if
  // nobody does — which is what keeps `embed.html`, opened by hand, explaining
  // itself.
  it("waits for the host when neither source is given", () => {
    expect(parseEmbedParams("", FRAME_URL)).toEqual({
      ok: true,
      params: { source: { kind: "hosted" }, tables: null, theme: Theme.light },
    });
    expect(parseEmbedParams("?theme=dark", FRAME_URL)).toEqual({
      ok: true,
      params: { source: { kind: "hosted" }, tables: null, theme: Theme.dark },
    });
  });

  it("treats an empty path as no path at all", () => {
    expect(parseEmbedParams("?src=", FRAME_URL)).toEqual({
      ok: true,
      params: { source: { kind: "hosted" }, tables: null, theme: Theme.light },
    });
  });

  it("refuses a model that is not on this site", () => {
    expect(
      parseEmbedParams("?model=https://example.com/shop.dbml", FRAME_URL),
    ).toEqual({
      ok: false,
      error: { kind: "modelOffOrigin", value: "https://example.com/shop.dbml" },
    });
  });

  // Never written by any of the three hosts; a hand-edited address bar is where
  // this comes from. Picking one of the two silently is the answer that would
  // confuse.
  it("refuses both sources at once", () => {
    expect(
      parseEmbedParams("?src=shop.dbml&model=shop.dbml", FRAME_URL),
    ).toEqual({
      ok: false,
      error: { kind: "sourceConflict" },
    });
  });
});

// `theme=auto` is a documentation site saying "my page picks its colours by the
// system": the frame answers the same question the same way, from its own
// window. Jest runs these without a browser, so the window is a stub that
// answers `prefers-color-scheme` — or refuses to, like a browser that will not
// say.
describe("parseEmbedParams with theme=auto", () => {
  const withSystem = (answer: "dark" | "light" | "silent"): void => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        matchMedia: (query: string) => {
          if (answer === "silent") {
            throw new Error("matchMedia is not available");
          }

          return {
            matches:
              query === "(prefers-color-scheme: dark)" && answer === "dark",
          };
        },
      },
    });
  };

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("opens dark on a dark system", () => {
    withSystem("dark");

    expect(parseEmbedParams("?src=shop.dbml&theme=auto", FRAME_URL)).toEqual({
      ok: true,
      params: {
        source: { kind: "catalog", path: "shop.dbml" },
        tables: null,
        theme: Theme.dark,
      },
    });
  });

  it("opens light on a light system", () => {
    withSystem("light");

    expect(parseEmbedParams("?src=shop.dbml&theme=auto", FRAME_URL)).toEqual({
      ok: true,
      params: {
        source: { kind: "catalog", path: "shop.dbml" },
        tables: null,
        theme: Theme.light,
      },
    });
  });

  // The site's own rule for a browser that will not say, and the frame is part
  // of the site.
  it("opens dark when the browser will not say", () => {
    withSystem("silent");

    expect(parseEmbedParams("?src=shop.dbml&theme=auto", FRAME_URL)).toEqual({
      ok: true,
      params: {
        source: { kind: "catalog", path: "shop.dbml" },
        tables: null,
        theme: Theme.dark,
      },
    });
  });

  // The hosted mode draws its "waiting" state before any document arrives, and
  // that state should already be the page's colour.
  it("follows the system in the hosted mode too", () => {
    withSystem("dark");

    expect(parseEmbedParams("?theme=auto", FRAME_URL)).toEqual({
      ok: true,
      params: { source: { kind: "hosted" }, tables: null, theme: Theme.dark },
    });
  });

  // Only `auto` asks the system. Every URL written before it existed keeps its
  // meaning on a dark machine.
  it("leaves every other value as it was", () => {
    withSystem("dark");

    const themeOf = (value: string): Theme | null => {
      const result = parseEmbedParams(
        `?src=shop.dbml&theme=${value}`,
        FRAME_URL,
      );
      return result.ok ? result.params.theme : null;
    };

    expect(themeOf("light")).toBe(Theme.light);
    expect(themeOf("dark")).toBe(Theme.dark);
    expect(themeOf("solarized")).toBe(Theme.light);
    expect(themeOf("AUTO")).toBe(Theme.light);
  });
});
