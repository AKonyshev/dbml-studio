import { type BlockError } from "./blockParams";
import { type Catalog } from "./i18n/catalog";

/**
 * What the reader of a note is shown when a block cannot be drawn, in the
 * language of the catalog given (`i18n/language.ts` picks it).
 *
 * The wording itself lives in `./i18n/locales/` — this only picks which entry
 * answers which kind of error. Everything inside the frame — a broken model, a
 * table that is not there — is the frame's to say
 * (`packages/web/src/embed/embedError.ts`), and is not repeated here: two
 * places writing the text of one error drift apart within a month.
 */
export interface Messages {
  blockErrorText: (error: BlockError) => string;
  readFailureReason: (error: unknown) => string;
  modelUnreadableText: (path: string, reason: string) => string;
  vaultNotOnDiskText: () => string;
  frameUnavailableText: (error: unknown) => string;
  refreshCommandName: string;
}

export const messagesFor = (catalog: Catalog): Messages => ({
  /**
   * No `default` branch: the return type is `string`, so a ninth kind of error
   * without a wording here fails the typecheck instead of showing an empty box.
   */
  blockErrorText: (error) => {
    switch (error.kind) {
      case "modelMissing":
        return catalog.blockError.modelMissing();
      case "modelNotAPath":
        return catalog.blockError.modelNotAPath(error.value);
      case "unknownKey":
        return catalog.blockError.unknownKey(error.key);
      case "duplicateKey":
        return catalog.blockError.duplicateKey(error.key);
      case "malformedLine":
        return catalog.blockError.malformedLine(error.line);
      case "heightInvalid":
        return catalog.blockError.heightInvalid(error.value);
      case "themeInvalid":
        return catalog.blockError.themeInvalid(error.value);
      case "tablesInvalid":
        return catalog.blockError.tablesInvalid(error.value);
    }
  },

  /**
   * Why a model could not be read, short enough to sit in parentheses.
   *
   * The path alone does not say it: a missing file, a locked one and a folder
   * named where a file belongs all look the same, and the path often looks
   * right. A code without a wording is shown as the code — it is still an
   * answer someone can search for.
   */
  readFailureReason: (error) => {
    // Not `instanceof Error`: Node's `fs` builds its errors in Node's own
    // realm, which need not be the one this code's `Error` belongs to (it is
    // not under jsdom), and the code is what matters.
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;

    if (typeof code === "string") {
      return catalog.readFailureReasons[code] ?? code;
    }

    return error instanceof Error ? error.message : String(error);
  },

  /**
   * The path as it was resolved, which is where `/../` goes wrong. Last, so
   * the sentence's punctuation never runs into it.
   */
  modelUnreadableText: (path, reason) => catalog.modelUnreadable(path, reason),

  vaultNotOnDiskText: () => catalog.vaultNotOnDisk(),

  /** The frame could not be put into the plugin folder; no diagram can load. */
  frameUnavailableText: (error) =>
    catalog.frameUnavailable(
      error instanceof Error ? error.message : String(error),
    ),

  refreshCommandName: catalog.refreshCommandName,
});
