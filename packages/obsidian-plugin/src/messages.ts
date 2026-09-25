import { type BlockError } from "./blockParams";

/**
 * What the reader of a note is shown when a block cannot be drawn.
 *
 * In Russian, as every note around it is. Everything inside the frame — a
 * broken model, a table that is not there — is the frame's to say
 * (`packages/web/src/embed/embedError.ts`), and is not repeated here: two
 * places writing the text of one error drift apart within a month.
 *
 * No `default` branch: the return type is `string`, so a ninth kind of error
 * without a wording here fails the typecheck instead of showing an empty box.
 */
export const blockErrorText = (error: BlockError): string => {
  switch (error.kind) {
    case "modelMissing":
      return "Ключ model пуст — укажите путь к файлу .dbml.";
    case "modelNotAPath":
      return `model — путь к файлу .dbml, а не «${error.value}».`;
    case "unknownKey":
      return `Неизвестный ключ «${error.key}». Блок понимает model, tables, height и theme.`;
    case "duplicateKey":
      return `Ключ «${error.key}» указан дважды.`;
    case "malformedLine":
      return `Строка «${error.line}» не похожа на «ключ: значение».`;
    case "heightInvalid":
      return `height — положительное целое число пикселей, а не «${error.value}».`;
    case "themeInvalid":
      return `theme — light или dark, а не «${error.value}».`;
    case "tablesInvalid":
      return `tables — имена таблиц через запятую, а не «${error.value}».`;
  }
};

/** What `fs` said, in the reader's words where there are words for it. */
const READ_FAILURES: Readonly<Record<string, string>> = {
  ENOENT: "файла нет",
  EACCES: "нет прав на чтение",
  EPERM: "нет прав на чтение",
  EISDIR: "это папка",
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
    return READ_FAILURES[code] ?? code;
  }

  return error instanceof Error ? error.message : String(error);
};

/**
 * The path as it was resolved, which is where `/../` goes wrong. Last, so the
 * sentence's punctuation never runs into it.
 */
export const modelUnreadableText = (path: string, reason: string): string =>
  `Не удалось прочитать модель (${reason}): ${path}`;

export const vaultNotOnDiskText = (): string =>
  "Хранилище открыто не с диска — модель читать неоткуда.";
