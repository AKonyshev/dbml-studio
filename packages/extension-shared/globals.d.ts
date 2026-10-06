// Relative, not the `@/` alias: this package defines no `paths` mapping, so the
// alias silently resolved to `any` and degraded every global declared below.
import { type ExtensionContext, type Webview } from "vscode";

import { type DefaultPageConfig } from "./extension/types/defaultPageConfig";
import { type SetSchemaCommandPayload } from "./extension/types/webviewCommand";

export interface WebviewApi<StateType = unknown> {
  postMessage: (message: unknown) => void;
  getState: () => StateType | undefined;
  setState: <T extends StateType | undefined>(newState: T) => T;
}

// This file has top-level imports, so it is a module: anything declared outside
// `declare global` is scoped to the module and is NOT ambient. `acquireVsCodeApi`
// used to sit outside and so was never actually visible to consumers.
declare global {
  interface Window {
    EXTENSION_DEFAULT_CONFIG?: DefaultPageConfig;
    vsCodeWebviewAPI?: WebviewApi;
    __SCHEMA_BOOTSTRAP__?: SetSchemaCommandPayload | null;
    __SCHEMA_ERROR_BOOTSTRAP__?: SetSchemaCommandPayload | null;
  }

  function acquireVsCodeApi<StateType = unknown>(): WebviewApi<StateType>;

  // Injected at build time by @tomjs/vscode-extension-webview: the dev-server
  // form takes a URL, the packaged form resolves the bundled assets. The
  // dunder name is fixed by that tool, so it cannot satisfy naming-convention.
  /* eslint-disable @typescript-eslint/naming-convention -- the plugin's dunder name, see above */
  function __getWebviewHtml__(url: string): string;
  function __getWebviewHtml__(
    webview: Webview,
    context: ExtensionContext,
  ): string;
  /* eslint-enable @typescript-eslint/naming-convention -- back to the rule for anything added below */
}
