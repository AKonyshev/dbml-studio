// Deliberately not routed through the visualizer's `PersistableStore`. That
// class parses JSON for its caller, which would move the decision about
// unreadable storage out of `parseSession` — where it is tested — and into a
// `JSON.parse` that throws. These two functions hand over the raw string and
// keep every judgement about its contents in one pure place. What they do
// decide is what the read itself did, which nothing else is in a position to
// know.
//
// The key still says `workspace`, which is the name of the model this one
// replaced. Kept on purpose: a new key would leave every reader's version 1
// value sitting in storage for good, unread and unreclaimed, while this one is
// overwritten the first time a session is saved.
const SESSION_KEY = "web:workspace";

/**
 * What reading storage found.
 *
 * `empty` and `unreadable` both leave the caller with no session to restore,
 * and they are still worth telling apart: nothing stored means the keys lying
 * around belong to nobody, while a refusal means there may be a session behind
 * it whose documents are not anyone's to throw away.
 */
export type StoredSession =
  { kind: "found"; raw: string } | { kind: "empty" } | { kind: "unreadable" };

/**
 * The stored session as it was written, unparsed.
 *
 * Reading can throw rather than return null: Safari's private mode and a
 * browser configured to block site data both raise on access. A reader who
 * cannot be given their previous documents should still get a working page.
 */
export const readStoredSession = (): StoredSession => {
  let raw: string | null;

  try {
    raw = window.localStorage.getItem(SESSION_KEY);
  } catch {
    return { kind: "unreadable" };
  }

  return raw === null ? { kind: "empty" } : { kind: "found", raw };
};

/**
 * Writing is best-effort for the same reasons, plus one more: the quota. A
 * session of large schemas can exceed it, and losing the ability to restore
 * documents is a far smaller loss than losing the page the reader is working
 * in.
 */
export const writeStoredSession = (serialised: string): void => {
  try {
    window.localStorage.setItem(SESSION_KEY, serialised);
  } catch {
    // Nothing useful to do, and nothing worth interrupting the reader over.
  }
};
