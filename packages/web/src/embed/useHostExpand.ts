import { useCallback, useEffect, useState } from "react";

import {
  expandMessage,
  helloMessage,
  isFromHost,
  parseHostMessage,
  postToHost,
} from "./frameHost";

export interface HostExpand {
  /** Whether there is a page out there that answered. See `frameHost`. */
  supported: boolean;
  expanded: boolean;
  toggle: () => void;
}

/**
 * The frame's end of the expand-me conversation.
 *
 * The host is the one that knows how wide the page is and what to do about it;
 * this hook only asks. It also does not decide what the button shows: the state
 * it reports is the state the host said it had settled on, so a page that
 * collapses a frame for its own reasons — the reader pressed Escape outside the
 * frame, or scrolled, or opened another one — moves the icon with it.
 */
export const useHostExpand = (): HostExpand => {
  const [supported, setSupported] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Nothing above us: the frame was opened from the address bar rather than
    // embedded. Posting to `window.parent` would post to ourselves.
    if (window.parent === window) {
      return;
    }

    const onMessage = (event: MessageEvent): void => {
      if (!isFromHost(event)) {
        return;
      }

      const message = parseHostMessage(event.data);

      if (message === null) {
        return;
      }

      if (message.type === "ready") {
        setSupported(true);
        return;
      }

      // Not an `else`: the host says more than this hook is about, and a message
      // about the theme or the model must not be read as a state of the frame.
      if (message.type === "expanded") {
        setExpanded(message.expanded);
      }
    };

    window.addEventListener("message", onMessage);

    // No retry, because none is needed: the host installs its listener from a
    // script the page carries ahead of the first frame, and a frame's own
    // scripts cannot run before the element that loads them has been parsed.
    postToHost(helloMessage());

    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, []);

  useEffect(() => {
    if (!expanded) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }

      // Read a turn later, once every listener on this event has had it: the
      // shortcuts legend and the export menu both close on Escape and say so by
      // preventing the default, and they mount after this hook does, so their
      // listeners run after ours. Asking now would always find `false` and one
      // Escape would both close the menu and put the page back.
      setTimeout(() => {
        if (!event.defaultPrevented) {
          postToHost(expandMessage(false));
        }
      }, 0);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  const toggle = useCallback(() => {
    postToHost(expandMessage(!expanded));
  }, [expanded]);

  return { supported, expanded, toggle };
};
