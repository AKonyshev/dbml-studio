import {
  diagramHtml,
  errorHtml,
  frameSrc,
  hostAssetsHtml,
  pageId,
  parseHeight,
  parseTables,
  parseTheme,
  resolveModel,
} from "../block";

describe("resolveModel", () => {
  it("adds .dbml to a bare name, as devzone writes it", () => {
    expect(resolveModel("acl")).toEqual({ ok: true, relative: "acl.dbml" });
  });

  it("keeps a name that already ends in .dbml", () => {
    expect(resolveModel("acl.dbml")).toEqual({
      ok: true,
      relative: "acl.dbml",
    });
  });

  it("takes sub-folders, spaces and non-ASCII names", () => {
    // Built from code points because the repo keeps Cyrillic out of sources
    // (the sourceLanguage test): two Russian words with a space between.
    const name = `to-be/${String.fromCodePoint(
      0x43c,
      0x43e,
      0x434,
      0x435,
      0x43b,
      0x44c,
      0x20,
      0x434,
      0x430,
      0x43d,
      0x43d,
      0x44b,
      0x445,
    )}`;
    expect(resolveModel(name)).toEqual({
      ok: true,
      relative: `${name}.dbml`,
    });
  });

  it.each(["../secret", "a/../../b", "/etc/models", "a\\b", ""])(
    "refuses %p",
    (target) => {
      expect(resolveModel(target).ok).toBe(false);
    },
  );
});

describe("parseTables", () => {
  it("splits, trims and drops blanks", () => {
    expect(parseTables(" acl.a , b,, ")).toEqual(["acl.a", "b"]);
  });

  it("is null for absent or empty, which draws the whole model", () => {
    expect(parseTables(undefined)).toBeNull();
    expect(parseTables(" , ")).toBeNull();
  });
});

describe("parseHeight and parseTheme", () => {
  it("reads a positive whole height", () => {
    expect(parseHeight("600")).toBe(600);
  });

  it.each([undefined, "abc", "-5", "0", "1.5"])(
    "has no height for %p",
    (value) => {
      expect(parseHeight(value)).toBeNull();
    },
  );

  it("knows light and dark only", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("blue")).toBeNull();
    expect(parseTheme(undefined)).toBeNull();
  });
});

describe("frameSrc", () => {
  it("points from the page to the frame, and from the frame to the model", () => {
    expect(frameSrc("../../..", "acl.dbml", ["acl.a", "b"], "dark")).toBe(
      "../../../_dbml/embed.html?model=models%2Facl.dbml&tables=acl.a%2Cb&theme=dark",
    );
  });

  it("leaves tables out when the whole model is drawn", () => {
    expect(frameSrc(".", "acl.dbml", null, "light")).toBe(
      "./_dbml/embed.html?model=models%2Facl.dbml&theme=light",
    );
  });

  it("encodes a model path once", () => {
    expect(frameSrc(".", "to-be/a b.dbml", null, "light")).toContain(
      "model=models%2Fto-be%2Fa+b.dbml",
    );
  });
});

describe("diagramHtml", () => {
  it("is the host script's wrapper, fixed to the theme in its URL", () => {
    expect(
      diagramHtml({
        src: "./_dbml/embed.html?x=1&y=2",
        height: 600,
        title: 'a"b',
      }),
    ).toBe(
      '<div class="dbml-diagram" data-dbml-theme-fixed>' +
        '<iframe src="./_dbml/embed.html?x=1&amp;y=2" width="100%" height="600" ' +
        'loading="lazy" frameborder="0" title="a&quot;b"></iframe></div>',
    );
  });
});

describe("hostAssetsHtml", () => {
  it("links the host script and stylesheet from the page", () => {
    expect(hostAssetsHtml("..")).toBe(
      '<link rel="stylesheet" href="../_dbml/frame-host.css">' +
        '<script src="../_dbml/frame-host.js" defer></script>',
    );
  });
});

describe("errorHtml", () => {
  it("escapes the message", () => {
    expect(errorHtml("no <model>")).toBe(
      '<div class="dbml-diagram-error"><p class="dbml-diagram-error__title">DBML diagram</p>' +
        "<p>no &lt;model&gt;</p></div>",
    );
  });
});

describe("pageId", () => {
  it("is Antora's resource id", () => {
    expect(
      pageId({
        component: "docs",
        version: "2.0",
        module: "ROOT",
        relative: "a/b.adoc",
      }),
    ).toBe("2.0@docs:ROOT:a/b.adoc");
  });

  it("leaves out an empty version", () => {
    expect(
      pageId({
        component: "docs",
        version: "",
        module: "ROOT",
        relative: "b.adoc",
      }),
    ).toBe("docs:ROOT:b.adoc");
  });
});
