import { type BlockError } from "../blockParams";
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
  // In «», whatever the kind: bare after a colon, the value runs into the
  // sentence around it — `Неизвестный ключ: tabels.` reads the period as part
  // of the key, and an empty key leaves `ключ: .`.
  it("quotes what the author wrote", () => {
    expect(blockErrorText({ kind: "unknownKey", key: "tabels" })).toContain(
      "«tabels»",
    );
    expect(blockErrorText({ kind: "duplicateKey", key: "model" })).toContain(
      "«model»",
    );
    expect(
      blockErrorText({ kind: "malformedLine", line: "some prose" }),
    ).toContain("«some prose»");
    expect(blockErrorText({ kind: "heightInvalid", value: "tall" })).toContain(
      "«tall»",
    );
    expect(blockErrorText({ kind: "themeInvalid", value: "sepia" })).toContain(
      "«sepia»",
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

  it("says what a height has to be", () => {
    expect(blockErrorText({ kind: "heightInvalid", value: "tall" })).toContain(
      "положительное целое число пикселей",
    );
  });

  // A list or a mapping where the path should be: the reader needs to see
  // both which key it is and what was written there.
  it("names the model value that is not a path", () => {
    const text = blockErrorText({ kind: "modelNotAPath", value: "[a, b]" });

    expect(text).toContain("model");
    expect(text).toContain("«[a, b]»");
  });

  it("names the tables value it could not read", () => {
    const text = blockErrorText({ kind: "tablesInvalid", value: "{a: b}" });

    expect(text).toContain("tables");
    expect(text).toContain("«{a: b}»");
  });
});

/** A rejection from `fs`, as Node shapes it: an Error with a string `code`. */
const fsError = (code: string): Error =>
  Object.assign(new Error(`${code}: whatever`), { code });

describe("readFailureReason", () => {
  it("says the file is not there", () => {
    expect(readFailureReason(fsError("ENOENT"))).toBe("файла нет");
  });

  it("says the file may not be read", () => {
    expect(readFailureReason(fsError("EACCES"))).toBe("нет прав на чтение");
    expect(readFailureReason(fsError("EPERM"))).toBe("нет прав на чтение");
  });

  // `model: /../antora/models/` — the folder, not a file in it.
  it("says the path is a folder", () => {
    expect(readFailureReason(fsError("EISDIR"))).toBe("это папка");
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
        "файла нет",
      ),
    ).toContain("/Users/kav/devzone/antora/models/rd.dbml");
  });

  it("says why it could not read it", () => {
    expect(modelUnreadableText("/models/", "это папка")).toContain("это папка");
  });
});

describe("vaultNotOnDiskText", () => {
  it("is a sentence, not an empty box", () => {
    expect(vaultNotOnDiskText()).not.toBe("");
  });
});
