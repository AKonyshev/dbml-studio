import { useEffect, useRef } from "react";

import {
  DIAGRAM_ACTION_IDS,
  runDiagramAction,
  setDiagramActions,
  type DiagramActionHandlers,
} from "@/stores/diagramActions";
import { matchShortcut, type ShortcutEventLike } from "@/utils/matchShortcut";

/**
 * Hand the diagram's actions to the registry every host runs them through.
 *
 * Registered once and read through refs, because the handlers object has a new
 * identity on every render and the gate moves independently of it.
 */
export const useDiagramActions = (
  handlers: DiagramActionHandlers,
  enabled: boolean,
): void => {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    // Built once from the ids and reading the ref: a handler that changes
    // identity on the next render is still the one this object calls.
    const stable = Object.fromEntries(
      DIAGRAM_ACTION_IDS.map((id) => [
        id,
        () => {
          handlersRef.current[id]();
        },
      ]),
    ) as DiagramActionHandlers;

    setDiagramActions(stable, () => enabledRef.current);
    return () => {
      setDiagramActions(null);
    };
  }, []);
};

/**
 * The in-page keyboard: a bare letter on the document runs the action bound to
 * it.
 *
 * Off inside VS Code, where the workbench owns the chords and hands them back
 * as commands. Two listeners for one keypress is how this last went wrong: the
 * webview and the extension each toggled, and the two cancelled out.
 */
export const useKeyboardShortcuts = (enabled: boolean): void => {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!enabledRef.current) {
        return;
      }
      const id = matchShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        target: event.target as ShortcutEventLike["target"],
      });
      if (id == null) {
        return;
      }
      if (runDiagramAction(id)) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
};
