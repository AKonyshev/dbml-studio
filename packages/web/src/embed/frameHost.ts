/**
 * What the frame and the documentation page around it say to each other.
 *
 * The frame is an `<iframe>` in a page it does not control and cannot resize:
 * a diagram that wants the whole viewport has to ask for it. This module is
 * mostly the vocabulary of that request, and most of it needs no browser to
 * test. The exceptions are `isFromHost` and `postToHost`, which read and
 * write `window.parent` and are exercised by the Playwright suite
 * (`embed.spec.ts`) rather than by this package's Node tests.
 *
 * The other half lives in the site of documentation, in
 * `antora/docs/lib/dbml-frame-host.js`, and is written out again there rather
 * than imported: the two are different projects in different repositories, and
 * a shared package for four message shapes would cost more than it saves. The
 * price is that this file and that one have to be changed together, which is
 * why both name the other in a comment.
 */

/** Marks a message as belonging to this protocol and not to some other frame's. */
export const FRAME_PROTOCOL = "dbml-frame";

interface FrameHello {
  source: typeof FRAME_PROTOCOL;
  type: "hello";
}

interface FrameExpand {
  source: typeof FRAME_PROTOCOL;
  type: "expand";
  expanded: boolean;
}

/** Frame to host. */
export type FrameMessage = FrameHello | FrameExpand;

interface HostReady {
  source: typeof FRAME_PROTOCOL;
  type: "ready";
}

interface HostExpanded {
  source: typeof FRAME_PROTOCOL;
  type: "expanded";
  expanded: boolean;
}

/**
 * A model the host read for us, instead of the frame fetching one.
 *
 * The catalogue and a URL both assume a server: a site serves its models, and
 * the frame asks for them. A plugin has no server — it has the file on disk and
 * a frame it created — so it pushes the text in. The theme rides along because
 * the host that owns the file also owns the surface the diagram sits on, and
 * both change at once.
 */
interface HostDocument {
  source: typeof FRAME_PROTOCOL;
  type: "document";
  text: string;
  /** Names to keep, or `null` for the whole model. */
  tables: string[] | null;
  theme: "light" | "dark";
}

/**
 * "The page is dark now" — or light.
 *
 * For a host that does not push documents: a documentation site serves its
 * models itself and has nothing else to say, but its reader may still have a
 * switch. Reloading the frame with a new query would answer that and throw away
 * the view the reader had scrolled and zoomed to, so the theme travels alone.
 */
interface HostTheme {
  source: typeof FRAME_PROTOCOL;
  type: "theme";
  theme: "light" | "dark";
}

/** Host to frame. */
export type HostMessage = HostReady | HostExpanded | HostDocument | HostTheme;

/**
 * "There is a frame here that can be expanded."
 *
 * Sent on mount, by `useHostExpand` — but not only there, and not only once. A
 * hosted frame (see `main.tsx`) has nothing to draw until its host answers,
 * and `useHostExpand`'s own hello does not go out until `Frame` mounts, which
 * for that mode is *after* the host has already answered. So `bootstrap` sends
 * one of these itself first, before `useHostExpand` exists to send its own —
 * which still runs once `Frame` does mount, and answers twice rather than
 * being skipped for that one mode. A host that answers each hello with
 * `ready`, and for a hosted frame a `document` besides, costs one extra
 * message and, for the document, nothing more: a re-send of one already drawn
 * is recognised as such and only its theme is applied — see
 * `sameHostedSource` in `main.tsx`. A host that stays quiet throughout — an
 * older build of the site, or the frame opened straight from the address bar
 * — gets no button, because a button that visibly does nothing is worse than
 * an absent one.
 */
export const helloMessage = (): FrameHello => ({
  source: FRAME_PROTOCOL,
  type: "hello",
});

/** "Put me across the page", or "put me back". */
export const expandMessage = (expanded: boolean): FrameExpand => ({
  source: FRAME_PROTOCOL,
  type: "expand",
  expanded,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isThemeName = (value: unknown): value is "light" | "dark" =>
  value === "light" || value === "dark";

/**
 * One message from the host, or `null` for anything else on the wire.
 *
 * `null` covers a lot of ordinary traffic: a page carries whatever its other
 * scripts post, and in development the dev server's own messages arrive here
 * too. Only the four shapes below — `ready`, `expanded`, `document`, `theme`
 * — are answered.
 */
export const parseHostMessage = (data: unknown): HostMessage | null => {
  if (!isRecord(data) || data.source !== FRAME_PROTOCOL) {
    return null;
  }

  if (data.type === "ready") {
    return { source: FRAME_PROTOCOL, type: "ready" };
  }

  if (data.type === "expanded" && typeof data.expanded === "boolean") {
    return {
      source: FRAME_PROTOCOL,
      type: "expanded",
      expanded: data.expanded,
    };
  }

  if (
    data.type === "document" &&
    typeof data.text === "string" &&
    (data.tables === null ||
      (Array.isArray(data.tables) &&
        data.tables.every((name) => typeof name === "string"))) &&
    isThemeName(data.theme)
  ) {
    return {
      source: FRAME_PROTOCOL,
      type: "document",
      text: data.text,
      tables: data.tables,
      theme: data.theme,
    };
  }

  if (data.type === "theme" && isThemeName(data.theme)) {
    return { source: FRAME_PROTOCOL, type: "theme", theme: data.theme };
  }

  return null;
};

/**
 * Whether this message came from the host, in the one place that decides it.
 *
 * `event.source`, and deliberately not `event.origin`. A frame in a
 * documentation site shares an origin with the page around it, and comparing
 * origins there costs nothing; a frame in a plugin does not — the application
 * window and the frame it created are different origins by construction, and the
 * same comparison silently drops every message, including the `ready` without
 * which the frame shows no controls. What the check is for is identity, and
 * identity is what `source` is: the only window the frame answers is the one that
 * embedded it.
 *
 * What a hostile embedder gains by this is worth naming: it can tell a frame it
 * embedded to draw a diagram, expand, or turn dark. All of that is what the
 * frame is for, in a page that embedder already controls. Nothing of ours
 * crosses the boundary — the frame stores nothing and has nothing to read.
 */
export const isFromHost = (event: MessageEvent): boolean =>
  window.parent !== window && event.source === window.parent;

/**
 * One message to the host.
 *
 * `"*"` rather than an origin, for the same reason: a plugin host has an origin
 * the frame cannot name, and what goes out is "hello" and "expand me" — a
 * request, never a payload.
 */
export const postToHost = (message: FrameMessage): void => {
  window.parent.postMessage(message, "*");
};
