import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceReact = path.resolve(repoRoot, "node_modules/react");
const workspaceReactDom = path.resolve(repoRoot, "node_modules/react-dom");

// Every host that mounts the visualizer needs this, and needs it identically.
//
// Two copies of React in one Konva tree break hooks in a way that surfaces as a
// blank canvas with nothing in the console — no error, no stack, just nothing
// drawn. Both `dedupe` and the explicit aliases are load-bearing: dedupe alone
// does not cover a nested copy pulled in by a dev dependency, and this repo has
// one (Storybook ships React 19).
//
// Shared rather than copied per config so the two hosts cannot drift into that
// failure one at a time. Paths resolve from this file, so it works from any
// package depth.
export const workspaceReactResolve = {
  dedupe: ["react", "react-dom", "react/jsx-runtime", "react-konva", "konva"],
  alias: {
    react: workspaceReact,
    "react-dom": workspaceReactDom,
    "react/jsx-runtime": path.join(workspaceReact, "jsx-runtime.js"),
    "react/jsx-dev-runtime": path.join(workspaceReact, "jsx-dev-runtime.js"),
  },
};
