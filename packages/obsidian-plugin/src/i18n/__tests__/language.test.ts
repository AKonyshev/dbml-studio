import { catalogFor } from "../language";
import { en } from "../locales/en";
import { ru } from "../locales/ru";

// The codes are Obsidian's (`getLanguage()`): "en" by default, "ru" for
// Russian, and some with a region, like "zh-TW" or "pt-BR".
describe("catalogFor", () => {
  it("speaks Russian to a Russian Obsidian", () => {
    expect(catalogFor("ru")).toBe(ru);
  });

  it("speaks English to an English one", () => {
    expect(catalogFor("en")).toBe(en);
  });

  it("speaks English in any language it has no catalog for", () => {
    expect(catalogFor("de")).toBe(en);
    expect(catalogFor("pt-BR")).toBe(en);
    expect(catalogFor("")).toBe(en);
  });
});
