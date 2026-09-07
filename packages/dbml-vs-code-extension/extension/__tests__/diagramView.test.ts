import {
  DiagramView,
  type DiagramViewDeps,
} from "extension-shared/extension/views/diagramView";
import { DiagnosticError } from "shared/types/diagnostic";
import type { JSONTableSchema } from "shared/types/tableSchema";

const emptySchema: JSONTableSchema = { refs: [], enums: [], tables: [] };

// The webview is a message sink plus a ready signal; that is all DiagramView
// needs from it, so a plain object stands in for the real panel.
const makePanel = () => {
  const listeners: Record<string, (arg?: unknown) => void> = {};
  return {
    active: false,
    visible: true,
    viewColumn: 1,
    webview: {
      options: {},
      html: "",
      postMessage: jest.fn(),
      onDidReceiveMessage: jest.fn((handler: (message: unknown) => void) => {
        listeners.message = handler;
        return { dispose: jest.fn() };
      }),
    },
    onDidChangeViewState: jest.fn(),
    onDidDispose: jest.fn(),
    dispose: jest.fn(),
    listeners,
  };
};

const makeDeps = (
  parser: (code: string) => JSONTableSchema,
): DiagramViewDeps => ({
  context: { extensionUri: "ext" } as never,
  diagnostics: {
    set: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    dispose: jest.fn(),
  } as never,
  extensionConfigSession: "dbmlStudio",
  parser,
  fileExt: "dbml",
  supportsDbmlFileSync: true,
});

const makeDocument = (uri: string, text: string) => ({
  uri: { toString: () => uri },
  getText: () => text,
});

beforeAll(() => {
  // The real one is injected by the webview build; only its return value matters.
  (globalThis as Record<string, unknown>).__getWebviewHtml__ = () =>
    "<html></html>";
});

describe("DiagramView", () => {
  test("queues the schema until the webview reports it is ready", () => {
    const panel = makePanel();
    const view = new DiagramView(
      panel as never,
      makeDocument("file:///a.dbml", "Table a {}") as never,
      makeDeps(() => emptySchema),
    );

    expect(panel.webview.postMessage).not.toHaveBeenCalled();

    panel.listeners.message({ command: "WEBVIEW_READY" });

    expect(panel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "setSchema", key: "file:///a.dbml" }),
    );

    view.dispose();
  });

  test("clears only its own diagnostics on a successful parse", () => {
    const panel = makePanel();
    const deps = makeDeps(() => emptySchema);
    const document = makeDocument("file:///a.dbml", "Table a {}");

    const view = new DiagramView(panel as never, document as never, deps);

    expect(deps.diagnostics.delete).toHaveBeenCalledWith(document.uri);
    expect(deps.diagnostics.clear).not.toHaveBeenCalled();

    view.dispose();
  });

  test("reports a parse failure as a diagnostic on its own document", () => {
    const panel = makePanel();
    const deps = makeDeps(() => {
      throw new DiagnosticError(
        { start: { line: 1, column: 2 }, end: { line: 1, column: 5 } },
        "boom",
      );
    });
    const document = makeDocument("file:///a.dbml", "nonsense");

    const view = new DiagramView(panel as never, document as never, deps);
    panel.listeners.message({ command: "WEBVIEW_READY" });

    expect(panel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "setSchemaErrorMessage" }),
    );
    expect(deps.diagnostics.set).toHaveBeenCalledWith(
      document.uri,
      expect.any(Array),
    );

    view.dispose();
  });

  test("relays an action to a webview that is up", () => {
    const panel = makePanel();
    const view = new DiagramView(
      panel as never,
      makeDocument("file:///a.dbml", "Table a {}") as never,
      makeDeps(() => emptySchema),
    );
    panel.listeners.message({ command: "WEBVIEW_READY" });

    view.runAction("toggleRefs");

    expect(panel.webview.postMessage).toHaveBeenCalledWith({
      type: "runDiagramAction",
      action: "toggleRefs",
    });

    view.dispose();
  });

  test("drops an action aimed at a webview that is not up yet", () => {
    const panel = makePanel();
    const view = new DiagramView(
      panel as never,
      makeDocument("file:///a.dbml", "Table a {}") as never,
      makeDeps(() => emptySchema),
    );

    view.runAction("toggleRefs");
    panel.listeners.message({ command: "WEBVIEW_READY" });

    // Unlike the schema, a keypress is worth nothing once it is late: replaying
    // it here would toggle something the reader has since left alone.
    expect(panel.webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "runDiagramAction" }),
    );

    view.dispose();
  });

  test("does not dispose the panel it was given", () => {
    const panel = makePanel();
    const view = new DiagramView(
      panel as never,
      makeDocument("file:///a.dbml", "Table a {}") as never,
      makeDeps(() => emptySchema),
    );

    view.dispose();

    // VS Code owns a custom editor's panel; disposing it would close the tab
    // out from under the user. The old MainPanel.dispose did exactly that.
    expect(panel.dispose).not.toHaveBeenCalled();
  });
});
