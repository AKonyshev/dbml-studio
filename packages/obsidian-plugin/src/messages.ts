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
      return `Неизвестный ключ: ${error.key}. Блок понимает model, tables, height и theme.`;
    case "duplicateKey":
      return `Ключ указан дважды: ${error.key}.`;
    case "malformedLine":
      return `Строка не похожа на «ключ: значение»: ${error.line}`;
    case "heightInvalid":
      return `height — целое число пикселей больше нуля, а не «${error.value}».`;
    case "themeInvalid":
      return `theme — light или dark, а не «${error.value}».`;
    case "tablesInvalid":
      return `tables — имена таблиц через запятую, а не «${error.value}».`;
  }
};

/** The path as it was resolved, which is where `/../` goes wrong. */
export const modelUnreadableText = (path: string): string =>
  `Не удалось прочитать модель: ${path}`;

export const vaultNotOnDiskText = (): string =>
  "Хранилище открыто не с диска — модель читать неоткуда.";
