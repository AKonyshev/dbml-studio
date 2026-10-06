import { type Theme } from "./config";

/** The site folder everything this extension adds goes into. */
export const FRAME_DIR = "_dbml";
/** Inside FRAME_DIR: the models the blocks name, at their path in `models`. */
export const MODELS_DIR = "models";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export type ResolvedModel =
  | { ok: true; relative: string }
  | { ok: false; problem: string };

/**
 * A block's target as a path inside the models folder. `.dbml` is added
 * unless the target has it (devzone writes `dbml::acl[…]`). Nothing may lead
 * out of the folder: the frame serves the model from the site, and a path
 * that left `models` would leave `_dbml/models/` too.
 */
export const resolveModel = (target: string): ResolvedModel => {
  const name = target.trim();
  if (name === "") return { ok: false, problem: "the block names no model" };
  if (
    name.startsWith("/") ||
    /^[A-Za-z]:/.test(name) ||
    name.includes("\\") ||
    name.split("/").includes("..")
  ) {
    return { ok: false, problem: `"${name}" leaves the models folder` };
  }
  return { ok: true, relative: name.endsWith(".dbml") ? name : `${name}.dbml` };
};

/** As the frame reads `tables=`: blanks dropped, empty meaning everything. */
export const parseTables = (value: unknown): string[] | null => {
  if (typeof value !== "string") return null;
  const names = value
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  return names.length === 0 ? null : names;
};

export const parseHeight = (value: unknown): number | null => {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  const height = Number(value.trim());
  return height > 0 ? height : null;
};

export const parseTheme = (value: unknown): Theme | null =>
  value === "light" || value === "dark" ? value : null;

/**
 * From the page to the frame by Antora's `rootPath` (`..`, `../../..`), so the
 * site works from any path it is served under; from the frame to the model by
 * a path relative to the frame, which is what `model=` means to it
 * (packages/web/README.md, "The frame's query").
 */
export const frameSrc = (
  rootPath: string,
  relative: string,
  tables: string[] | null,
  theme: Theme,
): string => {
  const query = new URLSearchParams({ model: `${MODELS_DIR}/${relative}` });
  if (tables !== null) query.set("tables", tables.join(","));
  query.set("theme", theme);
  return `${rootPath}/${FRAME_DIR}/embed.html?${query.toString()}`;
};

/**
 * The wrapper the host script looks for (packages/web/README.md, "The host
 * script's HTML contract"). Always theme-fixed: the host script would send a
 * light theme to any other frame on a page that is not Material's, and an
 * Antora page has no theme toggle for a frame to follow.
 */
export const diagramHtml = (o: {
  src: string;
  height: number;
  title: string;
}): string =>
  '<div class="dbml-diagram" data-dbml-theme-fixed>' +
  `<iframe src="${escapeHtml(o.src)}" width="100%" height="${o.height}" ` +
  `loading="lazy" frameborder="0" title="${escapeHtml(o.title)}"></iframe></div>`;

/** Once per page, before its first diagram. */
export const hostAssetsHtml = (rootPath: string): string =>
  `<link rel="stylesheet" href="${escapeHtml(`${rootPath}/${FRAME_DIR}/frame-host.css`)}">` +
  `<script src="${escapeHtml(`${rootPath}/${FRAME_DIR}/frame-host.js`)}" defer></script>`;

/** In place of a diagram that cannot be drawn, so the reader sees why. */
export const errorHtml = (message: string): string =>
  '<div class="dbml-diagram-error"><p class="dbml-diagram-error__title">DBML diagram</p>' +
  `<p>${escapeHtml(message)}</p></div>`;

/** Antora's resource id for a page: `version@component:module:relative`. */
export const pageId = (src: {
  component: string;
  version: string;
  module: string;
  relative: string;
}): string =>
  `${src.version === "" ? "" : `${src.version}@`}${src.component}:${src.module}:${src.relative}`;
