import {
  FilePermission,
  Diagnostic,
  type DiagnosticCollection,
  DiagnosticSeverity,
  type Disposable,
  type ExtensionContext,
  Position,
  Range,
  type TextDocument,
  Uri,
  type ViewColumn,
  type WebviewPanel,
  window,
  workspace,
} from "vscode";
import { type JSONTableSchema } from "shared/types/tableSchema";
import { DiagnosticError } from "shared/types/diagnostic";

import { DIAGRAM_UPDATER_DEBOUNCE_TIME } from "../constants";
import { runDiagramActionMessage } from "../types/webviewCommand";
import { ExtensionConfig } from "../helper/extensionConfigs";

import { WebviewHelper } from "./helper";
import { DiagramInputFocus } from "./diagramInputFocus";

/** What a host extension declares about itself, once, in `activate`. */
export interface DiagramHostConfig {
  extensionConfigSession: string;
  parser: (code: string) => JSONTableSchema;
  fileExt: string;
  /** Where an edit says what it asked for and what came of it. */
  log?: (line: string) => void;
  supportsDbmlFileSync?: boolean;
}

export interface DiagramViewDeps extends DiagramHostConfig {
  context: ExtensionContext;
  diagnostics: DiagnosticCollection;
}

/**
 * One diagram, bound to one document and to the panel VS Code handed us.
 *
 * The panel is a constructor argument rather than something built here, because
 * a custom editor never creates its own: that is also what makes this class
 * testable without VS Code.
 */
export class DiagramView implements Disposable {
  public readonly documentUri: string;
  public readonly uri: Uri;
  private readonly disposables: Disposable[] = [];
  private ready = false;
  private outbound: unknown[] = [];
  private updateTimeout: NodeJS.Timeout | null = null;
  /** The document our own layout write-back is producing, while it is in flight. */
  private ownLayoutText: string | null = null;
  private readonly inputFocus: DiagramInputFocus;

