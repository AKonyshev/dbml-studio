/* eslint-disable @typescript-eslint/prefer-ts-expect-error */
/* eslint-disable @typescript-eslint/no-extraneous-class */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/ban-ts-comment */

import {
  type Disposable,
  type ExtensionContext,
  type Webview,
  Range,
  Uri,
  window,
  workspace,
  WorkspaceEdit,
} from "vscode";
import { type Theme } from "json-table-schema-visualizer/src/types/theme";

import {
  WebviewCommand,
  type WebviewPostMessage,
} from "../types/webviewCommand";
import { type DefaultPageConfig } from "../types/defaultPageConfig";
import { type ExtensionConfig } from "../helper/extensionConfigs";
import {
  WEBVIEW_HTML_MARKER_FOR_BOOTSTRAP,
  WEBVIEW_HTML_MARKER_FOR_DEFAULT_CONFIG,
} from "../constants";

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
  onApplyingDbmlEdit?: (applying: boolean) => void;
  onWebviewReady?: () => void;
  onTypingFocusChanged?: (typing: boolean) => void;
}

export class WebviewHelper {
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
          typeof message.content === "string" &&
          typeof message.documentUri === "string"
        ) {
          await WebviewHelper.applyDbmlContent(
            message.content,
            message.documentUri,
            options,
          );
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
      default:
        break;
    }
  }

  private static async applyDbmlContent(
    content: string,
    documentUri: string,
    options: WebviewHooksOptions,
  ): Promise<void> {
    const doc = await workspace.openTextDocument(Uri.parse(documentUri));
    if (doc.languageId !== options.fileExt) return;
    if (doc.isUntitled || doc.isClosed) return;

    const edit = new WorkspaceEdit();
    const fullRange = new Range(
      doc.positionAt(0),
      doc.positionAt(doc.getText().length),
    );
    edit.replace(doc.uri, fullRange, content);

    options.onApplyingDbmlEdit?.(true);
    await workspace.applyEdit(edit);
    setTimeout(() => {
      options.onApplyingDbmlEdit?.(false);
    }, 600);
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
