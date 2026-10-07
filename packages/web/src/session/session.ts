/**
 * The documents the site knows about, as plain data.
 *
 * This replaces the workspace of numbered tabs. The difference that matters is
 * not the shape but the identity: a tab was identified by the order it was
 * opened in, and a document is identified by where it came from — a path in the
 * image, or an id this browser handed out. Layouts are filed under that
 * identity, so a schema arranged today is still arranged tomorrow, after a
 * restart, and after the volume behind it was swapped.
 *
 * Every function here is pure: nothing reads storage, nothing reads the clock,
 * nothing invents an id out of thin air. That is what lets the awkward cases —
 * deleting what you were looking at, a catalogue that lost the file you had
 * open, rubbish restored from an older deployment — be tested as arithmetic.
 */
export type DocumentId =
  { kind: "catalog"; path: string } | { kind: "local"; id: number };

export interface LocalFile {
  /**
   * Handed out once and never reused, because a layout is filed under it. A
   * counter that went back would give a new file another file's arrangement.
   */
  id: number;
  /** What the file was called wherever it came from. */
  name: string;
  text: string;
}

export interface Session {
  localFiles: LocalFile[];
  nextLocalId: number;
  /**
   * A project file's path to the version the reader made of it.
   *
   * The presence of the key is what "changed" means here — not a comparison
   * with the original. Keeping originals to compare against would cost a second
   * copy of every file opened, to catch someone who edited a schema back to
   * exactly what it was.
   */
  edits: Record<string, string>;
  selected: DocumentId | null;
}

// Bumped when the stored shape changes in a way `parseSession` cannot read.
// Version 1 was the workspace of tabs; see `parseSession` for why it is refused
// rather than migrated.
const STORAGE_VERSION = 2;

export const emptySession = (): Session => ({
  localFiles: [],
  nextLocalId: 1,
  edits: {},
  selected: null,
});

/**
 * Where the per-document stores point when nothing is open.
 *
 * They have no idea of "no document": whatever they were last switched to stays
 * their current key, and is written back on the next save. Without somewhere to
 * park them, deleting the last file would resurrect its layout under the key it
 * was just deleted from — and ids are never reused, so that key would never be
 * claimed by anything again.
 */
export const NO_DOCUMENT_KEY = "none";

/** The key a document's stored table layout is filed under. */
export const documentKeyOf = (id: DocumentId): string =>
  id.kind === "catalog" ? `catalog:${id.path}` : `local:${id.id}`;

export const sameDocument = (
  left: DocumentId | null,
  right: DocumentId | null,
): boolean => {
  if (left === null || right === null) {
    return left === right;
  }

  return documentKeyOf(left) === documentKeyOf(right);
};

export const localFileById = (
  session: Session,
  id: number,
): LocalFile | undefined => session.localFiles.find((file) => file.id === id);

export const selectDocument = (
  session: Session,
  selected: DocumentId,
): Session => ({ ...session, selected });

export const addLocalFile = (
  session: Session,
  name: string,
  text: string,
): Session => ({
  ...session,
  localFiles: [...session.localFiles, { id: session.nextLocalId, name, text }],
  // A file nobody is looking at is not worth opening.
  selected: { kind: "local", id: session.nextLocalId },
  nextLocalId: session.nextLocalId + 1,
});

/**
 * Where an edit lands depends on what is open, and the two cases are not
 * symmetric: a local file *is* its text, while a project file has a version on
 * the server that this never touches.
 */
export const updateSelectedText = (session: Session, text: string): Session => {
  const { selected } = session;

  if (selected === null) {
    return session;
  }

  if (selected.kind === "catalog") {
    return { ...session, edits: { ...session.edits, [selected.path]: text } };
  }

  return {
    ...session,
    localFiles: session.localFiles.map((file) =>
      file.id === selected.id ? { ...file, text } : file,
    ),
  };
};

export const removeLocalFile = (session: Session, id: number): Session => {
  const index = session.localFiles.findIndex((file) => file.id === id);

  if (index === -1) {
    return session;
  }

  const localFiles = session.localFiles.filter((file) => file.id !== id);

  // Deleting a file nobody was looking at must not move the reader.
  if (!sameDocument(session.selected, { kind: "local", id })) {
    return { ...session, localFiles };
  }

  // The file that slid into the deleted one's place, or the one before it when
  // the last file was deleted and nothing slid anywhere.
  const neighbour = localFiles[Math.min(index, localFiles.length - 1)];

  return {
    ...session,
    localFiles,
    selected:
      neighbour === undefined ? null : { kind: "local", id: neighbour.id },
  };
};

