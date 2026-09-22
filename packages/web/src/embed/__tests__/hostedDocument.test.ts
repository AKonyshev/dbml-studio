import { onHostDocument, waitForHostDocument } from "../hostedDocument";

/** A `window` for a test that has none: listeners in, events out. */
const messageTarget = (): {
  target: {
    addEventListener: (
      type: "message",
      listener: (event: MessageEvent) => void,
    ) => void;
    removeEventListener: (
      type: "message",
      listener: (event: MessageEvent) => void,
    ) => void;
  };
  // `source` stands in for `event.source` — the one thing `isFromHost` reads
  // and this module's fake `window` otherwise has no reason to carry.
  send: (data: unknown, source?: unknown) => void;
  listenerCount: () => number;
} => {
  const listeners = new Set<(event: MessageEvent) => void>();

  return {
    target: {
      addEventListener: (_type, listener) => {
        listeners.add(listener);
      },
      removeEventListener: (_type, listener) => {
        listeners.delete(listener);
      },
    },
    send: (data: unknown, source?: unknown) => {
      for (const listener of listeners) {
        const event: MessageEvent = { data, source } as any;
        listener(event);
      }
    },
    listenerCount: () => listeners.size,
  };
};

const DOCUMENT = {
  source: "dbml-frame",
  type: "document",
  text: "Table a { id integer }",
  tables: null,
  theme: "light",
} as const;

/** What every test not about identity passes: nothing here is ever refused. */
const ACCEPT_ALL = (): boolean => true;

/** Accepts only an event whose `source` is `"host"` — a stand-in for `isFromHost`. */
const FROM_HOST = (event: MessageEvent): boolean =>
  (event.source as unknown) === "host";

describe("waitForHostDocument", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("answers with the first model the host pushes", async () => {
    const { target, send } = messageTarget();
    const waiting = waitForHostDocument(target, ACCEPT_ALL, 2000);

    send(DOCUMENT);

    expect(await waiting).toEqual(DOCUMENT);
  });

  // The frame opened straight from the address bar, with nobody to answer: it
  // has to stop waiting and say what is wrong, which is what it did before there
  // was a hosted mode at all.
  it("answers null when nobody says anything in time", async () => {
    const { target } = messageTarget();
    const waiting = waitForHostDocument(target, ACCEPT_ALL, 2000);

    jest.advanceTimersByTime(2000);

    expect(await waiting).toBeNull();
  });

  it("is not fooled by other traffic on the wire", async () => {
    const { target, send } = messageTarget();
    const waiting = waitForHostDocument(target, ACCEPT_ALL, 2000);

    send({ source: "webpack", type: "document", text: "x" });
    send({ source: "dbml-frame", type: "ready" });
    jest.advanceTimersByTime(2000);

    expect(await waiting).toBeNull();
  });

  it("stops listening once it has an answer", async () => {
    const { target, send, listenerCount } = messageTarget();
    const waiting = waitForHostDocument(target, ACCEPT_ALL, 2000);

    send(DOCUMENT);
    await waiting;

    expect(listenerCount()).toBe(0);
  });

  // The identity check this module used to skip entirely: a hosted frame is
  // handed its model by whichever window created it, and a race at startup
  // between the real host and anything else that can reach `postMessage` must
  // not be a race the impostor can win.
  it("ignores a document from a window that is not the host", async () => {
    const { target, send } = messageTarget();
    const waiting = waitForHostDocument(target, FROM_HOST, 2000);

    send(DOCUMENT, "impostor");
    jest.advanceTimersByTime(2000);

    expect(await waiting).toBeNull();
  });

  it("takes the host's document over an impostor's, whichever arrives first", async () => {
    const { target, send } = messageTarget();
    const waiting = waitForHostDocument(target, FROM_HOST, 2000);

    send({ ...DOCUMENT, theme: "dark" }, "impostor");
    send(DOCUMENT, "host");

    expect(await waiting).toEqual(DOCUMENT);
  });
});

describe("onHostDocument", () => {
  it("passes on every model, not only the first", () => {
    const { target, send } = messageTarget();
    const seen: string[] = [];

    onHostDocument(target, ACCEPT_ALL, (document) => {
      seen.push(document.theme);
    });

    send({ ...DOCUMENT, theme: "light" });
    send({ ...DOCUMENT, theme: "dark" });

    expect(seen).toEqual(["light", "dark"]);
  });

  it("stops when told to", () => {
    const { target, send, listenerCount } = messageTarget();
    const seen: unknown[] = [];

    const stop = onHostDocument(target, ACCEPT_ALL, (document) => {
      seen.push(document);
    });

    stop();
    send(DOCUMENT);

    expect(seen).toEqual([]);
    expect(listenerCount()).toBe(0);
  });

  // Same check, the other entry point: a handler that keeps listening past the
  // first document must not be handed one from a window `accept` refuses.
  it("never calls the handler for an event accept refuses", () => {
    const { target, send } = messageTarget();
    const seen: unknown[] = [];

    onHostDocument(target, FROM_HOST, (document) => {
      seen.push(document);
    });

    send(DOCUMENT, "impostor");
    send(DOCUMENT, "host");

    expect(seen).toEqual([DOCUMENT]);
  });
});
