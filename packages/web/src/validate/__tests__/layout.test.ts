import { layoutProblems } from "../layout";

const MODEL = `
Table "shop"."order" {
  id integer [pk]
}
`;

const withLayout = (block: string): string =>
  `${MODEL}\n/*MetaInfo\n${block}\nMetaInfo*/\n`;

describe("layoutProblems", () => {
  it("says nothing about a model that carries no layout", () => {
    expect(layoutProblems(MODEL, ["shop.order"])).toEqual([]);
  });

  it("says nothing about a layout that reads", () => {
    expect(
      layoutProblems(withLayout('[{"name":"shop.order","x":0,"y":0}]'), [
        "shop.order",
      ]),
    ).toEqual([]);
  });

  // The whole reason this check exists: the viewer answers `null` for a block
  // that will not parse and lays the model out from scratch, so a missing comma
  // costs a hand-arranged diagram of a hundred tables with nothing said.
  it("names a layout that is not valid JSON", () => {
    const found = layoutProblems(withLayout('[{"name":"shop.order" "x":0}]'), [
      "shop.order",
    ]);

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("not valid JSON");
  });

  it("names a layout that is never closed off", () => {
    expect(
      layoutProblems(`${MODEL}\n/*MetaInfo\n[]\n`, ["shop.order"]),
    ).toEqual(["the saved layout is never closed off with `MetaInfo*/`"]);
  });

  it("names a layout that is not a list of positions", () => {
    expect(layoutProblems(withLayout("{}"), ["shop.order"])).toEqual([
      "the saved layout is not a list of positions",
    ]);
  });

  // A position for a table that has since been renamed or removed: the diagram
  // still draws, and the author is the only one who can tell whether they meant
  // to leave it behind.
  it("names a position for a table the model does not hold", () => {
    const found = layoutProblems(
      withLayout('[{"name":"shop.gone","x":0,"y":0}]'),
      ["shop.order"],
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("shop.gone");
  });
});