export const revertCatalogFile = (session: Session, path: string): Session => {
  const { [path]: removed, ...edits } = session.edits;

  return removed === undefined ? session : { ...session, edits };
};

export const isEdited = (session: Session, path: string): boolean =>
  session.edits[path] !== undefined;

/**
 * The text of a document: the reader's version if they have one, otherwise
 * whatever the caller loaded for it. `null` when there is nothing to show —
 * a local file that is gone, or a project file nobody has fetched.
 */
export const textOf = (
  session: Session,
  id: DocumentId,
  loaded: string | null,
): string | null => {
  if (id.kind === "local") {
    return localFileById(session, id.id)?.text ?? null;
  }

  return session.edits[id.path] ?? loaded;
};

/**
 * The selection, once the catalogue has been read.
 *
 * Storage is restored before the manifest arrives, and the two can disagree:
 * the file someone left open may not be in the image any more, or may never
 * have been in this one. Rather than an empty screen, the first thing the
 * deployment does have is chosen — a project file if there is one, otherwise
 * one of the reader's own.
 */
export const selectionAfterCatalogChange = (
  session: Session,
  paths: string[],
): Session => {
  const { selected } = session;

  const stillThere =
    selected !== null &&
    (selected.kind === "catalog"
      ? paths.includes(selected.path)
      : localFileById(session, selected.id) !== undefined);

  if (stillThere) {
    return session;
  }

  if (paths.length > 0) {
    return { ...session, selected: { kind: "catalog", path: paths[0] } };
  }

  const first = session.localFiles[0];

  return {
    ...session,
    selected: first === undefined ? null : { kind: "local", id: first.id },
  };
};

export const serialiseSession = (session: Session): string =>
  JSON.stringify({ version: STORAGE_VERSION, ...session });

const isLocalFile = (value: unknown): value is LocalFile => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const file = value as Record<string, unknown>;

  return (
    typeof file.id === "number" &&
    Number.isInteger(file.id) &&
    typeof file.name === "string" &&
    typeof file.text === "string"
  );
};

const isEdits = (value: unknown): value is Record<string, string> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((text) => typeof text === "string");
};

const parseSelected = (value: unknown): DocumentId | null | "refused" => {
  if (value === null) {
    return null;
  }

  if (typeof value !== "object") {
    return "refused";
  }

  const selected = value as Record<string, unknown>;

  if (selected.kind === "catalog" && typeof selected.path === "string") {
    return { kind: "catalog", path: selected.path };
  }

  if (
    selected.kind === "local" &&
    typeof selected.id === "number" &&
    Number.isInteger(selected.id)
  ) {
    return { kind: "local", id: selected.id };
  }

  return "refused";
};

/**
 * Storage back into a session, or `null` when it cannot be trusted.
 *
 * Everything is checked rather than cast: the value comes from a browser that
 * may have been running a different version of this site last week, and a cast
 * would turn that into a blank page with a `TypeError` in a console nobody has
 * open.
 *
 * Version 1 — the workspace of numbered tabs — is refused along with everything
 * else this cannot read. Migrating it was considered and declined: its layouts
 * are filed under tab numbers that mean nothing here, and its tabs would have
 * to be guessed back into files. The cost is real and is the reason this is
 * written down — someone returning to an unsaved draft loses it, once.
 */
export const parseSession = (raw: string | null): Session | null => {
  if (raw === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const candidate = parsed as Record<string, unknown>;

  if (candidate.version !== STORAGE_VERSION) {
    return null;
  }

  const { localFiles, nextLocalId, edits } = candidate;

  if (!Array.isArray(localFiles) || !localFiles.every(isLocalFile)) {
    return null;
  }

  if (typeof nextLocalId !== "number" || !Number.isInteger(nextLocalId)) {
    return null;
  }

  // A counter that would hand a new file an id already in use is worse than
  // starting over: it would silently give that file another one's layout.
  if (localFiles.some((file) => file.id >= nextLocalId)) {
    return null;
  }

  if (!isEdits(edits)) {
    return null;
  }

  const selected = parseSelected(candidate.selected);

  if (selected === "refused") {
    return null;
  }

  // A path is not checked against anything: the catalogue has not been read
  // yet, and `selectionAfterCatalogChange` is where that disagreement is
  // settled. A local id is checked, because everything needed to check it is
  // right here.
  if (
    selected !== null &&
    selected.kind === "local" &&
    !localFiles.some((file) => file.id === selected.id)
  ) {
    return null;
  }

  return { localFiles, nextLocalId, edits, selected };
};
