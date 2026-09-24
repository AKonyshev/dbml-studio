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
