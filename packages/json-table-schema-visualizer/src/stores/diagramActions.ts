import { SHORTCUTS, type ExecutableShortcutId } from "@/constants/shortcuts";

export type DiagramActionId = ExecutableShortcutId;
export type DiagramActionHandlers = Record<DiagramActionId, () => void>;

/**
 * The one way a diagram action is run, whoever asks for it.
 *
 * The keyboard used to call the handlers directly, which left a host that has
 * no keyboard of its own — VS Code, where the chords belong to the workbench so
 * that a reader can rebind them — with no way in at all. Everything lands here
 * instead: the in-page key handler, and the extension relaying a command the
 * user invoked from the palette or from a key they chose themselves.
 *
 * The registration is a module-level singleton because there is one diagram on
 * a page. A second one would overwrite the first; the viewer is keyed by
 * document, so mounting the next one is what we want the last word.
 */
let handlers: DiagramActionHandlers | null = null;
let isEnabled: () => boolean = () => false;

export const DIAGRAM_ACTION_IDS = SHORTCUTS.filter(
  (shortcut) => shortcut.executable,
).map((shortcut) => shortcut.id);

export const isDiagramActionId = (id: string): id is DiagramActionId =>
  (DIAGRAM_ACTION_IDS as string[]).includes(id);

/**
 * Publish the handlers, or withdraw them by passing null.
 *
 * `enabled` is read at the call rather than at registration, because it is the
 * diagram's own gate and it moves: it goes false while the legend is open, so
 * that a key or a command aimed at the canvas behind it does nothing. Reading
 * it late is what lets one registration on mount stay correct.
 */
export const setDiagramActions = (
  next: DiagramActionHandlers | null,
  enabled: () => boolean = () => true,
): void => {
  handlers = next;
  isEnabled = next === null ? () => false : enabled;
};

/** Whether anything ran. Callers use it only to decide about preventDefault. */
export const runDiagramAction = (id: string): boolean => {
  if (handlers === null || !isEnabled() || !isDiagramActionId(id)) {
    return false;
  }

  handlers[id]();
  return true;
};
