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
 * it wrong fails silently: a message the page drops leaves every command in the
 * extension doing nothing at all, with nothing to see.
 *
 * The sender is deliberately not checked, and that is the whole history of this
 * function. It used to demand that `event.source` be the window the extension
 * was assumed to post through — `window.parent` — and inside VS Code that is
 * never true. Measured in a running webview, the sender is the shell frame
 * between the page and the workbench: not `parent`, not `top`, not the page
 * itself, and the page holds no reference to it by which it could be named. So
 * the guard rejected every command a reader ran, in silence, and the keys
 * looked broken while the palette looked broken too.
 *
 * What limits this is below: the message must carry this exact type, and the
 * action must be one the diagram declares — `runDiagramAction` refuses anything
 * else. That is a real bound but not a small one: `autoArrange` moves the
 * tables, and moved tables reach the `.dbml` through `useDbmlMetaInfoSync`. It
 * is enough because of who can post here at all — only code already running in
 * the webview's own origin, which by then holds `acquireVsCodeApi` and can send
 * `UPDATE_DBML_CONTENT` itself, with no help from this door.
 *
 * `source` is not in the parameter type, so that the signature says what the
 * body does rather than leaving a field a reader has to check is unused.
 */
export const readDiagramAction = (event: { data?: unknown }): string | null => {
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
