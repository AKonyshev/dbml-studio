/// <reference types="@tomjs/vite-plugin-vscode/types" />
// `virtual:vscode`, which the extension build provides (`getWebviewHtml`).
// Relative, not the `@/` alias: this package defines no `paths` mapping, so the
// alias silently resolved to `any` and degraded every global declared below.
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
}
