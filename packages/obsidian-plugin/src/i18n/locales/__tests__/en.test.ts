import { en } from "../en";

// Literal English expectations, the twin of `ru.test.ts`: `messages.test.ts`
// checks which entry answers which error, this file what the entry says.
describe("en.blockError", () => {
  it("modelMissing", () => {
    expect(en.blockError.modelMissing()).toBe(
      "The model key is empty — give the path to a .dbml file.",
    );
  });

  it("modelNotAPath", () => {
    expect(en.blockError.modelNotAPath("[a, b]")).toBe(
      "model is the path to a .dbml file, not “[a, b]”.",
    );
  });

  it("unknownKey", () => {
    expect(en.blockError.unknownKey("tabels")).toBe(
      "Unknown key “tabels”. A block understands model, tables, height and theme.",
    );
  });

  it("duplicateKey", () => {
    expect(en.blockError.duplicateKey("model")).toBe(
      "The key “model” is given twice.",
    );
  });

  it("malformedLine", () => {
    expect(en.blockError.malformedLine("some prose")).toBe(
      "The line “some prose” does not look like “key: value”.",
    );
  });

  it("heightInvalid", () => {
    expect(en.blockError.heightInvalid("tall")).toBe(
      "height is a whole number of pixels above zero, not “tall”.",
    );
  });

  it("themeInvalid", () => {
    expect(en.blockError.themeInvalid("sepia")).toBe(
      "theme is light or dark, not “sepia”.",
    );
  });

  it("tablesInvalid", () => {
    expect(en.blockError.tablesInvalid("{a: b}")).toBe(
      "tables is table names separated by commas, not “{a: b}”.",
    );
  });
});

describe("en.readFailureReasons", () => {
  it("ENOENT", () => {
    expect(en.readFailureReasons.ENOENT).toBe("no such file");
  });

  it("EACCES", () => {
    expect(en.readFailureReasons.EACCES).toBe("no permission to read it");
  });

  it("EPERM", () => {
    expect(en.readFailureReasons.EPERM).toBe("no permission to read it");
  });

  it("EISDIR", () => {
    expect(en.readFailureReasons.EISDIR).toBe("it is a folder");
  });
});

describe("en.modelUnreadable", () => {
  it("names the path and the reason", () => {
    expect(
      en.modelUnreadable("/Users/me/models/library.dbml", "no such file"),
    ).toBe(
      "Could not read the model (no such file): /Users/me/models/library.dbml",
    );
  });
});

describe("en.vaultNotOnDisk", () => {
  it("says the vault is not on disk", () => {
    expect(en.vaultNotOnDisk()).toBe(
      "The vault is not opened from disk — there is nowhere to read the model from.",
    );
  });
});

describe("en.frameUnavailable", () => {
  it("says the frame could not be written, and why", () => {
    expect(en.frameUnavailable("EROFS")).toBe(
      "Could not prepare the diagram: its frame was not written to the plugin folder (EROFS).",
    );
  });
});

describe("en.refreshCommandName", () => {
  // Sentence case, as Obsidian's command palette names are.
  it("is the command palette entry for re-reading every model", () => {
    expect(en.refreshCommandName).toBe("Refresh diagrams");
  });
});
