/* eslint-disable @typescript-eslint/prefer-ts-expect-error */
/* eslint-disable @typescript-eslint/no-extraneous-class */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/ban-ts-comment */

import {
  type Disposable,
  type ExtensionContext,
  type TextDocument,
  type Webview,
  Range,
  Uri,
  window,
  workspace,
  WorkspaceEdit,
} from "vscode";
import { type Theme } from "json-table-schema-visualizer/src/types/theme";
import {
  upsertMetaInfoInDbml,
  type TableCoordEntry,
} from "dbml-to-json-table-schema";

import {
  diagramEditResultMessage,
  WebviewCommand,
  type ApplyDiagramEditMessage,
  type WebviewPostMessage,
} from "../types/webviewCommand";
import { type DefaultPageConfig } from "../types/defaultPageConfig";
import { type ExtensionConfig } from "../helper/extensionConfigs";
import {
  WEBVIEW_HTML_MARKER_FOR_BOOTSTRAP,
  WEBVIEW_HTML_MARKER_FOR_DEFAULT_CONFIG,
} from "../constants";

import { DocumentWriteQueue } from "./editQueue";
import { applyDiagramEdit } from "./applyDiagramEdit";

const WEBVIEW_BOOTSTRAP_SCRIPT = `
(function () {
  window.__SCHEMA_BOOTSTRAP__ = null;
  window.__SCHEMA_ERROR_BOOTSTRAP__ = null;
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || typeof data !== "object" || typeof data.type !== "string") {
      return;
    }
    if (data.type === "setSchema") {
      window.__SCHEMA_BOOTSTRAP__ = data;
    }
    if (data.type === "setSchemaErrorMessage") {
      window.__SCHEMA_ERROR_BOOTSTRAP__ = data;
    }
  });
})();
`;

export interface WebviewHooksOptions {
  fileExt: string;
  supportsDbmlFileSync: boolean;
  /**
   * The exact text the diagram's own layout write-back is about to produce,
   * and `null` once that write has settled.
   *
   * Announced rather than flagged, because the view has to tell the change
   * event this write causes apart from a change the reader made — and the two
   * arrive the same way, milliseconds apart.
   */
  onOwnLayoutWrite?: (text: string | null) => void;
  onWebviewReady?: () => void;
  onTypingFocusChanged?: (typing: boolean) => void;
  postToWebview?: (message: unknown) => void;
  /**
   * Somewhere to say what an edit asked for and what came of it.
   *
   * Editing lives in three places — the page decides what to aim at, this
   * merges it into the document, and the diagram redraws — and when a reader
   * says "it does nothing", none of the three can be told apart from outside.
   * This is the one place all of it passes through.
   */
  log?: (line: string) => void;
}

export class WebviewHelper {
  /**
   * Shared by both write paths on purpose. A field edit replaces a few ranges
   * and the position sync replaces the whole file; running at the same time,
   * the second undoes the first.
   */
  private static readonly writeQueue = new DocumentWriteQueue();

  public static setupHtml(
    webview: Webview,
    context: ExtensionContext,
    defaultConfig: DefaultPageConfig,
  ): string {
    const html: string = process.env.VITE_DEV_SERVER_URL
      ? __getWebviewHtml__(process.env.VITE_DEV_SERVER_URL)
      : __getWebviewHtml__(webview, context);

    return WebviewHelper.injectScripts(html, defaultConfig);
  }

  public static injectScripts(
    html: string,
    configs: DefaultPageConfig,
  ): string {
    return html
      .replace(WEBVIEW_HTML_MARKER_FOR_BOOTSTRAP, WEBVIEW_BOOTSTRAP_SCRIPT)
      .replace(
        WEBVIEW_HTML_MARKER_FOR_DEFAULT_CONFIG,
        `window.EXTENSION_DEFAULT_CONFIG = ${JSON.stringify(configs)};`,
      );
  }

  public static injectDefaultConfig(
    html: string,
    configs: DefaultPageConfig,
  ): string {
    return WebviewHelper.injectScripts(html, configs);
  }

  public static async handleWebviewMessage(
    message: WebviewPostMessage,
    extensionConfig: ExtensionConfig,
    options: WebviewHooksOptions,
  ): Promise<void> {
    switch (message.command) {
      case WebviewCommand.SET_THEME_PREFERENCES:
        if (typeof message.message === "string") {
          await extensionConfig.setTheme(message.message as Theme);
        }
        break;
      case WebviewCommand.UPDATE_DBML_CONTENT:
        if (
          options.supportsDbmlFileSync &&
          Array.isArray(message.coords) &&
          typeof message.documentUri === "string"
        ) {
          const coords = message.coords;
          const documentUri = message.documentUri;
          await WebviewHelper.writeQueue.run(documentUri, async () => {
            await WebviewHelper.applyTablePositions(
              coords,
              documentUri,
              options,
            );
          });
        }
        break;
      case WebviewCommand.SAVE_EXPORT:
        if (
          typeof message.data === "string" &&
          typeof message.filename === "string"
        ) {
          await WebviewHelper.saveExportFile(message);
        }
        break;
      case WebviewCommand.WEBVIEW_READY:
        options.onWebviewReady?.();
        break;
      case WebviewCommand.SET_TYPING_FOCUS:
        if (typeof message.typing === "boolean") {
          options.onTypingFocusChanged?.(message.typing);
        }
        break;
      case WebviewCommand.SHOW_MESSAGE:
        if (typeof message.message === "string" && message.message !== "") {
          void window.showInformationMessage(message.message);
        }
        break;
      case WebviewCommand.APPLY_DIAGRAM_EDIT:
        await WebviewHelper.handleDiagramEdit(
          message as unknown as ApplyDiagramEditMessage,
          options,
        );
        break;
      default:
        break;
    }
  }

