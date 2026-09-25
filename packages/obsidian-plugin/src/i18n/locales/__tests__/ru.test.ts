import { ru } from "../ru";

// Literal Russian expectations, on purpose: this is the one place in the
// package the source-language guard lets Cyrillic live
// (`packages/json-table-schema-visualizer/src/i18n/__tests__/sourceLanguage.test.ts`
// excludes any path containing `src/i18n/locales/`), so it is the one place a
// wording regression in `ru.ts` can actually be caught. `messages.test.ts`
// only checks that the right catalog entry is picked for each error kind —
// dispatch, not wording — precisely so the two concerns stay separable: this
// file is what fails if a Russian sentence itself gets corrupted.
describe("ru.blockError", () => {
  it("modelMissing", () => {
    expect(ru.blockError.modelMissing()).toBe(
      "Ключ model пуст — укажите путь к файлу .dbml.",
    );
  });

  it("modelNotAPath", () => {
    expect(ru.blockError.modelNotAPath("[a, b]")).toBe(
      "model — путь к файлу .dbml, а не «[a, b]».",
    );
  });

  it("unknownKey", () => {
    expect(ru.blockError.unknownKey("tabels")).toBe(
      "Неизвестный ключ «tabels». Блок понимает model, tables, height и theme.",
    );
  });

  it("duplicateKey", () => {
    expect(ru.blockError.duplicateKey("model")).toBe(
      "Ключ «model» указан дважды.",
    );
  });

  it("malformedLine", () => {
    expect(ru.blockError.malformedLine("some prose")).toBe(
      "Строка «some prose» не похожа на «ключ: значение».",
    );
  });

  it("heightInvalid", () => {
    expect(ru.blockError.heightInvalid("tall")).toBe(
      "height — положительное целое число пикселей, а не «tall».",
    );
  });

  it("themeInvalid", () => {
    expect(ru.blockError.themeInvalid("sepia")).toBe(
      "theme — light или dark, а не «sepia».",
    );
  });

  it("tablesInvalid", () => {
    expect(ru.blockError.tablesInvalid("{a: b}")).toBe(
      "tables — имена таблиц через запятую, а не «{a: b}».",
    );
  });
});

describe("ru.readFailureReasons", () => {
  it("ENOENT", () => {
    expect(ru.readFailureReasons.ENOENT).toBe("файла нет");
  });

  it("EACCES", () => {
    expect(ru.readFailureReasons.EACCES).toBe("нет прав на чтение");
  });

  it("EPERM", () => {
    expect(ru.readFailureReasons.EPERM).toBe("нет прав на чтение");
  });

  it("EISDIR", () => {
    expect(ru.readFailureReasons.EISDIR).toBe("это папка");
  });
});

describe("ru.modelUnreadable", () => {
  it("names the path and the reason", () => {
    expect(
      ru.modelUnreadable(
        "/Users/kav/devzone/antora/models/rd.dbml",
        "файла нет",
      ),
    ).toBe(
      "Не удалось прочитать модель (файла нет): /Users/kav/devzone/antora/models/rd.dbml",
    );
  });
});

describe("ru.vaultNotOnDisk", () => {
  it("says the vault is not on disk", () => {
    expect(ru.vaultNotOnDisk()).toBe(
      "Хранилище открыто не с диска — модель читать неоткуда.",
    );
  });
});

describe("ru.refreshCommandName", () => {
  it("is the command palette entry for re-reading every model", () => {
    expect(ru.refreshCommandName).toBe("Обновить диаграммы");
  });
});
