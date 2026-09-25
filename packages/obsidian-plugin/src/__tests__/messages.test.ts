import {
  blockErrorText,
  modelUnreadableText,
  vaultNotOnDiskText,
} from "../messages";

describe("blockErrorText", () => {
  it("names what is wrong", () => {
    expect(blockErrorText({ kind: "unknownKey", key: "tabels" })).toContain(
      "tabels",
    );
    expect(blockErrorText({ kind: "duplicateKey", key: "model" })).toContain(
      "model",
    );
    expect(
      blockErrorText({ kind: "malformedLine", line: "some prose" }),
    ).toContain("some prose");
    expect(blockErrorText({ kind: "heightInvalid", value: "tall" })).toContain(
      "tall",
    );
    expect(blockErrorText({ kind: "themeInvalid", value: "sepia" })).toContain(
      "sepia",
    );
  });

  it("says what an empty model line is missing", () => {
    expect(blockErrorText({ kind: "modelMissing" })).toContain("model");
  });

  // A list or a mapping where the path should be: the reader needs to see
  // both which key it is and what was written there.
  it("names the model value that is not a path", () => {
    const text = blockErrorText({ kind: "modelNotAPath", value: "[a, b]" });

    expect(text).toContain("model");
    expect(text).toContain("[a, b]");
  });

  it("names the tables value it could not read", () => {
    const text = blockErrorText({ kind: "tablesInvalid", value: "{a: b}" });

    expect(text).toContain("tables");
    expect(text).toContain("{a: b}");
  });
});

describe("modelUnreadableText", () => {
  // The path after resolution, not the one the author wrote: `/../` is where
  // these go wrong, and seeing where it landed is the whole answer.
  it("shows the resolved path of a model it could not read", () => {
    expect(
      modelUnreadableText("/Users/kav/devzone/antora/models/rd.dbml"),
    ).toContain("/Users/kav/devzone/antora/models/rd.dbml");
  });
});

describe("vaultNotOnDiskText", () => {
  it("is a sentence, not an empty box", () => {
    expect(vaultNotOnDiskText()).not.toBe("");
  });
});
