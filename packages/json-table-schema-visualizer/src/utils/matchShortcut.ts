import { SHORTCUTS, type ExecutableShortcutId } from "@/constants/shortcuts";
import { isTypingTarget, type TypingTarget } from "@/utils/isTypingTarget";

export interface ShortcutEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: TypingTarget | null;
}

export const matchShortcut = (
  event: ShortcutEventLike,
): ExecutableShortcutId | null => {
  if (event.altKey) {
    return null;
  }
  if (isTypingTarget(event.target)) {
    return null;
  }

  // shift is deliberately not blocked: '?' is typed as Shift+/. Ctrl and Cmd
  // are what tells a chord entry from a bare letter, and each answers only to
  // its own: a bare letter under Ctrl belongs to the workbench, and a chord
  // without it is just the key being typed.
  const chording = event.ctrlKey || event.metaKey;
  // A MacBook has no forward-delete key: the one under the reader's finger
  // sends `Backspace`, and `Delete` needs `fn` held as well. Outside a text
  // field the two ask for the same thing, and nothing else here is bound to
  // either.
  const key = event.key === "Backspace" ? "delete" : event.key.toLowerCase();
  const entry = SHORTCUTS.find(
    (shortcut) =>
      shortcut.executable &&
      shortcut.key.toLowerCase() === key &&
      ("chord" in shortcut && shortcut.chord) === chording,
  );

  if (entry == null) {
    return null;
  }

  // The predicate above already guarantees entry.executable === true, so
  // entry.id belongs to the ExecutableShortcutId union — TypeScript simply
  // cannot narrow that through .find().
  return entry.id as ExecutableShortcutId;
};
