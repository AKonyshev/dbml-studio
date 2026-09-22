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
 * No identity check here, unlike the hooks that answer the host: a hosted frame
 * is handed its model by the window that created it, and that check lives in
 * `isFromHost`, called by the frame that wires this up. This module is the
 * waiting, and it is testable because it is only the waiting.
 */
export const onHostDocument = (
  target: MessageTarget,
  handler: (document: HostDocumentMessage) => void,
): (() => void) => {
  const listener = (event: MessageEvent): void => {
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

/** The first model the host pushes, or `null` if nobody answers in time. */
export const waitForHostDocument = async (
  target: MessageTarget,
  timeoutMs: number,
): Promise<HostDocumentMessage | null> =>
  await new Promise((resolve) => {
    let stop = (): void => {};

    const timer = setTimeout(() => {
      stop();
      resolve(null);
    }, timeoutMs);

    stop = onHostDocument(target, (document) => {
      clearTimeout(timer);
      stop();
      resolve(document);
    });
  });
