import { type BlockError } from "./blockParams";
import { ru } from "./i18n/locales/ru";

/**
 * What the reader of a note is shown when a block cannot be drawn.
 *
 * The wording itself lives in `./i18n/locales/ru` — this only picks which
 * entry answers which kind of error. Everything inside the frame — a broken
 * model, a table that is not there — is the frame's to say
 * (`packages/web/src/embed/embedError.ts`), and is not repeated here: two
 * places writing the text of one error drift apart within a month.
 *
 * No `default` branch: the return type is `string`, so a ninth kind of error
 * without a wording here fails the typecheck instead of showing an empty box.
 */
export const blockErrorText = (error: BlockError): string => {
  switch (error.kind) {
    case "modelMissing":
      return ru.blockError.modelMissing();
    case "modelNotAPath":
      return ru.blockError.modelNotAPath(error.value);
    case "unknownKey":
      return ru.blockError.unknownKey(error.key);
    case "duplicateKey":
      return ru.blockError.duplicateKey(error.key);
    case "malformedLine":
      return ru.blockError.malformedLine(error.line);
    case "heightInvalid":
      return ru.blockError.heightInvalid(error.value);
    case "themeInvalid":
      return ru.blockError.themeInvalid(error.value);
    case "tablesInvalid":
      return ru.blockError.tablesInvalid(error.value);
  }
};

/**
 * Why a model could not be read, short enough to sit in parentheses.
 *
 * The path alone does not say it: a missing file, a locked one and a folder
 * named where a file belongs all look the same, and the path often looks right.
 * A code without a wording is shown as the code — it is still an answer
 * someone can search for.
 */
export const readFailureReason = (error: unknown): string => {
  const code =
    error instanceof Error && "code" in error ? error.code : undefined;

  if (typeof code === "string") {
    return ru.readFailureReasons[code] ?? code;
  }

  return error instanceof Error ? error.message : String(error);
};

/**
 * The path as it was resolved, which is where `/../` goes wrong. Last, so the
 * sentence's punctuation never runs into it.
 */
export const modelUnreadableText = (path: string, reason: string): string =>
  ru.modelUnreadable(path, reason);

export const vaultNotOnDiskText = (): string => ru.vaultNotOnDisk();

/** The frame could not be put into the plugin folder; no diagram can load. */
export const frameUnavailableText = (error: unknown): string =>
  ru.frameUnavailable(error instanceof Error ? error.message : String(error));
