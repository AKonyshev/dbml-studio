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
  launchArgs: [
    "--user-data-dir",
    "/tmp/dbml-vscode-test",
    // `hostRelay.test.ts` attaches here to read what the page did with a
    // command; the number is repeated as `DEBUG_PORT` in `extension/test/
    // helpers.ts`, because a launch config cannot import from the build output.
    // It is fixed, so two runs at once cannot both have it.
    //
    // Site isolation is off because the diagram's frame is otherwise in a
    // process of its own, which the debugging port does not enumerate — the
    // test then finds no frame to look at rather than a wrong answer. The cost
    // is that the suite runs a process model no reader has: it does not change
    // how a message is delivered or what `event.source` is, but a fault that
    // depends on the split would not show up here.
    "--remote-debugging-port=9333",
    "--disable-site-isolation-trials",
  ],
});
