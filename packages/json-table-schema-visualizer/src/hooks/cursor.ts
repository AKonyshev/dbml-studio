interface UseCursorChangerReturnValue {
  onChange: () => void;
  onRestore: () => void;
}

/**
 * Tailwind's own utilities, written out whole so that its scan of this file
 * keeps them in every stylesheet built from it (the site's, the frame's, the
 * VS Code webview's).
 */
const CURSOR_CLASSES = {
  grabbing: "cursor-grabbing",
  pointer: "cursor-pointer",
} as const;

export type BodyCursor = keyof typeof CURSOR_CLASSES;

/**
 * The page's cursor while something on the canvas wants one of its own.
 *
 * A class on `body` rather than `body.style.cursor`: restoring takes the class
 * off, so the page goes back to the cursor it had instead of being pinned to
 * `default`, and two of these overlapping cannot undo each other — a pointer
 * leaving the relation button mid-drag no longer drops the grabbing hand.
 */
export const useCursorChanger = (
  cursor: BodyCursor,
): UseCursorChangerReturnValue => {
  const className = CURSOR_CLASSES[cursor];

  return {
    onChange: () => {
      document.body.classList.add(className);
    },
    onRestore: () => {
      document.body.classList.remove(className);
    },
  };
};
