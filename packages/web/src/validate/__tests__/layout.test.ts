import { layoutProblems } from "../layout";

const MODEL = `
Table "acl"."analysis" {
  id integer [pk]
}
`;

const withLayout = (block: string): string =>
  `${MODEL}\n/*MetaInfo\n${block}\nMetaInfo*/\n`;

describe("layoutProblems", () => {
  it("says nothing about a model that carries no layout", () => {
    expect(layoutProblems(MODEL, ["acl.analysis"])).toEqual([]);
  });

  it("says nothing about a layout that reads", () => {
    expect(
      layoutProblems(withLayout('[{"name":"acl.analysis","x":0,"y":0}]'), [
        "acl.analysis",
      ]),
    ).toEqual([]);
  });

  // The whole reason this check exists: the viewer answers `null` for a block
  // that will not parse and lays the model out from scratch, so a missing comma
  // costs a hand-arranged diagram of a hundred tables with nothing said.
  it("names a layout that is not valid JSON", () => {
    const found = layoutProblems(
      withLayout('[{"name":"acl.analysis" "x":0}]'),
      ["acl.analysis"],
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("not valid JSON");
  });

  it("names a layout that is never closed off", () => {
    expect(
      layoutProblems(`${MODEL}\n/*MetaInfo\n[]\n`, ["acl.analysis"]),
    ).toEqual(["the saved layout is never closed off with `MetaInfo*/`"]);
  });

  it("names a layout that is not a list of positions", () => {
    expect(layoutProblems(withLayout("{}"), ["acl.analysis"])).toEqual([
      "the saved layout is not a list of positions",
    ]);
  });

  // A position for a table that has since been renamed or removed: the diagram
  // still draws, and the author is the only one who can tell whether they meant
  // to leave it behind.
  it("names a position for a table the model does not hold", () => {
    const found = layoutProblems(
      withLayout('[{"name":"acl.gone","x":0,"y":0}]'),
      ["acl.analysis"],
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("acl.gone");
  });
});
