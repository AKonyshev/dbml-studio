import { FrameView, type FrameViewOptions } from "../frameView";

const HELLO = { source: "dbml-frame", type: "hello" };

/** A message as `window` receives it from `source`. */
const messageFrom = (source: Window, data: unknown): MessageEvent => {
  const event = new MessageEvent("message", { data });

  // Set after construction: what jsdom accepts as `source` in the initializer
  // is its own business, and the value is all FrameView reads.
  Object.defineProperty(event, "source", { value: source });

  return event;
};

interface Rig {
  container: HTMLElement;
  view: FrameView;
  frameWindow: Window;
  post: jest.SpyInstance;
  greet: () => void;
}

const setup = (overrides: Partial<FrameViewOptions> = {}): Rig => {
  const container = document.createElement("div");

  document.body.append(container);

  const view = new FrameView({
    container,
    url: "about:blank",
    theme: "light",
    height: 500,
    title: "rd.dbml",
    messageTarget: window,
    ...overrides,
  });

  const frameWindow = view.element.contentWindow;

  if (frameWindow === null) {
    throw new Error("jsdom gave the frame no window");
  }

  const post = jest
    .spyOn(frameWindow, "postMessage")
    .mockImplementation(() => undefined);

  const greet = (): void => {
    window.dispatchEvent(messageFrom(frameWindow, HELLO));
  };

  return { container, view, frameWindow, post, greet };
};

afterEach(() => {
  document.body.innerHTML = "";
  jest.restoreAllMocks();
});

describe("FrameView", () => {
  it("puts a frame of the asked-for height, in a wrapper, in the container", () => {
    const { container, view } = setup();

    expect(container.querySelector(".dbml-diagram > iframe")).toBe(
      view.element,
    );
    expect(view.element.height).toBe("500");
    expect(view.element.title).toBe("rd.dbml");
  });

  it("answers hello with ready, then the document it was already holding", () => {
    const { view, post, greet } = setup();

    view.setDocument({
      text: "Table a { id int }",
      tables: ["a"],
      theme: "dark",
    });

    expect(post).not.toHaveBeenCalled();

    greet();

    expect(post.mock.calls).toEqual([
      [{ source: "dbml-frame", type: "ready" }, "*"],
      [
        {
          source: "dbml-frame",
          type: "document",
          text: "Table a { id int }",
          tables: ["a"],
          theme: "dark",
        },
        "*",
      ],
    ]);
  });

  it("answers a hello with only ready when no document is set yet", () => {
    const { post, greet } = setup();

    greet();

    expect(post.mock.calls).toEqual([
      [{ source: "dbml-frame", type: "ready" }, "*"],
    ]);
  });

  it("sends a later document straight away", () => {
    const { view, post, greet } = setup();

    greet();
    post.mockClear();
    view.setDocument({
      text: "Table b { id int }",
      tables: null,
      theme: "light",
    });

    expect(post.mock.calls).toEqual([
      [
        {
          source: "dbml-frame",
          type: "document",
          text: "Table b { id int }",
          tables: null,
          theme: "light",
        },
        "*",
      ],
    ]);
  });

  // A hosted frame greets twice by design — from `bootstrap`, and again from
  // `useHostExpand` once the diagram mounts — and the second one is what turns
  // the expand button on.
  it("answers a second hello the same way as the first", () => {
    const { view, post, greet } = setup();

    view.setDocument({
      text: "Table a { id int }",
      tables: null,
      theme: "light",
    });
    greet();

    const first = [...post.mock.calls];

    post.mockClear();
    greet();

    expect(post.mock.calls).toEqual(first);
  });

  it("ignores a hello from a window that is not its frame", () => {
    const { post } = setup();

    window.dispatchEvent(messageFrom(window, HELLO));

    expect(post).not.toHaveBeenCalled();
  });

  it("ignores a message from its frame that is not a hello", () => {
    const { frameWindow, post } = setup();

    window.dispatchEvent(
      messageFrom(frameWindow, {
        source: "dbml-frame",
        type: "expand",
        expanded: true,
      }),
    );
    window.dispatchEvent(messageFrom(frameWindow, { nonsense: true }));

    expect(post).not.toHaveBeenCalled();
  });

  // A note can hold several diagrams, and every one of them hears every
  // message: a frame is identified by the window it is, not by what it claims.
  it("ignores the hello of another diagram's frame", () => {
    const first = setup();
    const second = setup();

    second.greet();

    expect(first.post).not.toHaveBeenCalled();
    expect(second.post).toHaveBeenCalled();
  });

  it("removes its frame when destroyed", () => {
    const { container, view } = setup();

    view.destroy();

    expect(container.querySelector(".dbml-diagram")).toBeNull();
  });

  it("stops listening when destroyed", () => {
    const added = jest.spyOn(window, "addEventListener");
    const removed = jest.spyOn(window, "removeEventListener");
    const { view } = setup();
    const listener = added.mock.calls.find(([type]) => type === "message")?.[1];

    view.destroy();

    expect(listener).toBeDefined();
    expect(removed).toHaveBeenCalledWith("message", listener);
  });
});

