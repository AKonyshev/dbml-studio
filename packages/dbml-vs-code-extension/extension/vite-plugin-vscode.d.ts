// `virtual:vscode`, which the connection form's panel imports, exists only
// inside the extension build, and the build's types are declared here for the
// programs that do not reach `extension-shared/globals.d.ts`: the integration
// tests are compiled from this directory alone (`tsconfig.tests.json`).
/// <reference types="@tomjs/vite-plugin-vscode/types" />
