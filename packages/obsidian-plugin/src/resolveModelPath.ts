import { dirname, resolve } from "node:path";

/**
 * Where a block's `model:` actually points.
 *
 * Two bases, and which one applies is decided by the first character. A leading
 * slash means the vault's root — the form that reads the same in every note,
 * whatever folder it sits in and wherever it is later moved. Anything else is
 * resolved against the note's own folder, the way an ordinary Obsidian link is.
 * The MkDocs plugin keeps the same rule, with `docs_dir` for the vault.
 *
 * A consequence worth naming: a genuinely absolute path cannot be written in a
 * block at all, because that spelling is taken. The models live one directory
 * up from the vault, so the reachable form is `/../antora/...` — ungainly, and
 * the price of keeping the path in the block instead of in the settings.
 */
export const resolveModelPath = (
  modelPath: string,
  vaultRoot: string,
  notePath: string,
): string =>
  modelPath.startsWith("/")
    ? resolve(vaultRoot, `.${modelPath}`)
    : resolve(vaultRoot, dirname(notePath), modelPath);
