/**
 * The frame's URL with the theme it should paint before anyone speaks to it.
 *
 * `&` or `?` by what is already there: `getResourcePath` hands out URLs that
 * carry a cache-busting query of their own, and the frame reads its theme with
 * `URLSearchParams`, which does not care what else the query holds. Not
 * `URL.searchParams.set`: that rewrites the existing bare key as `key=`, and
 * whether the application's file handler minds is not worth finding out.
 */
export const withTheme = (url: string, theme: "light" | "dark"): string =>
  `${url}${url.includes("?") ? "&" : "?"}theme=${theme}`;

/**
 * The frame's URL with the language Obsidian speaks, so that the frame's
 * toolbar and errors match the plugin's rather than the system's. Appended
 * the way the theme is, for the same reason.
 */
export const withLanguage = (url: string, language: string): string =>
  `${url}${url.includes("?") ? "&" : "?"}lang=${encodeURIComponent(language)}`;
