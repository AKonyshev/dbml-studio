import { useEffect, useRef } from "react";
import { readFieldText, resolveRenamedTable } from "dbml-to-json-table-schema";
import { setDiagramEditingHost } from "json-table-schema-visualizer/src/stores/diagramEditing";

import {
  readDiagramEditResult,
  WebviewCommand,
  type ApplyDiagramEditMessage,
} from "../../extension/types/webviewCommand";
import { postToExtension } from "../vscodeApi";

import type { EditOperation, EditOutcome } from "shared/types/diagramEdit";

let requestCounter = 0;

/**
 * Lends the diagram the ability to change the document behind it.
 *
 * The diagram itself knows nothing about DBML or about VS Code; this is the one
 * place where the two meet. `rawContent` is read through a ref so that a
 * keystroke in another tab does not tear the host down and lose the reply the
 * popup is waiting for.
 */
export const useDiagramEditingHost = (
  editable: boolean,
  rawContent: string | null,
  documentKey: string | null,
): void => {
  const rawContentRef = useRef(rawContent);
  rawContentRef.current = rawContent;

  useEffect(() => {
    if (!editable || documentKey === null) {
      setDiagramEditingHost(null);

      return;
    }

    const pending = new Map<string, (outcome: EditOutcome) => void>();

    const onMessage = (event: MessageEvent): void => {
      const reply = readDiagramEditResult(event);
      if (reply === null) return;

      pending.get(reply.requestId)?.(reply.outcome);
      pending.delete(reply.requestId);
    };

    window.addEventListener("message", onMessage);

    setDiagramEditingHost({
      readFieldText: (table, field) => {
        const content = rawContentRef.current;

        return content === null ? null : readFieldText(content, table, field);
      },
      resolveRenamedTable: (table, newName) => {
        const content = rawContentRef.current;

        return content === null
          ? null
          : resolveRenamedTable(content, table, newName);
      },
      submit: async (operation: EditOperation, expectedText?: string) => {
        requestCounter += 1;
        const requestId = `edit-${requestCounter}`;
        const message: ApplyDiagramEditMessage = {
          command: WebviewCommand.APPLY_DIAGRAM_EDIT,
          documentUri: documentKey,
          requestId,
          operation,
          expectedText,
        };

        return await new Promise<EditOutcome>((resolve) => {
          pending.set(requestId, resolve);
          postToExtension(message as never);
        });
      },
    });

    return () => {
      window.removeEventListener("message", onMessage);
      setDiagramEditingHost(null);
    };
  }, [editable, documentKey]);
};
