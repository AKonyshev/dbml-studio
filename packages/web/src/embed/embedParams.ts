import { Theme } from "json-table-schema-visualizer/src/types/theme";

import { type EmbedError } from "./embedError";
import { resolveModelUrl } from "./modelUrl";

/**
 * Where the frame gets its model, in the three ways a host can say it.
 *
 * `catalog` is the container's and Antora's: a path inside `/schemas/`, joined
 * by `loadSchemaText`. `url` is a documentation site's own: it serves the model
 * at a path of its own, and the frame is told where relative to itself.
 * `hosted` is a plugin's: there is no server, and the model arrives as a
 * message.
 *
 * One of the three, and each with its own checking — which is why this is a
 * union and not three optional fields.
 */
export type SchemaSource =
  | { kind: "catalog"; path: string }
  | { kind: "url"; url: string }
  | { kind: "hosted" };

export interface EmbedParams {
  source: SchemaSource;
  /** Names to keep, or `null` for the whole schema. Never an empty array: an
   * empty list means the author filtered nothing, not that they filtered
   * everything away. */
  tables: string[] | null;
  theme: Theme;
}

export type EmbedParamsResult =
  | { ok: true; params: EmbedParams }
  | { ok: false; error: EmbedError };

/**
 * A path is only ever joined to `/schemas/`, so it must not be able to aim
 * anywhere else: no leading slash, no `..` segment, no scheme. Checked here
 * rather than trusted from the macro, because the address bar is editable and
 * the frame is what a reader ends up looking at.
 */
const isCatalogPath = (value: string): boolean => {
  if (value.startsWith("/") || value.includes("://")) {
    return false;
  }

  return !value.split("/").includes("..");
};

export const themeFromName = (value: "light" | "dark"): Theme =>
  value === "dark" ? Theme.dark : Theme.light;

const parseTheme = (value: string | null): Theme =>
  value === Theme.dark ? Theme.dark : Theme.light;

const parseTables = (value: string | null): string[] | null => {
  if (value === null) {
    return null;
  }

  const names = value
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");

  return names.length === 0 ? null : names;
};

/**
 * `documentUrl` is asked for rather than read off `window`: the whole of this
 * module is testable without a browser, and a model URL cannot be resolved
 * without knowing where the document resolving it sits.
 */
export const parseEmbedParams = (
  search: string,
  documentUrl: string,
): EmbedParamsResult => {
  const query = new URLSearchParams(search);
  const src = query.get("src") ?? "";
  const model = query.get("model") ?? "";

  if (src !== "" && model !== "") {
    return { ok: false, error: { kind: "sourceConflict" } };
  }

  const rest = {
    tables: parseTables(query.get("tables")),
    theme: parseTheme(query.get("theme")),
  };

  if (src !== "") {
    return isCatalogPath(src)
      ? {
          ok: true,
          params: { source: { kind: "catalog", path: src }, ...rest },
        }
      : { ok: false, error: { kind: "srcInvalid", value: src } };
  }

  if (model !== "") {
    const url = resolveModelUrl(model, documentUrl);

    return url === null
      ? { ok: false, error: { kind: "modelOffOrigin", value: model } }
      : { ok: true, params: { source: { kind: "url", url }, ...rest } };
  }

  return { ok: true, params: { source: { kind: "hosted" }, ...rest } };
};
