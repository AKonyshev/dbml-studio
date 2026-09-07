import { type JSONTableSchema } from "shared/types/tableSchema";

export enum WebviewCommand {
  SET_THEME_PREFERENCES = "SET_THEME_PREFERENCES",
  UPDATE_DBML_CONTENT = "UPDATE_DBML_CONTENT",
  SAVE_EXPORT = "SAVE_EXPORT",
  WEBVIEW_READY = "WEBVIEW_READY",
}

export interface WebviewPostMessage {
  command: WebviewCommand;
  message?: string;
  content?: string;
  documentUri?: string;
  data?: string;
  filename?: string;
  mimeType?: string;
}

/**
 * The extension asking the diagram to run one of its own actions.
 *
 * Inside VS Code the workbench owns the chords — that is what makes them
 * rebindable — so the webview keeps no keyboard of its own and every action
 * arrives this way, whether the reader used a key or the command palette.
 */
export const RUN_DIAGRAM_ACTION = "runDiagramAction";

export interface RunDiagramActionMessage {
  type: typeof RUN_DIAGRAM_ACTION;
  action: string;
}

export interface SetSchemaCommandPayload {
  type: string;
  payload: JSONTableSchema;
  message?: string;
  key: string;
  rawContent?: string;
}
