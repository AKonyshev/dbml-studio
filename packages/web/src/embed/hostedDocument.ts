import { parseHostMessage, type HostMessage } from "./frameHost";

export type HostDocumentMessage = Extract<HostMessage, { type: "document" }>;

/** A `window`, reduced to what listening for host messages actually needs. */
export interface MessageTarget {
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent) => void,
  ) => void;
  removeEventListener: (
    type: "message",
    listener: (event: MessageEvent) => void,
  ) => void;
}

/**
 * Every model the host pushes, until the returned function is called.
 *
 * `accept` is the identity check, and it is a parameter rather than something
 * this module does itself: `isFromHost` needs `window.parent`, which is not
 * part of `MessageTarget`, and `MessageTarget` is reduced to what listening
 * needs precisely so this module stays testable without a `window`. Putting
 * the check here instead — as a required argument every caller must supply —
 * is what makes it impossible for a caller to wire this up and forget it, the
 * way this module's first version did: `bootstrap` drew whatever arrived
 * first, from any window that knew the frame's origin.
 */
export const onHostDocument = (
  target: MessageTarget,
  accept: (event: MessageEvent) => boolean,
  handler: (document: HostDocumentMessage) => void,
): (() => void) => {
  const listener = (event: MessageEvent): void => {
    if (!accept(event)) {
      return;
    }

    const message = parseHostMessage(event.data);

    if (message !== null && message.type === "document") {
      handler(message);
    }
  };

  target.addEventListener("message", listener);

  return () => {
    target.removeEventListener("message", listener);
  };
};

export interface HostDocumentBridge {
  /** The last model that arrived while nobody else was listening, once. */
  take: () => HostDocumentMessage | null;
  stop: () => void;
}

/**
 * Holds what the host says between one listener and the next.
 *
 * There is a gap in a hosted frame's life: `waitForHostDocument` stops
 * listening the moment it has an answer, and the component that listens from
 * then on does not exist until React has mounted it. A host that answers each
 * of the frame's greetings papers over the gap by repeating itself, but one
 * that answers only the first would have its model dropped into it — and the
 * frame would sit on a message it never receives again.
 *
 * The last message rather than a queue: each document supersedes the one
 * before it, so drawing an intermediate one and then the final one is work
 * nobody asked for. `take` yields it once; a second call is `null`.
 */
export const bridgeHostDocuments = (
  target: MessageTarget,
  accept: (event: MessageEvent) => boolean,
): HostDocumentBridge => {
  let latest: HostDocumentMessage | null = null;

  const stop = onHostDocument(target, accept, (message) => {
    latest = message;
  });

  return {
    take: () => {
      const held = latest;

      latest = null;

      return held;
    },
    stop,
  };
};

/** The first model the host pushes, or `null` if nobody answers in time. */
export const waitForHostDocument = async (
  target: MessageTarget,
  accept: (event: MessageEvent) => boolean,
  timeoutMs: number,
): Promise<HostDocumentMessage | null> =>
  await new Promise((resolve) => {
    let stop = (): void => {};

    const timer = setTimeout(() => {
      stop();
      resolve(null);
    }, timeoutMs);

    stop = onHostDocument(target, accept, (document) => {
      clearTimeout(timer);
      stop();
      resolve(document);
    });
  });
