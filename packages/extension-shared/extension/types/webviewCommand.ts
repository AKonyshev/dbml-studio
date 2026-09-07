import { type JSONTableSchema } from "shared/types/tableSchema";

export enum WebviewCommand {
  SET_THEME_PREFERENCES = "SET_THEME_PREFERENCES",
  UPDATE_DBML_CONTENT = "UPDATE_DBML_CONTENT",
  SAVE_EXPORT = "SAVE_EXPORT",
  WEBVIEW_READY = "WEBVIEW_READY",
  SET_TYPING_FOCUS = "SET_TYPING_FOCUS",
}

export interface WebviewPostMessage {
  command: WebviewCommand;
  message?: string;
  content?: string;
  documentUri?: string;
  data?: string;
  filename?: string;
  mimeType?: string;
  typing?: boolean;
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

export const runDiagramActionMessage = (
  action: string,
): RunDiagramActionMessage => ({ type: RUN_DIAGRAM_ACTION, action });

/**
 * The action a window message asks the diagram to run, or null for a message
 * that asks for nothing.
 *
 * A function rather than a few lines inside the listener, because it is the one
 * part of the relay that can be tested without a browser — and because getting
 * it wrong fails silently: a guard that rejects the host would leave every
 * command in the extension doing nothing at all, with nothing to see.
 *
 * `host` is the window the extension reaches this page through. A sender we can
 * identify as anything else has no business driving the diagram. Deliberately
 * permissive where the sender cannot be identified at all: several hosts
 * deliver an extension message with no `source`, and refusing those would close
 * the only way in.
 */
export const readDiagramAction = (
  event: { data?: unknown; source?: unknown },
  host: unknown,
): string | null => {
  if (event.source != null && event.source !== host) {
    return null;
  }

  const message = event.data as Partial<RunDiagramActionMessage> | null;
  if (message?.type !== RUN_DIAGRAM_ACTION) {
    return null;
  }

  return typeof message.action === "string" ? message.action : null;
};

/**
 * Whether a field inside the webview holds the keyboard, told to the extension
 * so that the workbench can keep the diagram's bare-letter keys off it.
 *
 * The keys are bindings on the workbench now, and a webview forwards every
 * keystroke to it without saying what the keystroke landed in — so this is the
 * only thing standing between typing a table name into the diagram's search box
 * and toggling half the view along the way.
 */
export interface SetTypingFocusMessage {
  command: WebviewCommand.SET_TYPING_FOCUS;
  typing: boolean;
}

export const setTypingFocusMessage = (
  typing: boolean,
): SetTypingFocusMessage => ({
  command: WebviewCommand.SET_TYPING_FOCUS,
  typing,
});

export interface SetSchemaCommandPayload {
  type: string;
  payload: JSONTableSchema;
  message?: string;
  key: string;
  rawContent?: string;
}
