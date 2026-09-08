import type { EditOperation } from "shared/types/diagramEdit";
import type { QuickEditTarget } from "@/stores/quickEditStore";

/** Just the parts of a keystroke that decide anything. */
export interface QuickEditKey {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export type QuickEditIntent =
  | { kind: "close" }
  /** Let the text area have the key: a line break inside a note. */
  | { kind: "passThrough" }
  | { kind: "commitAndClose" }
  | { kind: "commitAndAddBelow" }
  /** Apply, then open the row drawn below — StarUML's Tab. */
  | { kind: "commitAndNext" }
  | { kind: "delete" }
  | { kind: "move"; direction: "up" | "down" };

/**
 * What a keystroke in the popup means, as a decision on its own.
 *
 * Separated from the component because it is the part worth being sure about:
 * the diagram has no React rendering tests, and the interesting failures here
 * are all "which key did what", not "what did the DOM look like". Following
 * StarUML, with the one addition a spreadsheet taught everyone — `Enter`
 * applies, `Shift+Enter` breaks the line.
 */
export const quickEditIntent = (
  event: QuickEditKey,
  hasField: boolean,
): QuickEditIntent | null => {
  const chord = event.ctrlKey === true || event.metaKey === true;

  if (event.key === "Escape") {
    return { kind: "close" };
  }

  if (event.key === "Enter" && event.shiftKey === true) {
    return { kind: "passThrough" };
  }

  if (event.key === "Enter" && chord) {
    return hasField
      ? { kind: "commitAndAddBelow" }
      : { kind: "commitAndClose" };
  }

  if (event.key === "Delete" && chord) {
    return hasField ? { kind: "delete" } : null;
  }

  if ((event.key === "ArrowUp" || event.key === "ArrowDown") && chord) {
    if (!hasField) return null;

    return { kind: "move", direction: event.key === "ArrowUp" ? "up" : "down" };
  }

  if (event.key === "Tab") {
    return hasField ? { kind: "commitAndNext" } : { kind: "commitAndClose" };
  }

  if (event.key === "Enter") {
    return { kind: "commitAndClose" };
  }

  return null;
};

/** What committing the popup's text asks the host to do. */
export const commitOperationFor = (
  target: QuickEditTarget,
  text: string,
): EditOperation =>
  target.field === undefined
    ? { kind: "renameTable", table: target.table, newName: text }
    : {
        kind: "replaceField",
        table: target.table,
        field: target.field,
        text,
      };
