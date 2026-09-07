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
      // The extension reaches this page through the frame above it, so a sender
      // we can identify as anything else is not the host and has no business
      // driving the diagram. Deliberately permissive where the sender cannot be
      // identified at all: several hosts deliver an extension message with no
      // `source`, and refusing those would break the only way in.
      if (event.source != null && event.source !== window.parent) {
        return;
      }

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
