import { Theme } from "json-table-schema-visualizer/src/types/theme";

import { parseEmbedParams } from "../embedParams";

const FRAME_URL = "https://docs.example/project/_dbml/embed.html";

describe("parseEmbedParams", () => {
  it("reads a path, a table list and a theme", () => {
    expect(
      parseEmbedParams(
        "?src=acl.dbml&tables=analysis,analysis_liquid&theme=dark",
        FRAME_URL,
      ),
    ).toEqual({
      ok: true,
      params: {
        source: { kind: "catalog", path: "acl.dbml" },
        tables: ["analysis", "analysis_liquid"],
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
        "?src=acl.dbml&tables=%20analysis%20,,analysis_liquid",
        FRAME_URL,
      ),
    ).toEqual({
      ok: true,
      params: {
        source: { kind: "catalog", path: "acl.dbml" },
        tables: ["analysis", "analysis_liquid"],
        theme: Theme.light,
      },
    });
  });

  it("treats an empty table list as no filter at all", () => {
    expect(parseEmbedParams("?src=acl.dbml&tables=", FRAME_URL)).toEqual({
      ok: true,
      params: {
        source: { kind: "catalog", path: "acl.dbml" },
        tables: null,
        theme: Theme.light,
      },
    });
  });

  // Light rather than a refusal: the theme does not change what the diagram
  // means, and there is nothing to gain from failing the block over it.
  it("falls back to light for a theme it does not know", () => {
    expect(
      parseEmbedParams("?src=acl.dbml&theme=solarized", FRAME_URL),
    ).toEqual({
      ok: true,
      params: {
        source: { kind: "catalog", path: "acl.dbml" },
        tables: null,
        theme: Theme.light,
      },
    });
  });

  // The path is joined to `/schemas/` by `loadSchemaText`. A leading slash or a
  // `..` segment would aim it somewhere else, and a documentation page must not
  // be able to do that by accident.
  it("refuses a path that leaves the catalogue", () => {
    expect(parseEmbedParams("?src=/acl.dbml", FRAME_URL)).toEqual({
      ok: false,
      error: { kind: "srcInvalid", value: "/acl.dbml" },
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
      parseEmbedParams("?model=../models/acl.dbml&tables=analysis", FRAME_URL),
    ).toEqual({
      ok: true,
      params: {
        source: {
          kind: "url",
          url: "https://docs.example/project/models/acl.dbml",
        },
        tables: ["analysis"],
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
      parseEmbedParams("?model=https://example.com/acl.dbml", FRAME_URL),
    ).toEqual({
      ok: false,
      error: { kind: "modelOffOrigin", value: "https://example.com/acl.dbml" },
    });
  });

  // Never written by any of the three hosts; a hand-edited address bar is where
  // this comes from. Picking one of the two silently is the answer that would
  // confuse.
  it("refuses both sources at once", () => {
    expect(parseEmbedParams("?src=acl.dbml&model=acl.dbml", FRAME_URL)).toEqual(
      {
        ok: false,
        error: { kind: "sourceConflict" },
      },
    );
  });
});
