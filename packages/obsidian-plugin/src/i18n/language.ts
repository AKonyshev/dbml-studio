import { type Catalog } from "./catalog";
import { en } from "./locales/en";
import { ru } from "./locales/ru";

/**
 * The catalog for Obsidian's language, as `getLanguage()` names it: Russian
 * for "ru", English for everything else — English is what a reader of any
 * language without a catalog here is most likely to read.
 */
export const catalogFor = (language: string): Catalog =>
  language === "ru" ? ru : en;
