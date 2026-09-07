import { defineConfig } from "@vscode/test-cli";

// Integration tests: these run inside a real VS Code, against the built
// `dist/extension`, so `yarn build` has to come first. `tsconfig.tests.json`
// keeps rootDir at the package root, which is why the output sits under
// `out/extension/test`.
//
// Runs on current stable rather than the `^1.87.0` engine floor: an Electron
// from early 2024 segfaults on macOS 26, so the oldest supported version cannot
// actually be exercised on this host. Nothing here uses API newer than 1.87 —
// `window.tabGroups` landed in 1.68.
export default defineConfig({
  files: "out/extension/test/**/*.test.js",
  // Mocha's 2s default is shorter than a webview takes to boot and answer, and
  // the failure it produces looks like a broken feature rather than a harness
  // that gave up.
  mocha: { timeout: 60000 },
  // Short, and outside the repo, because VS Code puts its IPC socket in here and
  // a unix socket path cannot exceed 104 bytes on macOS — the default
  // `.vscode-test/user-data` under this package is already over that.
  launchArgs: ["--user-data-dir", "/tmp/dbml-vscode-test"],
});
