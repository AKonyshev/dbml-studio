import { type BlockError } from "../blockParams";
import { ru } from "../i18n/locales/ru";
import {
  blockErrorText,
  modelUnreadableText,
  readFailureReason,
  vaultNotOnDiskText,
} from "../messages";

/** One of every kind, so a sentence-level rule is checked on all of them. */
const EVERY_KIND: BlockError[] = [
  { kind: "modelMissing" },
  { kind: "modelNotAPath", value: "[a, b]" },
  { kind: "unknownKey", key: "tabels" },
  { kind: "duplicateKey", key: "model" },
  { kind: "malformedLine", line: "some prose" },
  { kind: "heightInvalid", value: "tall" },
  { kind: "themeInvalid", value: "sepia" },
  { kind: "tablesInvalid", value: "{a: b}" },
];

describe("blockErrorText", () => {
  // Checked against the catalog function itself, not a substring of its
  // wording: this fails if `blockErrorText` picks the wrong entry, or if the
  // entry stops quoting the author's value, without this file needing to know
  // what the quoting looks like.
  it("picks the catalog entry for the error's kind, with its value", () => {
    expect(blockErrorText({ kind: "modelMissing" })).toBe(
      ru.blockError.modelMissing(),
    );
    expect(blockErrorText({ kind: "modelNotAPath", value: "[a, b]" })).toBe(
      ru.blockError.modelNotAPath("[a, b]"),
    );
    expect(blockErrorText({ kind: "unknownKey", key: "tabels" })).toBe(
      ru.blockError.unknownKey("tabels"),
    );
    expect(blockErrorText({ kind: "duplicateKey", key: "model" })).toBe(
      ru.blockError.duplicateKey("model"),
    );
    expect(blockErrorText({ kind: "malformedLine", line: "some prose" })).toBe(
      ru.blockError.malformedLine("some prose"),
    );
    expect(blockErrorText({ kind: "heightInvalid", value: "tall" })).toBe(
      ru.blockError.heightInvalid("tall"),
    );
    expect(blockErrorText({ kind: "themeInvalid", value: "sepia" })).toBe(
      ru.blockError.themeInvalid("sepia"),
    );
    expect(blockErrorText({ kind: "tablesInvalid", value: "{a: b}" })).toBe(
      ru.blockError.tablesInvalid("{a: b}"),
    );
  });

  it("ends every message as a sentence", () => {
    for (const error of EVERY_KIND) {
      expect(blockErrorText(error)).toMatch(/\.$/);
    }
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

/** A rejection from `fs`, as Node shapes it: an Error with a string `code`. */
const fsError = (code: string): Error =>
  Object.assign(new Error(`${code}: whatever`), { code });

describe("readFailureReason", () => {
  it("says the file is not there", () => {
    expect(readFailureReason(fsError("ENOENT"))).toBe(
      ru.readFailureReasons.ENOENT,
    );
  });

  it("says the file may not be read", () => {
    expect(readFailureReason(fsError("EACCES"))).toBe(
      ru.readFailureReasons.EACCES,
    );
    expect(readFailureReason(fsError("EPERM"))).toBe(
      ru.readFailureReasons.EPERM,
    );
  });

  // `model: /../antora/models/` — the folder, not a file in it.
  it("says the path is a folder", () => {
    expect(readFailureReason(fsError("EISDIR"))).toBe(
      ru.readFailureReasons.EISDIR,
    );
  });

  it("passes any other code through as it is", () => {
    expect(readFailureReason(fsError("EMFILE"))).toBe("EMFILE");
  });

  it("still gives a reason when there is no code at all", () => {
    expect(readFailureReason(new Error("boom"))).toBe("boom");
    expect(readFailureReason("boom")).toBe("boom");
  });
});

describe("modelUnreadableText", () => {
  // The path after resolution, not the one the author wrote: `/../` is where
  // these go wrong, and seeing where it landed is the whole answer.
  it("shows the resolved path of a model it could not read", () => {
    expect(
      modelUnreadableText(
        "/Users/kav/devzone/antora/models/rd.dbml",
        ru.readFailureReasons.ENOENT,
      ),
    ).toContain("/Users/kav/devzone/antora/models/rd.dbml");
  });

  it("says why it could not read it, via the catalog", () => {
    expect(modelUnreadableText("/models/", ru.readFailureReasons.EISDIR)).toBe(
      ru.modelUnreadable("/models/", ru.readFailureReasons.EISDIR),
    );
  });
});

describe("vaultNotOnDiskText", () => {
  it("is a sentence, not an empty box", () => {
    expect(vaultNotOnDiskText()).not.toBe("");
  });

  it("matches the catalog entry", () => {
    expect(vaultNotOnDiskText()).toBe(ru.vaultNotOnDisk());
  });
});
