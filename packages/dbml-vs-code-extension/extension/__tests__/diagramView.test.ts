import { commands, FilePermission, workspace } from "vscode";
import {
  DiagramView,
  type DiagramViewDeps,
} from "extension-shared/extension/views/diagramView";
import { diagramInputFocusKey } from "extension-shared/extension/views/diagramInputFocus";
import { DiagnosticError } from "shared/types/diagnostic";
import { DIAGRAM_UPDATER_DEBOUNCE_TIME } from "extension-shared/extension/constants";
import { upsertMetaInfoInDbml } from "dbml-to-json-table-schema";
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
    onDidChangeViewState: jest.fn((handler: () => void) => {
      listeners.viewState = handler;
      return { dispose: jest.fn() };
    }),
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

const makeDocument = (
  uri: string,
  text: string,
  over: { isUntitled?: boolean; isClosed?: boolean; languageId?: string } = {},
) => ({
  uri: { toString: () => uri },
  getText: () => text,
  isUntitled: over.isUntitled ?? false,
  isClosed: over.isClosed ?? false,
  languageId: over.languageId ?? "dbml",
});

beforeAll(() => {
  // The real one is injected by the webview build; only its return value matters.
  (globalThis as Record<string, unknown>).__getWebviewHtml__ = () =>
    "<html></html>";
});

/** What the context key was set to, in order. */
const setContextCalls = (): unknown[] =>
  (commands.executeCommand as jest.Mock).mock.calls
    .filter(([command]) => command === "setContext")
    .map(([, , value]) => value);

beforeEach(() => {
  (commands.executeCommand as jest.Mock).mockClear();
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

  test("tells the workbench when a field in the page takes the keyboard", () => {
    const panel = makePanel();
    const view = new DiagramView(
      panel as never,
      makeDocument("file:///a.dbml", "Table a {}") as never,
      makeDeps(() => emptySchema),
    );

    panel.listeners.message({ command: "SET_TYPING_FOCUS", typing: true });

    // Without this the workbench cannot tell a bare letter aimed at the
    // diagram from one typed into the diagram's own search box: a webview
    // forwards the keystroke either way and says nothing about where it landed.
    expect(commands.executeCommand).toHaveBeenCalledWith(
      "setContext",
      diagramInputFocusKey("dbmlStudio"),
      true,
    );

    view.dispose();
  });

  test("says so once, however many times the page repeats itself", () => {
    const panel = makePanel();
    const view = new DiagramView(
      panel as never,
      makeDocument("file:///a.dbml", "Table a {}") as never,
      makeDeps(() => emptySchema),
    );

    panel.listeners.message({ command: "SET_TYPING_FOCUS", typing: true });
    panel.listeners.message({ command: "SET_TYPING_FOCUS", typing: true });

    expect(setContextCalls()).toEqual([true]);

    view.dispose();
  });

  test("takes the keyboard back when the diagram stops being active", () => {
    const panel = makePanel();
    const view = new DiagramView(
      panel as never,
      makeDocument("file:///a.dbml", "Table a {}") as never,
      makeDeps(() => emptySchema),
    );
    panel.listeners.message({ command: "SET_TYPING_FOCUS", typing: true });

    panel.active = false;
    panel.listeners.viewState();

    // Focus can leave a webview without the page seeing a `focusout`, and a key
    // left true would disable every shortcut for the rest of the session.
    expect(setContextCalls()).toEqual([true, false]);

    view.dispose();
  });

  test("takes the keyboard back when the diagram closes", () => {
    const panel = makePanel();
    const view = new DiagramView(
      panel as never,
      makeDocument("file:///a.dbml", "Table a {}") as never,
      makeDeps(() => emptySchema),
    );
    panel.listeners.message({ command: "SET_TYPING_FOCUS", typing: true });

    view.dispose();

    expect(setContextCalls()).toEqual([true, false]);
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

describe("telling the diagram whether it may edit", () => {
  test("a saved dbml document is editable", () => {
    const panel = makePanel();
    const deps = makeDeps(() => emptySchema);
    const view = new DiagramView(
      panel as never,
      makeDocument("file:///a.dbml", "Table a {}") as never,
      deps,
    );
    panel.listeners.message({ command: "WEBVIEW_READY" });

    expect(panel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "setSchema", editable: true }),
    );

    view.dispose();
  });

  test("an untitled document is not editable", () => {
    const panel = makePanel();
    const deps = makeDeps(() => emptySchema);
    const view = new DiagramView(
      panel as never,
      makeDocument("untitled:a.dbml", "Table a {}", {
        isUntitled: true,
      }) as never,
      deps,
    );
    panel.listeners.message({ command: "WEBVIEW_READY" });

    expect(panel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "setSchema", editable: false }),
    );

    view.dispose();
  });
});

