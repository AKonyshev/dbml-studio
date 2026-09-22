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
  send: (data: unknown) => void;
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
    send: (data: unknown) => {
      for (const listener of listeners) {
        const event: MessageEvent = { data } as any;
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

describe("waitForHostDocument", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("answers with the first model the host pushes", async () => {
    const { target, send } = messageTarget();
    const waiting = waitForHostDocument(target, 2000);

    send(DOCUMENT);

    expect(await waiting).toEqual(DOCUMENT);
  });

  // The frame opened straight from the address bar, with nobody to answer: it
  // has to stop waiting and say what is wrong, which is what it did before there
  // was a hosted mode at all.
  it("answers null when nobody says anything in time", async () => {
    const { target } = messageTarget();
    const waiting = waitForHostDocument(target, 2000);

    jest.advanceTimersByTime(2000);

    expect(await waiting).toBeNull();
  });

  it("is not fooled by other traffic on the wire", async () => {
    const { target, send } = messageTarget();
    const waiting = waitForHostDocument(target, 2000);

    send({ source: "webpack", type: "document", text: "x" });
    send({ source: "dbml-frame", type: "ready" });
    jest.advanceTimersByTime(2000);

    expect(await waiting).toBeNull();
  });

  it("stops listening once it has an answer", async () => {
    const { target, send, listenerCount } = messageTarget();
    const waiting = waitForHostDocument(target, 2000);

    send(DOCUMENT);
    await waiting;

    expect(listenerCount()).toBe(0);
  });
});

describe("onHostDocument", () => {
  it("passes on every model, not only the first", () => {
    const { target, send } = messageTarget();
    const seen: string[] = [];

    onHostDocument(target, (document) => {
      seen.push(document.theme);
    });

    send({ ...DOCUMENT, theme: "light" });
    send({ ...DOCUMENT, theme: "dark" });

    expect(seen).toEqual(["light", "dark"]);
  });

  it("stops when told to", () => {
    const { target, send, listenerCount } = messageTarget();
    const seen: unknown[] = [];

    const stop = onHostDocument(target, (document) => {
      seen.push(document);
    });

    stop();
    send(DOCUMENT);

    expect(seen).toEqual([]);
    expect(listenerCount()).toBe(0);
  });
});