  constructor(
    private readonly panel: WebviewPanel,
    private readonly document: TextDocument,
    private readonly deps: DiagramViewDeps,
  ) {
    this.documentUri = document.uri.toString();
    this.uri = document.uri;
    this.inputFocus = new DiagramInputFocus(deps.extensionConfigSession);

    // Registration options carry WebviewPanelOptions only, so these two have to
    // be set on the panel itself.
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        Uri.joinPath(deps.context.extensionUri, "dist", "webview"),
      ],
    };

    // Built per view rather than once in activate: WorkspaceConfiguration reads
    // its values when asked, so a long-lived instance would hand a new tab the
    // theme that was current when the extension started.
    const extensionConfig = new ExtensionConfig(deps.extensionConfigSession);
    const supportsDbmlFileSync = deps.supportsDbmlFileSync === true;

    panel.webview.html = WebviewHelper.setupHtml(panel.webview, deps.context, {
      ...extensionConfig.getDefaultPageConfig(),
      supportsDbmlFileSync,
    });

    WebviewHelper.setupWebviewHooks(
      panel.webview,
      extensionConfig,
      this.disposables,
      {
        fileExt: deps.fileExt,
        supportsDbmlFileSync,
        onOwnLayoutWrite: (text) => {
          this.ownLayoutText = text;
        },
        onWebviewReady: () => {
          this.markReady();
        },
        onTypingFocusChanged: (typing) => {
          this.inputFocus.set(typing);
        },
        postToWebview: (message) => {
          void panel.webview.postMessage(message);
        },
        log: (line) => {
          deps.log?.(line);
        },
      },
    );

    panel.onDidChangeViewState(
      () => {
        if (panel.visible) {
          this.refresh();
        }
        // A diagram that no longer holds focus holds no field either, and the
        // page cannot always say so: focus can leave it without a `focusout`
        // the page sees. A key left true disables the shortcuts for good.
        if (!panel.active) {
          this.inputFocus.clear();
        }
      },
      null,
      this.disposables,
    );

    workspace.onDidChangeTextDocument(
      (event) => {
        if (event.document.uri.toString() !== this.documentUri) return;
        // The diagram's own MetaInfo write-back would otherwise loop. It is
        // recognised by the text it produced, not by a window of time: a window
        // swallows whatever else is written while it is open, and what a reader
        // writes right after dragging a table is a rename. That rename reached
        // the file and was never drawn, which left the diagram naming a table
        // the document no longer had.
        if (
          this.ownLayoutText !== null &&
          event.document.getText() === this.ownLayoutText
        ) {
          this.ownLayoutText = null;

          return;
        }
        this.scheduleRefresh();
      },
      null,
      this.disposables,
    );

    this.refresh();
  }

  public get isActive(): boolean {
    return this.panel.active;
  }

  public get viewColumn(): ViewColumn | undefined {
    return this.panel.viewColumn;
  }

  public post(message: unknown): void {
    if (!this.ready) {
      this.outbound.push(message);
      return;
    }

    void this.panel.webview.postMessage(message);
  }

  /**
   * Run one of the diagram's actions, on behalf of a command the reader invoked.
   *
   * Dropped rather than queued when the webview is not up yet: unlike the
   * schema, a keypress is worth nothing once it is late, and replaying it
   * minutes later would toggle something the reader has since left alone.
   */
  public runAction(action: string): void {
    if (!this.ready) {
      return;
    }

    void this.panel.webview.postMessage(runDiagramActionMessage(action));
  }

  /**
   * Whether an edit made in the diagram could actually land in this document.
   *
   * Refusing here, before the reader reaches for a column, is kinder than
   * refusing after they have typed a line: an untitled or closed document takes
   * no workspace edit, and the diagram simply offers no editing on one.
   */
  private isEditable(): boolean {
    return (
      !this.document.isUntitled &&
      !this.document.isClosed &&
      !this.readOnly &&
      this.document.languageId === this.deps.fileExt
    );
  }

  /**
   * Whether the file system will refuse a write. A refusal before the reader
   * reaches for a column is kinder than one after they have typed a line, and
   * only `stat` can say so — the document itself does not know.
   *
   * Asked again on every refresh, and answered both ways: a file locked or
   * unlocked while the diagram is open was otherwise judged by how it stood
   * when the view was made, for as long as the view lived.
   */
  private readOnly = false;

  private async learnReadOnly(): Promise<void> {
    try {
      const stat = await workspace.fs.stat(this.uri);
      const readonly =
        ((stat.permissions ?? 0) & FilePermission.Readonly) !== 0;
      if (readonly === this.readOnly) return;

      // The refresh this causes asks again and finds nothing changed, so the
      // two of them do not chase each other.
      this.readOnly = readonly;
      this.refresh();
    } catch {
      // A scheme with no stat — leave it as it stands and let the write decide.
    }
  }

  public refresh(): void {
    void this.learnReadOnly();

    const code = this.document.getText();

    try {
      const payload = this.deps.parser(code);

      this.post({
        type: "setSchema",
        payload,
        key: this.documentUri,
        rawContent: code,
        editable: this.isEditable(),
      });
      // Addressed, not `clear()`: another open diagram's errors are not ours.
      this.deps.diagnostics.delete(this.document.uri);
    } catch (error) {
      this.reportParseFailure(error);
    }
  }

  private scheduleRefresh(): void {
    if (this.updateTimeout !== null) {
      clearTimeout(this.updateTimeout);
    }

    this.updateTimeout = setTimeout(() => {
      this.updateTimeout = null;
      this.refresh();
    }, DIAGRAM_UPDATER_DEBOUNCE_TIME);
  }

  private markReady(): void {
    this.ready = true;

    for (const message of this.outbound) {
      void this.panel.webview.postMessage(message);
    }
    this.outbound = [];
  }

  private reportParseFailure(error: unknown): void {
    if (!(error instanceof DiagnosticError)) {
      void window.showErrorMessage(String(error));
      return;
    }

    const { start, end } = error.location;

    this.post({
      type: "setSchemaErrorMessage",
      message: `${error.message}\n Line : ${start.line}:${start.column}`,
      key: this.documentUri,
    });

    this.deps.diagnostics.set(this.document.uri, [
      new Diagnostic(
        new Range(
          new Position(start.line, start.column),
          new Position(end.line, end.column),
        ),
        error.message,
        DiagnosticSeverity.Error,
      ),
    ]);
  }

  /** Drops our own subscriptions. The panel belongs to VS Code — leave it be. */
  public dispose(): void {
    this.inputFocus.clear();

    if (this.updateTimeout !== null) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = null;
    }
    this.outbound = [];
    this.ready = false;

    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }
}
