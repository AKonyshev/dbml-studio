import { embedErrorText } from "../embedError";

describe("embedErrorText", () => {
  it("says what is wrong, and names the thing it is wrong about", () => {
    expect(embedErrorText({ kind: "srcMissing" })).toBe("No schema given");
    expect(embedErrorText({ kind: "srcInvalid", value: "/shop.dbml" })).toBe(
      "Invalid schema path: /shop.dbml",
    );
    expect(embedErrorText({ kind: "notFound", src: "shop.dbml" })).toBe(
      "Schema not found: shop.dbml",
    );
    expect(embedErrorText({ kind: "tableMissing", name: "shop.ordre" })).toBe(
      "Table not found: shop.ordre",
    );
    expect(embedErrorText({ kind: "tableAmbiguous", name: "order" })).toBe(
      "This name belongs to more than one table — give the full name: order",
    );
    expect(embedErrorText({ kind: "noTablesLeft" })).toBe(
      "None of the named tables are in this schema",
    );
  });
});
