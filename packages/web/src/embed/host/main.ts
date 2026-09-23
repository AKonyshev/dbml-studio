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

/** The `div` the plugin wraps every frame in. */
const WRAPPER_SELECTOR = ".dbml-diagram";
const FRAME_SELECTOR = `${WRAPPER_SELECTOR} iframe`;

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

/**
 * The plugin's wrapper around this frame — the nearest one, not the parent:
 * `FRAME_SELECTOR` matches an iframe at any depth, so some other extension may
 * have put a box of its own between the two, and that box must get neither
 * the expanded class nor a say in the frame's theme.
 */
const wrapperOf = (frame: HTMLIFrameElement): Element | null =>
  frame.closest(WRAPPER_SELECTOR);

/**
 * `"/"` means "the same origin as this document". Not `window.location.origin`,
 * which on a page opened from disk is the string `"null"` — a target
 * `postMessage` throws on.
 */
const post = (frame: HTMLIFrameElement, message: HostMessage): void => {
  frame.contentWindow?.postMessage(message, "/");
};

/** The class, and the answer that tells the frame which icon to draw. */
const apply = (frame: HTMLIFrameElement, expanded: boolean): void => {
  wrapperOf(frame)?.classList.toggle(EXPANDED_CLASS, expanded);
  post(frame, { source: FRAME_PROTOCOL, type: "expanded", expanded });
};

/**
 * Also for a frame that is no longer in the document at all. Material's instant
 * navigation swaps a page's content without reloading it, so this script and
 * what it remembers outlive the diagram; a detached frame has no window to
 * tell — `post` says nothing to it — but the lock on `<html>` is still ours to
 * take off.
 */
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
  if (wrapperOf(frame)?.hasAttribute(FIXED_THEME) === true) {
    return;
  }

  post(frame, { source: FRAME_PROTOCOL, type: "theme", theme: pageTheme() });
};

const greet = (frame: HTMLIFrameElement): void => {
  post(frame, { source: FRAME_PROTOCOL, type: "ready" });
  tellTheme(frame);
};

/**
 * Everything this script does, once — deferred until `document.body` exists.
 *
 * A `<script>` in `<head>` runs before the body does, and the greet loop
 * below reads the DOM while `pageTheme` reads `document.body.dataset`: run
 * either one then and it throws, silently taking every feature in this file
 * down with it — the reader's theme switch included, since the observer at
 * the bottom of this function is what listens for it. Waiting for
 * `DOMContentLoaded` costs nothing: the frame that said hello before anyone
 * was listening is still greeted the moment this does run, because the loop
 * below greets every frame already on the page regardless of why it is only
 * running now.
 *
 * The idempotence guard is set only once the body is confirmed to exist and
 * installation is actually going ahead, not at the top of this function —
 * so two copies of the script, both waiting on the same `DOMContentLoaded`,
 * cannot both queue a listener and then both install when it fires.
 */
const install = (): void => {
  if (document.body === null) {
    document.addEventListener("DOMContentLoaded", install);
    return;
  }

  if (window.__dbmlFrameHost === true) {
    return;
  }

  window.__dbmlFrameHost = true;

  window.addEventListener("message", (event: MessageEvent) => {
    // An expanded diagram that went with the content around it is collapsed,
    // whatever this message turns out to be: the page it left must be free to
    // scroll. Back is caught below; this catches every other way the content
    // was swapped, at the next word from any frame.
    if (expandedFrame?.isConnected === false) {
      collapse();
    }

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

  // What we know: this file runs after the body exists, so a frame already
  // on the page may have said hello before the listener above was there to
  // answer it — nobody retries, so it is greeted here instead. What we do
  // not know is where Antora places its own script, or whether this ever
  // happens to it; that copy makes no claim about it. Frames that load
  // later — lazily, most of them — say hello and are greeted then. Both
  // orders end with a frame that knows it has a host.
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

  // Back — into another page of a site with instant navigation, which swaps the
  // content and leaves this script running, or to an earlier anchor of this
  // one. Either way the reader is going somewhere else, and a diagram left
  // across the page would hold that page still. Collapsing twice is nothing.
  window.addEventListener("popstate", collapse);

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
