import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import vscode from "@tomjs/vite-plugin-vscode";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

import { workspaceReactResolve } from "../../vite.workspace-react.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The webview HTML references dist/webview/assets/index.css, but Vite/tomjs
// empties the webview outDir on every build (including watch rebuilds), so a
// separately-run `generate:css` step gets wiped. Generate the Tailwind CSS in a
// `writeBundle` hook instead — it runs AFTER Vite writes the bundle, so the CSS
// survives every build/watch cycle and is always present in dev (F5) and in the
// packaged extension. Tailwind runs from the json-table-schema-visualizer
// package so it uses that package's tailwind.config.js content globs.
function generateWebviewCss() {
  const cssPackageDir = path.resolve(
    __dirname,
    "../json-table-schema-visualizer",
  );
  return {
    name: "generate-webview-css",
    writeBundle() {
      execFileSync(
        "npx",
        [
          "tailwindcss",
          "-i",
          "./src/styles/index.css",
          "-o",
          "../dbml-vs-code-extension/dist/webview/assets/index.css",
          "--minify",
        ],
        { cwd: cssPackageDir, stdio: "inherit" },
      );
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // The plugin discovers tsconfigs by walking the tree, which now includes
    // `.vscode-test/` — a full VS Code download the integration tests put here —
    // and it complains about every unparseable tsconfig inside it. Only the
    // messages are suppressed: narrowing discovery with `projects` instead
    // breaks `@/*` during the extension build, which then resolves as external.
    tsconfigPaths({ ignoreConfigErrors: true }),
    react(),
    vscode(),
    generateWebviewCss(),
  ],
  resolve: workspaceReactResolve,
});
