import { resolveModelUrl } from "../modelUrl";

// Where the frame document sits in a documentation site: a subdirectory of its
// own, at an unknown depth, on a site that may itself be in a subdirectory.
const FRAME_URL = "https://docs.example/project/_dbml/embed.html";

describe("resolveModelUrl", () => {
  it("resolves a path relative to the frame document", () => {
    expect(resolveModelUrl("models/shop.dbml", FRAME_URL)).toBe(
      "https://docs.example/project/_dbml/models/shop.dbml",
    );
  });

  // The ordinary case for a model the site serves beside its pages: the frame
  // is one directory deeper than the site root.
  it("resolves a path that climbs out of the frame's directory", () => {
    expect(resolveModelUrl("../models/shop.dbml", FRAME_URL)).toBe(
      "https://docs.example/project/models/shop.dbml",
    );
  });

  it("resolves a path from the root of the origin", () => {
    expect(resolveModelUrl("/models/shop.dbml", FRAME_URL)).toBe(
      "https://docs.example/models/shop.dbml",
    );
  });

  it("keeps a name that needs encoding", () => {
    expect(resolveModelUrl("../models/a b&c.dbml", FRAME_URL)).toBe(
      "https://docs.example/project/models/a%20b&c.dbml",
    );
  });

  // The address bar is editable and a page's HTML is generated: the frame must
  // not be able to fetch from another server even by accident. Not because the
  // frame could do harm with the answer — because such a dependency must not
  // appear silently.
  it("refuses another origin", () => {
    expect(
      resolveModelUrl("https://example.com/shop.dbml", FRAME_URL),
    ).toBeNull();
    expect(resolveModelUrl("//example.com/shop.dbml", FRAME_URL)).toBeNull();
    expect(
      resolveModelUrl("http://docs.example/shop.dbml", FRAME_URL),
    ).toBeNull();
  });

  it("refuses what is not a fetchable path at all", () => {
    expect(resolveModelUrl("", FRAME_URL)).toBeNull();
    expect(
      resolveModelUrl("data:text/plain,Table%20a%20{}", FRAME_URL),
    ).toBeNull();
    expect(
      resolveModelUrl("blob:https://docs.example/1234", FRAME_URL),
    ).toBeNull();
  });
});
