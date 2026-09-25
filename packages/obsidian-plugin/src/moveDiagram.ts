import { themeOf } from "./appTheme";
import { type FrameTheme } from "./blockParams";
import { type ExpandHost, type ExpandHosts } from "./expandHost";
import { type FrameView } from "./frameView";

/** What moving a diagram to another window changes. */
export interface MovableDiagram {
  view: FrameView;
  /** The host of the window the diagram is drawn in. */
  expandHost: ExpandHost;
  /** The theme the block pinned, or `null` to follow the application. */
  pinnedTheme: FrameTheme | null;
}

/**
 * A diagram's elements are now in `win`: a note's tab was dragged into
 * another window. Obsidian does not render the block again, and the frame
 * reloads there, so everything tied to the old window moves with it.
 *
 * - An expanded diagram is released first, from the host of the window it
 *   left, so that window's lock and Escape listener do not stay behind with
 *   nothing to undo them. The reloaded frame starts collapsed anyway.
 * - From now on it expands in the new window's host.
 * - The frame's side moves (`FrameView.moveTo`), and the reloaded frame is
 *   greeted with the document in the application's theme, read from
 *   `appBody`, the main window's body, for the reason `followAppTheme` gives.
 *   A pinned theme stays.
 */
export const moveDiagram = (
  diagram: MovableDiagram,
  win: Window & typeof globalThis,
  hosts: ExpandHosts,
  appBody: HTMLElement,
): void => {
  diagram.expandHost.release(diagram.view);
  diagram.expandHost = hosts.of(win.document);
  diagram.view.moveTo(win);

  if (diagram.pinnedTheme === null) {
    diagram.view.setTheme(themeOf(appBody));
  }
};