describe("FrameView.setTheme", () => {
  const DOC = {
    text: "Table a { id int }",
    tables: null,
    theme: "light",
  } as const;

  it("tells a greeted frame the new theme", () => {
    const { view, post, greet } = setup();

    view.setDocument(DOC);
    greet();
    post.mockClear();
    view.setTheme("dark");

    expect(post.mock.calls).toEqual([
      [{ source: "dbml-frame", type: "theme", theme: "dark" }, "*"],
    ]);
  });

  // The frame listens for `theme` only once its diagram has mounted; before
  // that the message would be lost, so the next hello carries it instead.
  it("greets a frame that has not said hello yet in the new theme", () => {
    const { view, post, greet } = setup();

    view.setDocument(DOC);
    view.setTheme("dark");

    expect(post).not.toHaveBeenCalled();

    greet();

    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "document", theme: "dark" }),
      "*",
    );
  });

  // `css-change` fires for every stylesheet change, not only the theme.
  it("says nothing when the theme has not changed", () => {
    const { view, post, greet } = setup();

    view.setDocument(DOC);
    greet();
    post.mockClear();
    view.setTheme("light");
    view.setTheme("dark");
    view.setTheme("dark");

    expect(post).toHaveBeenCalledTimes(1);
  });

  it("has nothing to say before it has a model", () => {
    const { view, post, greet } = setup();

    view.setTheme("dark");
    greet();

    expect(post.mock.calls).toEqual([
      [{ source: "dbml-frame", type: "ready" }, "*"],
    ]);
  });
});

describe("FrameView, expanding", () => {
  it("hands a request to expand, and to go back, to its host", () => {
    const seen: boolean[] = [];
    const { frameWindow } = setup({
      onExpand: (expanded) => seen.push(expanded),
    });

    window.dispatchEvent(
      messageFrom(frameWindow, {
        source: "dbml-frame",
        type: "expand",
        expanded: true,
      }),
    );
    window.dispatchEvent(
      messageFrom(frameWindow, {
        source: "dbml-frame",
        type: "expand",
        expanded: false,
      }),
    );

    expect(seen).toEqual([true, false]);
  });

  it("ignores a request to expand from a window that is not its frame", () => {
    const seen: boolean[] = [];

    setup({ onExpand: (expanded) => seen.push(expanded) });
    window.dispatchEvent(
      messageFrom(window, {
        source: "dbml-frame",
        type: "expand",
        expanded: true,
      }),
    );

    expect(seen).toEqual([]);
  });

  it("marks its wrapper and tells the frame what was settled", () => {
    const { view, post } = setup();

    view.setExpanded(true);

    expect(view.wrapper.classList.contains("dbml-diagram--expanded")).toBe(
      true,
    );
    expect(post).toHaveBeenLastCalledWith(
      { source: "dbml-frame", type: "expanded", expanded: true },
      "*",
    );

    view.setExpanded(false);

    expect(view.wrapper.classList.contains("dbml-diagram--expanded")).toBe(
      false,
    );
    expect(post).toHaveBeenLastCalledWith(
      { source: "dbml-frame", type: "expanded", expanded: false },
      "*",
    );
  });
});

// Obsidian runs the plugin in its main window, and a note opened in a popout
// draws its frame in that popout. A plain `contentWindow.postMessage` called
// from main-window code arrives with `event.source` set to the main window, and
// the frame, which accepts only its parent, drops it. A poster compiled by the
// frame's parent window's own `Function` posts as that window.
describe("FrameView, posting as the frame's parent window", () => {
  it("posts every message through a poster built by its container's window", () => {
    const poster = jest.fn();
    const construct = jest
      .spyOn(window, "Function")
      .mockImplementation(() => poster as never);
    const { view, frameWindow, post, greet } = setup();

    expect(construct).toHaveBeenCalledTimes(1);
    expect(construct).toHaveBeenCalledWith(
      "target",
      "message",
      "target.postMessage(message, '*');",
    );

    view.setDocument({
      text: "Table a { id int }",
      tables: null,
      theme: "light",
    });
    greet();
    view.setTheme("dark");
    view.setExpanded(true);

    expect(poster.mock.calls.map(([target]) => target)).toEqual([
      frameWindow,
      frameWindow,
      frameWindow,
      frameWindow,
    ]);
    expect(poster.mock.calls.map(([, message]) => message.type)).toEqual([
      "ready",
      "document",
      "theme",
      "expanded",
    ]);
    expect(post).not.toHaveBeenCalled();
    expect(construct).toHaveBeenCalledTimes(1);
  });
});

