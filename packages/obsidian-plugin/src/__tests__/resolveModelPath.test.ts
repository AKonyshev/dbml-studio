import { resolveModelPath } from "../resolveModelPath";

const VAULT = "/Users/kav/Documents/GitHub/devzone/wiki";

describe("resolveModelPath", () => {
  // The form the vault will almost always use: the models live in the
  // repository next door, so the path leaves the vault on purpose.
  it("resolves a leading slash against the vault root", () => {
    expect(
      resolveModelPath(
        "/../antora/models/to-be/dbml/rd.dbml",
        VAULT,
        "modules/mer.md",
      ),
    ).toBe(
      "/Users/kav/Documents/GitHub/devzone/antora/models/to-be/dbml/rd.dbml",
    );
  });

  it("gives the same answer whatever the note's depth", () => {
    const fromRoot = resolveModelPath("/models/rd.dbml", VAULT, "index.md");
    const fromDeep = resolveModelPath(
      "/models/rd.dbml",
      VAULT,
      "modules/nsi/dictionary/agent.md",
    );

    expect(fromDeep).toBe(fromRoot);
    expect(fromRoot).toBe(`${VAULT}/models/rd.dbml`);
  });

  it("resolves anything else against the note's own folder", () => {
    expect(resolveModelPath("rd.dbml", VAULT, "modules/mer.md")).toBe(
      `${VAULT}/modules/rd.dbml`,
    );
    expect(resolveModelPath("../models/rd.dbml", VAULT, "modules/mer.md")).toBe(
      `${VAULT}/models/rd.dbml`,
    );
  });

  it("resolves a note at the root of the vault", () => {
    expect(resolveModelPath("rd.dbml", VAULT, "index.md")).toBe(
      `${VAULT}/rd.dbml`,
    );
  });

  it("collapses redundant segments", () => {
    expect(
      resolveModelPath("/models/./../models/rd.dbml", VAULT, "index.md"),
    ).toBe(`${VAULT}/models/rd.dbml`);
  });
});
