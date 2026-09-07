import { useEffect } from "react";
import { runDiagramAction } from "json-table-schema-visualizer/src/stores/diagramActions";

import { RUN_DIAGRAM_ACTION } from "../../extension/types/webviewCommand";

/**
 * Run the diagram actions the extension relays.
 *
 * The webview listens for no keys of its own inside VS Code: the workbench
 * holds the chords so that a reader can rebind any of them in Keyboard
 * Shortcuts, and hands each one back as a command that lands here. Two
 * listeners for one keypress is how this last went wrong — the page and the
 * extension each toggled, and the two cancelled out.
 */
export const useHostActions = (): void => {
  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const message = event.data as { type?: string; action?: string };
      if (message?.type !== RUN_DIAGRAM_ACTION) {
        return;
      }
      if (typeof message.action !== "string") {
        return;
      }

      runDiagramAction(message.action);
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, []);
};
