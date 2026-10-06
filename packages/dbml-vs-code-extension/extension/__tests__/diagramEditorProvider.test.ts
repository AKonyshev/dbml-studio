import { DiagramEditorProvider } from "extension-shared/extension/views/diagramEditorProvider";
import type { DiagramViewDeps } from "extension-shared/extension/views/diagramView";
import type { JSONTableSchema } from "shared/types/tableSchema";
import { window } from "vscode";

const emptySchema: JSONTableSchema = { refs: [], enums: [], tables: [] };

const makePanel = (active = false) => {
  const listeners: Record<string, (arg?: unknown) => void> = {};
  return {
    active,
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
    onDidDispose: jest.fn((handler: () => void) => {
      listeners.dispose = handler;
      return { dispose: jest.fn() };
    }),
    listeners,
  };
};

const makeDocument = (uri: string) => ({
  uri: { toString: () => uri },
  getText: () => "Table a {}",
});

const deps = (): DiagramViewDeps => ({
  context: { extensionUri: "ext" } as never,
  diagnostics: {
    set: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    dispose: jest.fn(),
  } as never,
  extensionConfigSession: "dbmlStudio",
  parser: () => emptySchema,
  fileExt: "dbml",
  supportsDbmlFileSync: true,
});

describe("DiagramEditorProvider", () => {
  test("registers with retained context and one editor per document", () => {
    DiagramEditorProvider.register("dbml-studio-diagram", deps());

    expect(window.registerCustomEditorProvider).toHaveBeenCalledWith(
      "dbml-studio-diagram",
      expect.any(DiagramEditorProvider),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    );
  });

  test("forgets a view once its panel is gone", () => {
    const provider = new DiagramEditorProvider(deps());
    const panel = makePanel(true);

    provider.resolveCustomTextEditor(
      makeDocument("file:///a.dbml") as never,
      panel as never,
    );
    panel.listeners.dispose?.();

    expect(provider.getActiveView()).toBeUndefined();
  });
});
