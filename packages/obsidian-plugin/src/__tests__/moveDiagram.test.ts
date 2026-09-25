import { ExpandHosts } from "../expandHost";
import { FrameView } from "../frameView";
import { moveDiagram, type MovableDiagram } from "../moveDiagram";

type AppWindow = Window & typeof globalThis;

const HELLO = { source: "dbml-frame", type: "hello" };
const LOCKED = "dbml-diagram-host--locked";

const messageFrom = (source: Window, data: unknown): MessageEvent => {
  const event = new MessageEvent("message", { data });

  Object.defineProperty(event, "source", { value: source });

  return event;
};

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

const diagramIn = (
  hosts: ExpandHosts,
  pinnedTheme: MovableDiagram["pinnedTheme"] = null,
): MovableDiagram => {
  const container = document.createElement("div");

  document.body.append(container);

  const diagram: MovableDiagram = {
    view: new FrameView({
      container,
      url: "about:blank",
      height: 500,
      title: "rd.dbml",
      messageTarget: window,
      onExpand: (expanded) => {
        diagram.expandHost.toggle(diagram.view, expanded);
      },
    }),
    expandHost: hosts.of(document),
    pinnedTheme,
  };

  diagram.view.setDocument({
    text: "Table a { id int }",
    tables: null,
    theme: "light",
  });

  return diagram;
};

/** Moves the wrapper as Obsidian does, then the diagram; the frame reloads. */
const move = (
  diagram: MovableDiagram,
  win: AppWindow,
  hosts: ExpandHosts,
  appBody: HTMLElement,
): { frame: Window; post: jest.SpyInstance } => {
  win.document.body.append(diagram.view.wrapper);
  moveDiagram(diagram, win, hosts, appBody);

  const frame = diagram.view.element.contentWindow;

  if (frame === null) {
    throw new Error("jsdom gave the moved frame no window");
  }

  const post = jest
    .spyOn(frame, "postMessage")
    .mockImplementation(() => undefined);

  return { frame, post };
};

const appBody = (theme: string): HTMLElement => {
  const body = document.createElement("body");

  body.className = `theme-${theme}`;

  return body;
};

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.className = "";
  jest.restoreAllMocks();
});

describe("moveDiagram", () => {
  it("takes an expanded diagram back and unlocks the window it left", () => {
    const hosts = new ExpandHosts();
    const diagram = diagramIn(hosts);
    const win = otherWindow();

    diagram.expandHost.toggle(diagram.view, true);
    expect(document.documentElement.classList.contains(LOCKED)).toBe(true);

    move(diagram, win, hosts, appBody("light"));

    expect(document.documentElement.classList.contains(LOCKED)).toBe(false);
    expect(
      diagram.view.wrapper.classList.contains("dbml-diagram--expanded"),
    ).toBe(false);
  });

  it("expands in the window it moved to, locking that one", () => {
    const hosts = new ExpandHosts();
    const diagram = diagramIn(hosts);
    const win = otherWindow();

    move(diagram, win, hosts, appBody("light"));

    expect(diagram.expandHost).toBe(hosts.of(win.document));

    diagram.expandHost.toggle(diagram.view, true);

    expect(win.document.documentElement.classList.contains(LOCKED)).toBe(true);
    expect(document.documentElement.classList.contains(LOCKED)).toBe(false);
  });

  it("greets the reloaded frame with its model in the application's theme", () => {
    const hosts = new ExpandHosts();
    const diagram = diagramIn(hosts);
    const win = otherWindow();
    const { frame, post } = move(diagram, win, hosts, appBody("dark"));

    win.dispatchEvent(messageFrom(frame, HELLO));

    expect(post.mock.calls).toEqual([
      [{ source: "dbml-frame", type: "ready" }, "*"],
      [
        {
          source: "dbml-frame",
          type: "document",
          text: "Table a { id int }",
          tables: null,
          theme: "dark",
        },
        "*",
      ],
    ]);
  });

  it("keeps a pinned theme", () => {
    const hosts = new ExpandHosts();
    const diagram = diagramIn(hosts, "light");
    const win = otherWindow();
    const { frame, post } = move(diagram, win, hosts, appBody("dark"));

    win.dispatchEvent(messageFrom(frame, HELLO));

    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "document", theme: "light" }),
      "*",
    );
  });
});
