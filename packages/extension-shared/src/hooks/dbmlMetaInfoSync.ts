import { useEffect, useRef } from "react";
import { tableCoordsStore } from "json-table-schema-visualizer/src/stores/tableCoords";
import eventEmitter from "json-table-schema-visualizer/src/events-emitter";

import {
  WebviewCommand,
  type WebviewPostMessage,
} from "../../extension/types/webviewCommand";
import { postToExtension } from "../vscodeApi";

const DEBOUNCE_MS = 400;

export const useDbmlMetaInfoSync = (
  enabled: boolean,
  rawContent: string | null,
  documentKey: string | null,
): void => {
  const rawContentRef = useRef(rawContent);
  const documentKeyRef = useRef(documentKey);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  rawContentRef.current = rawContent;
  documentKeyRef.current = documentKey;

  useEffect(() => {
    if (!enabled) return;

    const syncMetaInfo = (): void => {
      const uri = documentKeyRef.current;
      if (uri == null) return;

      // Whatever the reader has arranged, at whichever detail level: the
      // entries carry the level with them, so the file can be read back safely.
      // Nothing to write only when there is no diagram yet — an empty list
      // would replace the file's layout block with an empty one.
      const coords = tableCoordsStore.getCoordEntriesForMetaInfo();
      if (coords.length === 0) return;

      // The arrangement only. Merging it into the document is the extension's
      // job, because the extension has the document: this page's copy of the
      // text is stale the moment anything else edits it, and sending a whole
      // file built from that copy put the old text back — which is how a rename
      // made from the diagram used to undo itself half a second later.
      const message: WebviewPostMessage = {
        command: WebviewCommand.UPDATE_DBML_CONTENT,
        coords,
        documentUri: uri,
      };

      postToExtension(message);
    };

    const scheduleSync = (): void => {
      if (timeoutRef.current != null) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(syncMetaInfo, DEBOUNCE_MS);
    };

    eventEmitter.on("table:coords:updated", scheduleSync);

    return () => {
      eventEmitter.off("table:coords:updated", scheduleSync);
      if (timeoutRef.current != null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled]);
};
