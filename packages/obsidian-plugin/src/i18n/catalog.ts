/**
 * The shape every catalog of reader-facing text has (`./locales/en.ts`,
 * `./locales/ru.ts`). Functions where the text takes a value, so a caller
 * building a sentence (`messages.ts`) never writes words of its own.
 */
export interface Catalog {
  blockError: {
    modelMissing: () => string;
    modelNotAPath: (value: string) => string;
    unknownKey: (key: string) => string;
    duplicateKey: (key: string) => string;
    malformedLine: (line: string) => string;
    heightInvalid: (value: string) => string;
    themeInvalid: (value: string) => string;
    tablesInvalid: (value: string) => string;
  };
  /** What `fs` said, in the reader's words where there are words for it. */
  readFailureReasons: Readonly<Record<string, string>>;
  modelUnreadable: (path: string, reason: string) => string;
  vaultNotOnDisk: () => string;
  frameUnavailable: (reason: string) => string;
  /** The command palette entry that re-reads every live diagram's model. */
  refreshCommandName: string;
}
