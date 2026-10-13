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
    for (const match of source.matchAll(/l10n\.t\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      keys.add(match[1].replace(/\\(.)/g, "$1"));
    }
  }
  return [...keys];
};

// Every non-test source a key may be written in: the extension itself, and
// schema-diff, whose comparison report is translated through the same bundles.
const sourceFiles = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          return ["__tests__", "__mocks__", "node_modules"].includes(entry.name)
            ? []
            : sourceFiles(full);
        }
        return /\.tsx?$/.test(entry.name) ? [full] : [];
      })
    : [];

const allSources = (): string =>
  [
    ...sourceFiles(EXTENSION),
    ...sourceFiles(path.join(EXTENSION, "..", "..", "schema-diff", "src")),
  ]
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");

// A key is used when it is written out as a string literal, in either quote.
const isReferenced = (key: string, sources: string): boolean =>
  sources.includes(JSON.stringify(key)) ||
  sources.includes(`'${key.replace(/'/g, "\\'")}'`);

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

  test("finds single-quoted literals too", () => {
    expect(literalKeys()).toContain('Delete connection "{0}"?');
  });

  test.each(LOCALES)("%s has no key that nothing refers to", (locale) => {
    const sources = allSources();
    expect(sources.length).toBeGreaterThan(10_000);
    expect(isReferenced("Edit connection: {0}", sources)).toBe(true);
    expect(isReferenced("No such key anywhere", sources)).toBe(false);

    expect(
      Object.keys(bundle(locale)).filter((key) => !isReferenced(key, sources)),
    ).toEqual([]);
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
