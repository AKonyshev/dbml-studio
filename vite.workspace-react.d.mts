// Types for `vite.workspace-react.mjs`, which stays plain JavaScript so that both
// vite configs — one `.ts`, one `.js` — can import it without either build having
// to resolve a TypeScript file at config-load time.

export declare const workspaceReactResolve: {
  dedupe: string[];
  alias: Record<string, string>;
};