describe("a read-only file", () => {
  test("is reported not editable once the file system has said so", async () => {
    (workspace.fs.stat as jest.Mock).mockResolvedValueOnce({
      permissions: FilePermission.Readonly,
    });
    const panel = makePanel();
    const view = new DiagramView(
      panel as never,
      makeDocument("file:///locked.dbml", "Table a {}") as never,
      makeDeps(() => emptySchema),
    );
    panel.listeners.message({ command: "WEBVIEW_READY" });

    // The stat answers on a later tick; the refresh it triggers is what
    // carries the corrected flag.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const posted = (panel.webview.postMessage as jest.Mock).mock.calls.map(
      ([message]) => message as { type?: string; editable?: boolean },
    );
    const last = [...posted].reverse().find((m) => m.type === "setSchema");
    expect(last?.editable).toBe(false);

    view.dispose();
  });
});

/**
 * The diagram writes the reader's arrangement back into the file, and that
 * write comes back as a change like any other. Ignoring it is what stops the
 * diagram redrawing itself in a circle — but it used to be ignored by *when* it
 * arrived, and a 600ms window swallows everything else written in it.
 *
 * What the reader writes right after dragging a table is a rename, and that
 * rename reached the file and was never drawn: the diagram went on naming a
 * table the document no longer had, so the next rename asked for a table that
 * was not there and did nothing at all.
 */
describe("the diagram's own layout write-back", () => {
  const SOURCE = ["Table users {", "  id uuid [pk]", "}", ""].join("\n");
  const COORDS = [{ name: "users", x: 10, y: 20 }];
  const URI = "file:///a.dbml";

  const changeHandler = (): ((event: unknown) => void) =>
    (workspace.onDidChangeTextDocument as jest.Mock).mock.calls.at(-1)?.[0] as (
      event: unknown,
    ) => void;

  /**
   * Open a diagram and leave its write-back in flight, the way a drag does.
   *
   * `applyEdit` is left unresolved on purpose: the change events that follow
   * are exactly the ones the old window was open for.
   */
  const withWriteBackInFlight = async (): Promise<{
    panel: ReturnType<typeof makePanel>;
    view: DiagramView;
    settle: () => void;
  }> => {
    (workspace.openTextDocument as jest.Mock).mockResolvedValue({
      uri: { toString: () => URI },
      getText: () => SOURCE,
      isUntitled: false,
      isClosed: false,
      languageId: "dbml",
      positionAt: (offset: number) => offset,
    });
    let settle = (): void => undefined;
    (workspace.applyEdit as jest.Mock).mockReturnValue(
      new Promise<boolean>((resolve) => {
        settle = () => {
          resolve(true);
        };
      }),
    );

    const panel = makePanel();
    const view = new DiagramView(
      panel as never,
      makeDocument(URI, SOURCE) as never,
      makeDeps(() => emptySchema),
    );
    panel.listeners.message({ command: "WEBVIEW_READY" });

    panel.listeners.message({
      command: "UPDATE_DBML_CONTENT",
      coords: COORDS,
      documentUri: URI,
    });
    // Timers are already faked here, so the write-back's own awaits are let
    // through this way rather than by sleeping on a clock that is not running.
    await jest.advanceTimersByTimeAsync(1);
    (panel.webview.postMessage as jest.Mock).mockClear();

    return { panel, view, settle };
  };

  const posted = (panel: ReturnType<typeof makePanel>): unknown[] =>
    (panel.webview.postMessage as jest.Mock).mock.calls
      .map(([message]) => message as { type?: string })
      .filter((message) => message.type === "setSchema");

  test("redraws for a change it did not make, even while its own is in flight", async () => {
    jest.useFakeTimers();
    try {
      const { panel, view, settle } = await withWriteBackInFlight();

      changeHandler()({
        document: {
          uri: { toString: () => URI },
          getText: () => SOURCE.replace("users", "people"),
        },
      });
      await jest.advanceTimersByTimeAsync(DIAGRAM_UPDATER_DEBOUNCE_TIME + 50);

      expect(posted(panel)).toHaveLength(1);

      settle();
      view.dispose();
    } finally {
      jest.useRealTimers();
    }
  });

  test("does not redraw for the text it wrote itself", async () => {
    jest.useFakeTimers();
    try {
      const { panel, view, settle } = await withWriteBackInFlight();

      changeHandler()({
        document: {
          uri: { toString: () => URI },
          getText: () => upsertMetaInfoInDbml(SOURCE, COORDS),
        },
      });
      await jest.advanceTimersByTimeAsync(DIAGRAM_UPDATER_DEBOUNCE_TIME + 50);

      expect(posted(panel)).toHaveLength(0);

      settle();
      view.dispose();
    } finally {
      jest.useRealTimers();
    }
  });
});
