import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

import { workspaceReactResolve } from "../../vite.workspace-react.js";

// Note there is no equivalent of the extension's `generateWebviewCss` hook: that
// exists only because its VS Code bundler plugin empties the output directory on
// every rebuild, wiping a separately-run stylesheet step. Nothing here does that,
// so Tailwind runs through the ordinary PostCSS pipeline.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: workspaceReactResolve,
  // Relative, because the site is copied into a subdirectory of the
  // documentation build (`/_dbml/`) as well as being served from the root of
  // its own image. Absolute `/assets/…` would resolve against the documentation
  // site's root, where there is no such directory.
  base: "./",
  build: {
    // Which chunks each document actually needs, in a file a packager can read.
    // The frame's half of this build is vendored into the MkDocs plugin, and the
    // editor's 2.9 MB is not wanted there; a hand-kept list of filenames would
    // be wrong the first time a chunk is renamed, and wrong silently — the wheel
    // builds, and the frame does not draw.
    manifest: true,
    rollupOptions: {
      // Two documents, one bundle. The frame's chunk carries no editor because
      // nothing it imports reaches `setupMonaco` — that is the mechanism, and it
      // is why the frame is not a flag on the main entry.
      input: {
        main: "index.html",
        embed: "embed.html",
      },
    },
  },
});
