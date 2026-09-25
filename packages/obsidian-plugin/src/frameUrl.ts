import { normalizePath, type Plugin } from "obsidian";

/**
 * A URL the Obsidian window will accept as an `<iframe>` src for a file that
 * ships inside the plugin folder.
 *
 * `getResourcePath` is what Obsidian hands out for its own local files. A
 * document loaded by it gets an origin of its own and runs inline scripts,
 * but every external script it names is refused (`ERR_BLOCKED_BY_CLIENT`,
 * probe of 2026-09-25) — which is why `frame/embed.html` carries its code
 * inline and names no file (`scripts/vendor-frame.mjs`).
 */
export const frameUrl = (plugin: Plugin, relativePath: string): string =>
  plugin.app.vault.adapter.getResourcePath(
    normalizePath(`${plugin.manifest.dir ?? ""}/${relativePath}`),
  );
