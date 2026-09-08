import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { type JSONTableSchema } from "shared/types/tableSchema";
import { tableCoordsStore } from "json-table-schema-visualizer/src/stores/tableCoords";
import { switchDocument } from "json-table-schema-visualizer/src/stores/switchDocument";

import {
  WebviewCommand,
  type SetSchemaCommandPayload,
  type WebviewPostMessage,
} from "../../extension/types/webviewCommand";
import { postToExtension } from "../vscodeApi";

const readBootstrapSchema = (): {
  schema: JSONTableSchema | null;
  key: string | null;
  schemaErrorMessage: string | null;
  rawContent: string | null;
  editable: boolean;
} => {
  const schemaMessage = window.__SCHEMA_BOOTSTRAP__;
  const errorMessage = window.__SCHEMA_ERROR_BOOTSTRAP__;

  if (
    errorMessage?.type === "setSchemaErrorMessage" &&
    typeof errorMessage.message === "string"
  ) {
    return {
      schema: null,
      key: typeof errorMessage.key === "string" ? errorMessage.key : null,
      schemaErrorMessage: errorMessage.message,
      rawContent: null,
      editable: false,
    };
  }

  if (
    schemaMessage?.type === "setSchema" &&
    schemaMessage.payload != null &&
    typeof schemaMessage.payload === "object"
  ) {
    return {
      schema: schemaMessage.payload,
      key: typeof schemaMessage.key === "string" ? schemaMessage.key : null,
      schemaErrorMessage: null,
      rawContent:
        typeof schemaMessage.rawContent === "string"
          ? schemaMessage.rawContent
          : null,
      editable: schemaMessage.editable === true,
    };
  }

  return {
    schema: null,
    key: null,
    schemaErrorMessage: null,
    rawContent: null,
    editable: false,
  };
};

const applySchemaMessage = (
  message: SetSchemaCommandPayload,
  schemaKeyRef: MutableRefObject<string | null>,
  setters: {
    setSchema: (schema: JSONTableSchema | null) => void;
    setSchemaKey: (key: string | null) => void;
    setSchemaErrorMessage: (message: string | null) => void;
    setRawContent: (content: string | null) => void;
    setEditable: (editable: boolean) => void;
  },
): void => {
  if (
    message.type === "setSchemaErrorMessage" &&
    typeof message.message === "string"
  ) {
    setters.setSchemaErrorMessage(message.message);
    setters.setSchema(null);
    return;
  }

  if (!(message.type === "setSchema" && message.payload != null)) {
    return;
  }

  const currentKey = schemaKeyRef.current;
  if (message.key !== currentKey) {
    switchDocument(message.key, message.payload.tables, message.payload.refs);
    schemaKeyRef.current = message.key;
    setters.setSchemaKey(message.key);
  }

  setters.setSchema(message.payload);
  setters.setSchemaErrorMessage(null);
  setters.setEditable(message.editable === true);
  if (typeof message.rawContent === "string") {
    setters.setRawContent(message.rawContent);
  }
};

export const useSchema = (): {
  schema: JSONTableSchema | null;
  key: string | null;
  schemaErrorMessage: string | null;
  rawContent: string | null;
  editable: boolean;
} => {
  const bootstrap = readBootstrapSchema();
  const [schemaErrorMessage, setSchemaErrorMessage] = useState<string | null>(
    bootstrap.schemaErrorMessage,
  );
  const [schema, setSchema] = useState<JSONTableSchema | null>(
    bootstrap.schema,
  );
  const [schemaKey, setSchemaKey] = useState<string | null>(bootstrap.key);
  const [rawContent, setRawContent] = useState<string | null>(
    bootstrap.rawContent,
  );
  const [editable, setEditable] = useState<boolean>(bootstrap.editable);
  const schemaKeyRef = useRef<string | null>(bootstrap.key);

  useLayoutEffect(() => {
    if (bootstrap.schema != null && bootstrap.key != null) {
      switchDocument(
        bootstrap.key,
        bootstrap.schema.tables,
        bootstrap.schema.refs,
      );
    }
  }, []);

  useEffect(() => {
    schemaKeyRef.current = schemaKey;
  }, [schemaKey]);

  useEffect(() => {
    const updater = (e: MessageEvent): void => {
      applySchemaMessage(e.data as SetSchemaCommandPayload, schemaKeyRef, {
        setSchema,
        setSchemaKey,
        setSchemaErrorMessage,
        setRawContent,
        setEditable,
      });
    };

    window.addEventListener("message", updater);

    const readyMessage: WebviewPostMessage = {
      command: WebviewCommand.WEBVIEW_READY,
    };
    postToExtension(readyMessage);

    return () => {
      window.removeEventListener("message", updater);
      tableCoordsStore.saveCurrentStore();
    };
  }, []);

  return { schema, key: schemaKey, schemaErrorMessage, rawContent, editable };
};