// Obsidian renders a block twice while a note is open — once in reading view
// and once in the hidden Live Preview editor — and every frame is an 11.6 MB
// document. A frame loads only once its wrapper is first on screen.
describe("FrameView, loading when first seen", () => {
  class FakeObserver {
    static made: FakeObserver[] = [];

    readonly observed: Element[] = [];
    readonly disconnect = jest.fn();

    constructor(private readonly callback: IntersectionObserverCallback) {
      FakeObserver.made.push(this);
    }

    observe(target: Element): void {
      this.observed.push(target);
    }

    unobserve(): void {}

    fire(isIntersecting: boolean): void {
      this.callback(
        this.observed.map((target) => {
          // All FrameView reads of an entry.
          const entry: Partial<IntersectionObserverEntry> = {
            target,
            isIntersecting,
          };

          return entry as IntersectionObserverEntry;
        }),
        this as unknown as IntersectionObserver,
      );
    }
  }

  const FRAME_URL = "about:blank?diagram";

  beforeEach(() => {
    FakeObserver.made = [];
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      writable: true,
      value: FakeObserver,
    });
  });

  afterEach(() => {
    delete (window as { IntersectionObserver?: unknown }).IntersectionObserver;
  });

  const observer = (): FakeObserver => {
    expect(FakeObserver.made).toHaveLength(1);

    return FakeObserver.made[0];
  };

  it("builds the frame, sized and in its wrapper, but loads nothing yet", () => {
    const { view } = setup({ url: FRAME_URL });

    expect(view.element.parentElement).toBe(view.wrapper);
    expect(view.element.height).toBe("500");
    expect(view.element.getAttribute("src")).toBeNull();
    expect(observer().observed).toEqual([view.wrapper]);
  });

  it("does not load while its wrapper stays off screen", () => {
    const { view } = setup({ url: FRAME_URL });

    observer().fire(false);

    expect(view.element.getAttribute("src")).toBeNull();
    expect(observer().disconnect).not.toHaveBeenCalled();
  });

  it("loads the first time its wrapper is on screen, then stops watching", () => {
    const { view } = setup({ url: FRAME_URL });

    observer().fire(true);

    expect(view.element.getAttribute("src")).toBe(`${FRAME_URL}&theme=light`);
    expect(observer().disconnect).toHaveBeenCalledTimes(1);
  });

  it("stops watching when destroyed before it was ever seen", () => {
    const { view } = setup({ url: FRAME_URL });

    view.destroy();

    expect(observer().disconnect).toHaveBeenCalled();
  });

  it("delivers a document set before loading once the frame says hello", () => {
    const { view } = setup({ url: FRAME_URL });

    view.setDocument({
      text: "Table a { id int }",
      tables: null,
      theme: "dark",
    });
    observer().fire(true);

    // Loading gives the frame a window of its own; the hello comes from that.
    const loaded = view.element.contentWindow;

    if (loaded === null) {
      throw new Error("jsdom gave the loaded frame no window");
    }

    const post = jest
      .spyOn(loaded, "postMessage")
      .mockImplementation(() => undefined);

    window.dispatchEvent(messageFrom(loaded, HELLO));

    expect(post).toHaveBeenLastCalledWith(
      {
        source: "dbml-frame",
        type: "document",
        text: "Table a { id int }",
        tables: null,
        theme: "dark",
      },
      "*",
    );
  });

  it("watches for being seen in the window it was moved to", () => {
    const { view } = setup({ url: FRAME_URL });
    const holder = document.createElement("iframe");

    document.body.append(holder);

    const win = holder.contentWindow as Window & typeof globalThis;

    Object.defineProperty(win, "IntersectionObserver", {
      configurable: true,
      value: FakeObserver,
    });

    const [before] = FakeObserver.made;

    win.document.body.append(view.wrapper);
    view.moveTo(win, "dark");

    expect(before.disconnect).toHaveBeenCalled();
    expect(FakeObserver.made).toHaveLength(2);

    const [, after] = FakeObserver.made;

    expect(after.observed).toEqual([view.wrapper]);

    after.fire(true);

    expect(view.element.getAttribute("src")).toBe(`${FRAME_URL}&theme=dark`);
  });

  // The theme rides in the query so the frame paints in it before the
  // handshake. A frame that loads long after it was built — scrolled to only
  // now — paints the theme the application wears now, not the one it had then.
  it("loads in its document's theme as it is when it loads", () => {
    const { view } = setup({ url: FRAME_URL, theme: "dark" });

    view.setDocument({
      text: "Table a { id int }",
      tables: null,
      theme: "dark",
    });
    view.setTheme("light");
    observer().fire(true);

    expect(view.element.getAttribute("src")).toBe(`${FRAME_URL}&theme=light`);
  });

  it("loads straight away where there is no IntersectionObserver", () => {
    delete (window as { IntersectionObserver?: unknown }).IntersectionObserver;

    const { view } = setup({ url: FRAME_URL, theme: "dark" });

    expect(view.element.getAttribute("src")).toBe(`${FRAME_URL}&theme=dark`);
  });
});