  private static async handleDiagramEdit(
    request: ApplyDiagramEditMessage,
    options: WebviewHooksOptions,
  ): Promise<void> {
    // Every path below answers. A request that goes unanswered leaves the
    // popup's promise pending for the life of the page, and the reader holding
    // a box that never responds to Enter again.
    if (!options.supportsDbmlFileSync) {
      options.postToWebview?.(
        diagramEditResultMessage(request.requestId, {
          ok: false,
          reason: { code: "notEditable" },
        }),
      );

      return;
    }

    options.log?.(
      `edit requested: ${JSON.stringify(request.operation)}` +
        (request.expectedText === undefined
          ? ""
          : ` (expecting ${JSON.stringify(request.expectedText)})`),
    );

    const outcome = await WebviewHelper.writeQueue.run(
      request.documentUri,
      async () =>
        await applyDiagramEdit(request, {
          openDocument: async (uri) => {
            const doc = await workspace.openTextDocument(Uri.parse(uri));

            return doc.languageId === options.fileExt ? doc : null;
          },
          applyEdit: async (document, edits) => {
            const doc = document as unknown as TextDocument;
            const edit = new WorkspaceEdit();
            for (const change of edits) {
              edit.replace(
                doc.uri,
                new Range(
                  doc.positionAt(change.start),
                  doc.positionAt(change.end),
                ),
                change.text,
              );
            }

            // Deliberately without `onOwnLayoutWrite`, which the position
            // sync raises to stop the diagram redrawing from its own
            // write-back. A field edit is the opposite case: the schema has
            // changed and only the document knows how, so the diagram has to
            // hear about it — raising the flag here left the new name invisible
            // until the reader saved the file.
            return await workspace.applyEdit(edit);
          },
        }),
    );

    options.log?.(
      outcome.ok
        ? `edit applied: ${outcome.table}${outcome.at === undefined ? "" : ` column ${outcome.at}`}`
        : `edit refused: ${JSON.stringify(outcome.reason)}`,
    );

    options.postToWebview?.(
      diagramEditResultMessage(request.requestId, outcome),
    );
  }

  /**
   * Merge the reader's arrangement into the document as it is now.
   *
   * The page sends the arrangement and this reads the text, rather than the
   * page sending a whole file it built from its own copy. That copy goes stale
   * the moment anything else edits the document — and it did: a rename made
   * from the diagram was undone a few hundred milliseconds later by this write
   * putting the pre-rename text back.
   */
  private static async applyTablePositions(
    coords: TableCoordEntry[],
    documentUri: string,
    options: WebviewHooksOptions,
  ): Promise<void> {
    const doc = await workspace.openTextDocument(Uri.parse(documentUri));
    if (doc.languageId !== options.fileExt) return;
    if (doc.isUntitled || doc.isClosed) return;

    const current = doc.getText();
    const updated = upsertMetaInfoInDbml(current, coords);
    if (updated === current) return;

    const edit = new WorkspaceEdit();
    const fullRange = new Range(
      doc.positionAt(0),
      doc.positionAt(current.length),
    );
    edit.replace(doc.uri, fullRange, updated);

    // Said before the write and taken back after it. The change event this
    // causes reaches the view while `applyEdit` is still in flight, so by the
    // time it resolves the view has either recognised the text as ours or the
    // write never landed — and either way nothing is left standing that could
    // swallow the next change.
    options.onOwnLayoutWrite?.(updated);
    await workspace.applyEdit(edit);
    options.onOwnLayoutWrite?.(null);
  }

  private static async saveExportFile(
    message: WebviewPostMessage,
  ): Promise<void> {
    const uri = await window.showSaveDialog({
      defaultUri: Uri.file(message.filename ?? "export"),
      saveLabel: "Save",
    });
    if (uri == null) return;

    const isBase64 = message.mimeType?.includes("image") ?? false;
    const data = isBase64
      ? Buffer.from(message.data ?? "", "base64")
      : Buffer.from(message.data ?? "", "utf-8");

    await workspace.fs.writeFile(uri, data);
  }

  public static setupWebviewHooks(
    webview: Webview,
    extensionConfig: ExtensionConfig,
    disposables: Disposable[],
    options: WebviewHooksOptions,
  ): void {
    webview.onDidReceiveMessage(
      (message: WebviewPostMessage) => {
        void WebviewHelper.handleWebviewMessage(
          message,
          extensionConfig,
          options,
        );
      },
      undefined,
      disposables,
    );
  }
}
