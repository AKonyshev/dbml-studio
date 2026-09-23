/**
 * The page's half of the conversation with a DBML frame.
 *
 * A frame is an `<iframe>` a few hundred pixels tall in a page of prose. It can
 * draw a diagram but it cannot make itself bigger, and it cannot see the page's
 * own theme switch. This is the script that answers both.
 *
 * It lives here rather than in the repository of each documentation site so
 * that it changes together with `../frameHost.ts`, whose vocabulary it speaks.
 * Antora's copy predates this and is still its own; the plugin for MkDocs
 * vendors what is built from this file.
 */
import { Theme } from "json-table-schema-visualizer/src/types/theme";

import { FRAME_PROTOCOL, type HostMessage } from "../frameHost";

declare global {
  interface Window {
    __dbmlFrameHost?: boolean;
  }
}

const FRAME_SELECTOR = ".dbml-diagram iframe";

/** On the `div` the plugin wraps every frame in. */
const EXPANDED_CLASS = "dbml-diagram--expanded";

/** On `<html>`, so the page behind an expanded diagram does not scroll. */
const LOCKED_CLASS = "dbml-diagram-host--locked";

/** On the wrapper of a frame whose block named a theme: that one is left as it is. */
const FIXED_THEME = "data-dbml-theme-fixed";

/**
 * Material's dark palette is named in the site's own configuration — `slate` by
 * convention, anything the author likes in fact — so the plugin writes the name
 * it found onto the wrappers it generates, and this reads it from any one of
 * them.
 */
const DARK_SCHEME_ATTRIBUTE = "data-dbml-dark-scheme";
const DEFAULT_DARK_SCHEME = "slate";

/** The one diagram across the page, or null. At most one at a time. */
let expandedFrame: HTMLIFrameElement | null = null;

const frames = (): HTMLIFrameElement[] =>
  Array.from(document.querySelectorAll<HTMLIFrameElement>(FRAME_SELECTOR));

/**
 * The frame that sent this message, if it is one of ours.
 *
 * Looked up by window rather than trusted from the message, so a script in some
 * other frame on the page cannot move a diagram it does not own.
 */
const frameOf = (source: MessageEventSource | null): HTMLIFrameElement | null =>
  frames().find((frame) => frame.contentWindow === source) ?? null;

const post = (frame: HTMLIFrameElement, message: HostMessage): void => {
  frame.contentWindow?.postMessage(message, window.location.origin);
};

/** The class, and the answer that tells the frame which icon to draw. */
const apply = (frame: HTMLIFrameElement, expanded: boolean): void => {
  frame.parentElement?.classList.toggle(EXPANDED_CLASS, expanded);
  post(frame, { source: FRAME_PROTOCOL, type: "expanded", expanded });
};

const collapse = (): void => {
  if (expandedFrame === null) {
    return;
  }

  const frame = expandedFrame;

  expandedFrame = null;
  apply(frame, false);
  document.documentElement.classList.remove(LOCKED_CLASS);
};

const expand = (frame: HTMLIFrameElement): void => {
  // A page may carry several diagrams and the reader may reach the toolbar of
  // one that is behind another. Only ever one across the page.
  if (expandedFrame !== null && expandedFrame !== frame) {
    collapse();
  }

  expandedFrame = frame;
  apply(frame, true);
  document.documentElement.classList.add(LOCKED_CLASS);
};

const darkSchemeName = (): string =>
  document
    .querySelector(`[${DARK_SCHEME_ATTRIBUTE}]`)
    ?.getAttribute(DARK_SCHEME_ATTRIBUTE) ?? DEFAULT_DARK_SCHEME;

const pageTheme = (): Theme =>
  document.body.dataset.mdColorScheme === darkSchemeName()
    ? Theme.dark
    : Theme.light;

const tellTheme = (frame: HTMLIFrameElement): void => {
  if (frame.parentElement?.hasAttribute(FIXED_THEME) === true) {
    return;
  }

  post(frame, { source: FRAME_PROTOCOL, type: "theme", theme: pageTheme() });
};

const greet = (frame: HTMLIFrameElement): void => {
  post(frame, { source: FRAME_PROTOCOL, type: "ready" });
  tellTheme(frame);
};

/**
 * Everything this script does, once.
 *
 * Idempotent: a page assembled some other way must not end up with two
 * listeners answering every hello.
 */
const install = (): void => {
  if (window.__dbmlFrameHost === true) {
    return;
  }

  window.__dbmlFrameHost = true;

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== window.location.origin) {
      return;
    }

    const data: unknown = event.data;

    if (
      data === null ||
      typeof data !== "object" ||
      (data as { source?: unknown }).source !== FRAME_PROTOCOL
    ) {
      return;
    }

    const frame = frameOf(event.source);

    if (frame === null) {
      return;
    }

    const message = data as { type?: unknown; expanded?: unknown };

    if (message.type === "hello") {
      greet(frame);
      return;
    }

    if (message.type === "expand" && typeof message.expanded === "boolean") {
      if (message.expanded) {
        expand(frame);
      } else if (expandedFrame === frame) {
        collapse();
      }
    }
  });

  // Antora inlines this script ahead of the first frame, so a frame's hello
  // could never arrive before the listener existed and the frame needs no
  // retry. A file loaded by the page gives no such order: a frame may be up
  // and waiting already. So every frame on the page is greeted now, and the
  // ones that load later — lazily, most of them — say hello and are greeted
  // then. Both orders end with a frame that knows it has a host.
  for (const frame of frames()) {
    greet(frame);
  }

  // The reader's own switch. The frame listens for Escape too, for the far more
  // common case of them having just clicked a button inside it; this is for when
  // the focus is out here.
  document.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key !== "Escape" || expandedFrame === null) {
      return;
    }

    event.preventDefault();
    collapse();
  });

  // Material rewrites this attribute on `<body>` when the reader turns the
  // lights off, and there is no event for it.
  new MutationObserver(() => {
    for (const frame of frames()) {
      tellTheme(frame);
    }
  }).observe(document.body, {
    attributes: true,
    attributeFilter: ["data-md-color-scheme"],
  });
};

install();