// Dragging a note's tab into another window moves the block's elements there
// without rendering the block again, and the frame reloads in the new window.
describe("FrameView.moveTo", () => {
  type AppWindow = Window & typeof globalThis;

  const DOC = {
    text: "Table a { id int }",
    tables: null,
    theme: "light",
  } as const;

  /** A second window: a jsdom frame's, which has a realm of its own. */
  const otherWindow = (): AppWindow => {
    const holder = document.createElement("iframe");

    document.body.append(holder);

    const win = holder.contentWindow;

    if (win === null) {
      throw new Error("jsdom gave the other window no content");
    }

    return win as AppWindow;
  };

  /** Moves the diagram's wrapper into `win`, as Obsidian does, then tells it. */
  const move = (
    view: FrameView,
    win: AppWindow,
    theme: "light" | "dark" = "light",
  ): Window => {
    win.document.body.append(view.wrapper);
    view.moveTo(win, theme);

    const reloaded = view.element.contentWindow;

    if (reloaded === null) {
      throw new Error("jsdom gave the moved frame no window");
    }

    return reloaded;
  };

  it("answers a hello heard in its new window with ready and its document", () => {
    const { view } = setup();
    const win = otherWindow();

    view.setDocument(DOC);

    const frame = move(view, win);
    const post = jest
      .spyOn(frame, "postMessage")
      .mockImplementation(() => undefined);

    win.dispatchEvent(messageFrom(frame, HELLO));

    expect(post.mock.calls).toEqual([
      [{ source: "dbml-frame", type: "ready" }, "*"],
      [{ source: "dbml-frame", type: "document", ...DOC }, "*"],
    ]);
  });

  it("no longer listens in the window it left", () => {
    const { view } = setup();
    const win = otherWindow();
    const frame = move(view, win);
    const post = jest
      .spyOn(frame, "postMessage")
      .mockImplementation(() => undefined);

    window.dispatchEvent(messageFrom(frame, HELLO));

    expect(post).not.toHaveBeenCalled();
  });

  it("posts as its new window", () => {
    const { view } = setup();
    const win = otherWindow();
    const poster = jest.fn();
    const construct = jest
      .spyOn(win, "Function")
      .mockImplementation(() => poster as never);
    const frame = move(view, win);

    win.dispatchEvent(messageFrom(frame, HELLO));

    expect(construct).toHaveBeenCalledWith(
      "target",
      "message",
      "target.postMessage(message, '*');",
    );
    expect(poster).toHaveBeenCalledWith(frame, {
      source: "dbml-frame",
      type: "ready",
    });
  });

  // The reloaded frame is not listening yet; what changes before it says
  // hello waits for it, as it does for a frame that has just been built.
  it("forgets the old handshake until the reloaded frame says hello", () => {
    const { view, greet } = setup();
    const win = otherWindow();

    view.setDocument(DOC);
    greet();

    const frame = move(view, win);
    const post = jest
      .spyOn(frame, "postMessage")
      .mockImplementation(() => undefined);

    view.setTheme("dark");

    expect(post).not.toHaveBeenCalled();

    win.dispatchEvent(messageFrom(frame, HELLO));

    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "document", theme: "dark" }),
      "*",
    );
  });

  // A moved frame reloads from its `src`, and a `src` written before a theme
  // switch names the old theme: it is written again, in the theme it moved in.
  it("reloads a frame it had loaded in the theme it was moved in", () => {
    const { view } = setup({ url: "about:blank?diagram" });

    view.setDocument(DOC);
    move(view, otherWindow(), "dark");

    expect(view.element.getAttribute("src")).toBe(
      "about:blank?diagram&theme=dark",
    );
  });

  it("stops listening in its new window when destroyed", () => {
    const { view } = setup();
    const win = otherWindow();
    const removed = jest.spyOn(win, "removeEventListener");

    move(view, win);
    view.destroy();

    expect(removed).toHaveBeenCalledWith("message", expect.any(Function));
  });
});
