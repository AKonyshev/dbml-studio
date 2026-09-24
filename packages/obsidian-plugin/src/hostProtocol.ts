import {
  FRAME_PROTOCOL,
  type FrameMessage,
  type HostMessage,
} from "web/src/embed/frameHost";

import { type FrameTheme } from "./blockParams";

/**
 * The host's half of the conversation with a DBML frame, for a host that is
 * not a web page.
 *
 * The vocabulary is `packages/web/src/embed/frameHost.ts`'s, imported rather
 * than restated: the frame and this plugin live in one repository, and a
 * message shape changed there should fail to compile here, not fail silently
 * in a note. What is not reused is the page's own host, `host/main.ts` beside
 * it: that one checks `event.origin` against its own and posts to `"/"`, both
 * of which assume the page and the frame share an origin — and an Obsidian
 * window never shares one with a frame it created.
 */
export type { FrameMessage, HostMessage };

type HostReady = Extract<HostMessage, { type: "ready" }>;
type HostExpanded = Extract<HostMessage, { type: "expanded" }>;
type HostDocument = Extract<HostMessage, { type: "document" }>;
type HostTheme = Extract<HostMessage, { type: "theme" }>;

export const readyMessage = (): HostReady => ({
  source: FRAME_PROTOCOL,
  type: "ready",
});

export const expandedMessage = (expanded: boolean): HostExpanded => ({
  source: FRAME_PROTOCOL,
  type: "expanded",
  expanded,
});

export const documentMessage = (
  text: string,
  tables: string[] | null,
  theme: FrameTheme,
): HostDocument => ({
  source: FRAME_PROTOCOL,
  type: "document",
  text,
  tables,
  theme,
});

/**
 * The theme alone. A re-sent `document` would do it too, but the frame then
 * compares the whole text to find that nothing else changed; this says so.
 */
export const themeMessage = (theme: FrameTheme): HostTheme => ({
  source: FRAME_PROTOCOL,
  type: "theme",
  theme,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** One message from a frame, or `null` for anything else on the wire. */
export const parseFrameMessage = (data: unknown): FrameMessage | null => {
  if (!isRecord(data) || data.source !== FRAME_PROTOCOL) {
    return null;
  }

  if (data.type === "hello") {
    return { source: FRAME_PROTOCOL, type: "hello" };
  }

  if (data.type === "expand" && typeof data.expanded === "boolean") {
    return { source: FRAME_PROTOCOL, type: "expand", expanded: data.expanded };
  }

  return null;
};
