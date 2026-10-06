import { type Catalog } from "../catalog";

/**
 * Every string a reader of a note sees, in English — what the plugin speaks
 * unless Obsidian itself is in Russian (`../language.ts`). The same entries as
 * `./ru.ts`, held to the same shape by `Catalog`.
 */
export const en: Catalog = {
  blockError: {
    modelMissing: () =>
      "The model key is empty — give the path to a .dbml file.",
    modelNotAPath: (value) =>
      `model is the path to a .dbml file, not “${value}”.`,
    unknownKey: (key) =>
      `Unknown key “${key}”. A block understands model, tables, height and theme.`,
    duplicateKey: (key) => `The key “${key}” is given twice.`,
    malformedLine: (line) =>
      `The line “${line}” does not look like “key: value”.`,
    heightInvalid: (value) =>
      `height is a whole number of pixels above zero, not “${value}”.`,
    themeInvalid: (value) => `theme is light or dark, not “${value}”.`,
    tablesInvalid: (value) =>
      `tables is table names separated by commas, not “${value}”.`,
  },

  readFailureReasons: {
    ENOENT: "no such file",
    EACCES: "no permission to read it",
    EPERM: "no permission to read it",
    EISDIR: "it is a folder",
  },

  modelUnreadable: (path, reason) =>
    `Could not read the model (${reason}): ${path}`,

  vaultNotOnDisk: () =>
    "The vault is not opened from disk — there is nowhere to read the model from.",

  frameUnavailable: (reason) =>
    `Could not prepare the diagram: its frame was not written to the plugin folder (${reason}).`,

  refreshCommandName: "Refresh diagrams",
};
