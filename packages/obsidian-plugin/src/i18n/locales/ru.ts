/**
 * Every string a reader of a note sees, in one place.
 *
 * The vault this plugin draws into is Russian (see the repository's global
 * constraints), so there is no catalog to switch between — this is the only
 * locale file here, not a scaffold for others. It lives under
 * `src/i18n/locales/` because that is the one path the repo-wide guard
 * (`packages/json-table-schema-visualizer/src/i18n/__tests__/
 * sourceLanguage.test.ts`) excludes from its "no Cyrillic outside a locale
 * file" rule: everywhere else in this package's sources stays English, and
 * the words a reader actually sees live here, gathered rather than scattered
 * across `messages.ts` and `main.ts`.
 *
 * Shaped as functions where the text takes a value, so a caller building a
 * sentence (`messages.ts`) never touches Cyrillic itself — it only calls
 * `ru.<name>(...)` and gets a finished string back.
 */
/** What `fs` said, in the reader's words where there are words for it. */
const READ_FAILURE_REASONS: Readonly<Record<string, string>> = {
  ENOENT: "файла нет",
  EACCES: "нет прав на чтение",
  EPERM: "нет прав на чтение",
  EISDIR: "это папка",
};

export const ru = {
  blockError: {
    modelMissing: (): string => "Ключ model пуст — укажите путь к файлу .dbml.",
    modelNotAPath: (value: string): string =>
      `model — путь к файлу .dbml, а не «${value}».`,
    unknownKey: (key: string): string =>
      `Неизвестный ключ «${key}». Блок понимает model, tables, height и theme.`,
    duplicateKey: (key: string): string => `Ключ «${key}» указан дважды.`,
    malformedLine: (line: string): string =>
      `Строка «${line}» не похожа на «ключ: значение».`,
    heightInvalid: (value: string): string =>
      `height — положительное целое число пикселей, а не «${value}».`,
    themeInvalid: (value: string): string =>
      `theme — light или dark, а не «${value}».`,
    tablesInvalid: (value: string): string =>
      `tables — имена таблиц через запятую, а не «${value}».`,
  },

  readFailureReasons: READ_FAILURE_REASONS,

  modelUnreadable: (path: string, reason: string): string =>
    `Не удалось прочитать модель (${reason}): ${path}`,

  vaultNotOnDisk: (): string =>
    "Хранилище открыто не с диска — модель читать неоткуда.",

  /** The command palette entry that re-reads every live diagram's model. */
  refreshCommandName: "Обновить диаграммы",
} as const;
