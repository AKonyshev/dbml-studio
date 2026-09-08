import { useEffect } from "react";
import { runDiagramAction } from "json-table-schema-visualizer/src/stores/diagramActions";

import { readDiagramAction } from "../../extension/types/webviewCommand";

/**
 * Run the diagram actions the extension relays.
 *
 * The webview listens for no keys of its own inside VS Code: the workbench
 * holds the chords so that a reader can rebind any of them in Keyboard
 * Shortcuts, and hands each one back as a command that lands here. Two
 * listeners for one keypress is how this last went wrong — the page and the
 * extension each toggled, and the two cancelled out.
 *
 * Which message counts is decided by `readDiagramAction`, so that the one part
 * of this worth getting wrong can be tested without a browser. See it for why
 * the sender is not checked.
 */
export const useHostActions = (): void => {
  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const action = readDiagramAction(event);
      if (action === null) {
        return;
      }

      runDiagramAction(action);
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, []);
};
