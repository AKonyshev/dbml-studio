import * as fs from "fs";
import * as path from "path";

import { formStrings } from "../connectionForm/strings";

const EXTENSION = path.join(__dirname, "..");
const LOCALES = ["ru", "zh-cn"];

// A key with no bundle entry silently falls back to English, so a half-translated
// form ships unnoticed. Two sources feed the form: the table the page looks its
// labels up in, and the l10n.t calls the host makes itself (the form's own
// files, plus the Edit connection command's picker).
const literalKeys = (): string[] => {
  const dir = path.join(EXTENSION, "connectionForm");
  const files = [
    ...fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => path.join(dir, f)),
    path.join(EXTENSION, "panelCommands.ts"),
  ];
  const keys = new Set<string>();
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/l10n\.t\(\s*("(?:[^"\\]|\\.)*")/g)) {
      keys.add(JSON.parse(match[1]) as string);
    }
  }
  return [...keys];
};

const bundle = (locale: string): Record<string, string> =>
  JSON.parse(
    fs.readFileSync(
      path.join(EXTENSION, "..", "l10n", `bundle.l10n.${locale}.json`),
      "utf8",
    ),
  ) as Record<string, string>;

// What the string input box used, and nothing else does.
const REMOVED_KEYS = [
  "Connection string for PostgreSQL, MySQL or SQL Server (the database in it is only the entry point)",
  "Use a postgres://, mysql://, mariadb://, sqlserver:// or mssql:// URL, or a SQL Server connection string (Server=…;Database=…;User Id=…;Password=…).",
  "Name for this connection",
  "Save this connection for next time?",
  "The connection could not be saved.",
];

describe("connection form / translation bundles", () => {
  test("the literal l10n.t keys are found at all", () => {
    expect(literalKeys()).toEqual(
      expect.arrayContaining([
        "Edit connection: {0}",
        "Select the connection to edit",
      ]),
    );
    expect(Object.keys(formStrings()).length).toBeGreaterThan(20);
  });

  test.each(LOCALES)("every form string is translated in %s", (locale) => {
    const translations = bundle(locale);
    const keys = [...Object.keys(formStrings()), ...literalKeys()];

    expect(keys.filter((key) => !(key in translations))).toEqual([]);
  });

  test.each(LOCALES)(
    "%s keeps the placeholders of each form string",
    (locale) => {
      const translations = bundle(locale);
      const placeholders = (text: string): string[] =>
        (text.match(/\{\d+\}/g) ?? []).sort();

      for (const key of [...Object.keys(formStrings()), ...literalKeys()]) {
        expect([key, placeholders(translations[key] ?? "")]).toEqual([
          key,
          placeholders(key),
        ]);
      }
    },
  );

  test.each(LOCALES)(
    "the retired string-box keys are gone from %s",
    (locale) => {
      const translations = bundle(locale);

      expect(REMOVED_KEYS.filter((key) => key in translations)).toEqual([]);
    },
  );
});
