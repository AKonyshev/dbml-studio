import { useEffect } from "react";
import { isTypingTarget } from "json-table-schema-visualizer/src/utils/isTypingTarget";

import { setTypingFocusMessage } from "../../extension/types/webviewCommand";
import { postToExtension } from "../vscodeApi";

/**
 * Tell the extension when a field inside this page holds the keyboard.
 *
 * The diagram's shortcuts are bare letters bound on the workbench, and a
 * webview forwards every keystroke to it without saying what the keystroke
 * landed in. Without this, typing a table name into the diagram's own search
 * box would toggle colours, short names and half the view along the way — the
 * page's `isTypingTarget` guard cannot help, because inside VS Code the page
 * is not the one dispatching.
 *
 * `focusout` is read on the next task rather than at the event, because focus
 * has not moved yet when it fires: at that moment `activeElement` is still the
 * field being left, or the body between two fields.
 */
export const useReportTypingFocus = (): void => {
  useEffect(() => {
    let reported = false;

    const report = (): void => {
      const typing = isTypingTarget(document.activeElement);
      if (typing === reported) {
        return;
      }

      reported = typing;
      postToExtension(setTypingFocusMessage(typing));
    };

    const reportLater = (): void => {
      setTimeout(report, 0);
    };

    window.addEventListener("focusin", report);
    window.addEventListener("focusout", reportLater);

    return () => {
      window.removeEventListener("focusin", report);
      window.removeEventListener("focusout", reportLater);

      // Unmounting with a field focused would leave the key true and every
      // shortcut dead for the rest of the session.
      if (reported) {
        postToExtension(setTypingFocusMessage(false));
      }
    };
  }, []);
};
