import { type BlockError } from "../blockParams";
import { en } from "../i18n/locales/en";
import { ru } from "../i18n/locales/ru";
import { messagesFor } from "../messages";

// Dispatch is the same for every catalog; these run it against the Russian
// one, and the last describe shows the English one is reached the same way.
const {
  blockErrorText,
  frameUnavailableText,
  modelUnreadableText,
  readFailureReason,
  vaultNotOnDiskText,
} = messagesFor(ru);

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
  // Dispatch only: this fails if `blockErrorText` calls the wrong catalog
  // entry for a kind, or drops the value it was given — but calling the same
  // `ru.blockError.*` function on both sides of `toBe` means it can never
  // catch a corrupted Russian sentence inside `ru.ts` itself. That is what
  // `i18n/locales/__tests__/ru.test.ts` pins with literal expected strings.
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

// Dispatch only, throughout this describe: which catalog reason an fs error
// code maps to, not what the reason says — `ru.test.ts` pins the wording.
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

  // `model: /../models/` — the folder, not a file in it.
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
        "/Users/me/models/library.dbml",
        ru.readFailureReasons.ENOENT,
      ),
    ).toContain("/Users/me/models/library.dbml");
  });

  // Dispatch only, like the `blockErrorText` tests above: this checks that
  // `modelUnreadableText` passes both arguments through to `ru.modelUnreadable`
  // unchanged, not what the resulting Russian sentence says — that is
  // `ru.test.ts`'s job.
  it("passes the path and reason through to the catalog", () => {
    expect(modelUnreadableText("/models/", ru.readFailureReasons.EISDIR)).toBe(
      ru.modelUnreadable("/models/", ru.readFailureReasons.EISDIR),
    );
  });
});

describe("frameUnavailableText", () => {
  // Dispatch only — the wording itself is pinned in the catalog's own test.
  it("passes the error's message to the catalog", () => {
    expect(frameUnavailableText(new Error("EROFS: read-only"))).toBe(
      ru.frameUnavailable("EROFS: read-only"),
    );
  });

  it("still gives a reason for something thrown that is not an Error", () => {
    expect(frameUnavailableText("disk full")).toBe(
      ru.frameUnavailable("disk full"),
    );
  });
});

describe("messagesFor", () => {
  it("speaks the catalog it is given", () => {
    const english = messagesFor(en);

    expect(english.blockErrorText({ kind: "unknownKey", key: "tabels" })).toBe(
      en.blockError.unknownKey("tabels"),
    );
    expect(english.readFailureReason(fsError("ENOENT"))).toBe(
      en.readFailureReasons.ENOENT,
    );
    expect(english.vaultNotOnDiskText()).toBe(en.vaultNotOnDisk());
    expect(english.refreshCommandName).toBe(en.refreshCommandName);
  });
});

describe("vaultNotOnDiskText", () => {
  it("is a sentence, not an empty box", () => {
    expect(vaultNotOnDiskText()).not.toBe("");
  });

  // Dispatch only — the wording itself is pinned in `ru.test.ts`.
  it("calls the catalog entry", () => {
    expect(vaultNotOnDiskText()).toBe(ru.vaultNotOnDisk());
  });
});
