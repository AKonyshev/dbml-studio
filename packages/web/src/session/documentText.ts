import { textOf, type DocumentId, type Session } from "./session";

/**
 * Project files as they came off the server, by path.
 *
 * Not the reader's text and not persisted: this is what a file reverts *to*,
 * and what is shown until they make a version of their own. A reload fetches it
 * again, which is the point — the image may have been rebuilt since.
 */
export type LoadedTexts = Record<string, string>;

export const loadedOf = (
  loaded: LoadedTexts,
  id: DocumentId | null,
): string | null =>
  id === null || id.kind === "local" ? null : (loaded[id.path] ?? null);

/**
 * What to put in front of the reader for a document: their own version, else
 * what was loaded for it, else nothing.
 *
 * The three arguments travel together everywhere they travel at all, which is
 * why this exists rather than the `textOf(session, id, loadedOf(loaded, id))`
 * it replaces at four call sites.
 */
export const documentText = (
  session: Session,
  loaded: LoadedTexts,
  id: DocumentId,
): string => textOf(session, id, loadedOf(loaded, id)) ?? "";
