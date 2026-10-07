import { resolveModelPath } from "../resolveModelPath";

const VAULT = "/Users/me/notes";

describe("resolveModelPath", () => {
  // The form the vault will almost always use: the models live in the
  // repository next door, so the path leaves the vault on purpose.
  it("resolves a leading slash against the vault root", () => {
    expect(
      resolveModelPath("/../models/library.dbml", VAULT, "modules/orders.md"),
    ).toBe("/Users/me/models/library.dbml");
  });

  it("gives the same answer whatever the note's depth", () => {
    const fromRoot = resolveModelPath(
      "/models/library.dbml",
      VAULT,
      "index.md",
    );
    const fromDeep = resolveModelPath(
      "/models/library.dbml",
      VAULT,
      "modules/catalog/author.md",
    );

    expect(fromDeep).toBe(fromRoot);
    expect(fromRoot).toBe(`${VAULT}/models/library.dbml`);
  });

  it("resolves anything else against the note's own folder", () => {
    expect(resolveModelPath("library.dbml", VAULT, "modules/orders.md")).toBe(
      `${VAULT}/modules/library.dbml`,
    );
    expect(
      resolveModelPath("../models/library.dbml", VAULT, "modules/orders.md"),
    ).toBe(`${VAULT}/models/library.dbml`);
  });

  it("resolves a note at the root of the vault", () => {
    expect(resolveModelPath("library.dbml", VAULT, "index.md")).toBe(
      `${VAULT}/library.dbml`,
    );
  });

  it("collapses redundant segments", () => {
    expect(
      resolveModelPath("/models/./../models/library.dbml", VAULT, "index.md"),
    ).toBe(`${VAULT}/models/library.dbml`);
  });
});
