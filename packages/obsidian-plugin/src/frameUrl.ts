import { normalizePath, type Plugin } from "obsidian";

/**
 * A URL the Obsidian window will accept as an `<iframe>` src for a file that
 * ships inside the plugin folder.
 *
 * `getResourcePath` is what Obsidian hands out for its own local files, so the
 * frame is served the way an embedded image is, and the `./assets/…` its
 * document names resolve beside it. That the application lets such a URL be a
 * frame, and lets it load module scripts, is what the plan's first task
 * established by hand; the README says what to do if that ever changes.
 */
export const frameUrl = (plugin: Plugin, relativePath: string): string =>
  plugin.app.vault.adapter.getResourcePath(
    normalizePath(`${plugin.manifest.dir ?? ""}/${relativePath}`),
  );
