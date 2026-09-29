import { ExpandHost, ExpandHosts } from "../expandHost";

const LOCKED = "dbml-diagram-host--locked";

interface FakeView {
  expanded: boolean;
  setExpanded: (value: boolean) => void;
}

const fakeView = (): FakeView => {
  const view: FakeView = {
    expanded: false,
    setExpanded: (value) => {
      view.expanded = value;
    },
  };

  return view;
};

/**
 * Every host a test makes, put back after it: an expanded host listens for
 * Escape on its document, and a test that ends with one expanded would
 * otherwise leave a listener on the global document for the next to hear.
 */
const made: ExpandHost[] = [];

const newHost = (root: HTMLElement): ExpandHost => {
  const host = new ExpandHost(root);

  made.push(host);

  return host;
};

afterEach(() => {
  for (const host of made.splice(0)) {
    host.collapse();
  }
});

/** Escape as the reader presses it in `doc`; `true` if something claimed it. */
const pressEscape = (doc: Document, key = "Escape"): boolean => {
  const event = new KeyboardEvent("keydown", { key, cancelable: true });

  doc.dispatchEvent(event);

  return event.defaultPrevented;
};

describe("ExpandHost", () => {
  it("expands one and locks the window behind it", () => {
    const root = document.createElement("div");
    const host = newHost(root);
    const view = fakeView();

    host.toggle(view, true);

    expect(view.expanded).toBe(true);
    expect(root.classList.contains(LOCKED)).toBe(true);
  });

  // A note may carry several diagrams, and the reader can reach the toolbar of
  // one that is behind another.
  it("puts the first back when a second one expands", () => {
    const root = document.createElement("div");
    const host = newHost(root);
    const first = fakeView();
    const second = fakeView();

    host.toggle(first, true);
    host.toggle(second, true);

    expect(first.expanded).toBe(false);
    expect(second.expanded).toBe(true);
    expect(root.classList.contains(LOCKED)).toBe(true);
  });

  // The frame asks again if the reader presses its button twice before the
  // answer arrives: the second ask changes nothing, and one collapse is enough.
  it("takes a second request from the expanded one as the first", () => {
    const root = document.createElement("div");
    const host = newHost(root);
    const view = fakeView();

    host.toggle(view, true);
    host.toggle(view, true);

    expect(view.expanded).toBe(true);
    expect(host.collapse()).toBe(true);
    expect(view.expanded).toBe(false);
    expect(root.classList.contains(LOCKED)).toBe(false);
  });

  it("unlocks the window when the expanded one goes back", () => {
    const root = document.createElement("div");
    const host = newHost(root);
    const view = fakeView();

    host.toggle(view, true);
    host.toggle(view, false);

    expect(view.expanded).toBe(false);
    expect(root.classList.contains(LOCKED)).toBe(false);
  });

  it("ignores a request to go back from one that is not expanded", () => {
    const root = document.createElement("div");
    const host = newHost(root);
    const expanded = fakeView();
    const other = fakeView();

    host.toggle(expanded, true);
    host.toggle(other, false);

    expect(expanded.expanded).toBe(true);
    expect(root.classList.contains(LOCKED)).toBe(true);
  });

  // Obsidian re-renders blocks on every edit: another block going away must
  // not put back the diagram the reader is looking at.
  it("leaves the expanded one alone when another diagram is released", () => {
    const root = document.createElement("div");
    const host = newHost(root);
    const expanded = fakeView();
    const other = fakeView();

    host.toggle(expanded, true);
    host.release(other);

    expect(expanded.expanded).toBe(true);
    expect(root.classList.contains(LOCKED)).toBe(true);
  });

  it("puts back and unlocks when the expanded one is released", () => {
    const root = document.createElement("div");
    const host = newHost(root);
    const view = fakeView();

    host.toggle(view, true);
    host.release(view);

    expect(view.expanded).toBe(false);
    expect(root.classList.contains(LOCKED)).toBe(false);
  });

  // The window's Escape handler claims the key only when this says so.
  it("says whether collapsing found anything to collapse", () => {
    const root = document.createElement("div");
    const host = newHost(root);
    const view = fakeView();

    expect(host.collapse()).toBe(false);

    host.toggle(view, true);

    expect(host.collapse()).toBe(true);
    expect(view.expanded).toBe(false);
    expect(host.collapse()).toBe(false);
  });
});

// Each test here draws in a document of its own, the way a popout window has
// one, so a key pressed in one document can be told from a key pressed in
// another.
describe("ExpandHost, Escape", () => {
  const newDocument = (): Document =>
    document.implementation.createHTMLDocument("popout");

  // The frame handles Escape itself while the focus is inside it; this is for
  // when the reader has clicked outside it.
  it("puts the expanded one back on Escape in its own document, and claims the key", () => {
    const doc = newDocument();
    const host = newHost(doc.documentElement);
    const view = fakeView();

    host.toggle(view, true);

    expect(pressEscape(doc, "Enter")).toBe(false);
    expect(view.expanded).toBe(true);

    expect(pressEscape(doc)).toBe(true);
    expect(view.expanded).toBe(false);
    expect(doc.documentElement.classList.contains(LOCKED)).toBe(false);
  });

  // Obsidian uses Escape for its own things; the key is left to it whenever
  // there is no diagram to put back — before any expands, and after.
  it("leaves Escape alone when nothing is expanded", () => {
    const doc = newDocument();
    const host = newHost(doc.documentElement);
    const view = fakeView();

    expect(pressEscape(doc)).toBe(false);

    host.toggle(view, true);
    host.toggle(view, false);

    expect(pressEscape(doc)).toBe(false);
  });

  // A keydown in a popout window never reaches the main one, and the other
  // way round: the listener belongs to the document the diagram is drawn in.
  it("does not hear Escape pressed in another window", () => {
    const doc = newDocument();
    const host = newHost(doc.documentElement);
    const view = fakeView();

    host.toggle(view, true);

    expect(pressEscape(document)).toBe(false);
    expect(view.expanded).toBe(true);
  });
});

describe("ExpandHosts", () => {
  it("gives every diagram in one window the same host", () => {
    const hosts = new ExpandHosts();
    const doc = document.implementation.createHTMLDocument("main");

    expect(hosts.of(doc)).toBe(hosts.of(doc));
  });

  // An expanded diagram covers only its own window, so one in another window
  // is not behind it — and the reader did not ask for it to be put back.
  it("keeps a diagram expanded in each of two windows", () => {
    const hosts = new ExpandHosts();
    const main = document.implementation.createHTMLDocument("main");
    const popout = document.implementation.createHTMLDocument("popout");
    const inMain = fakeView();
    const inPopout = fakeView();

    hosts.of(main).toggle(inMain, true);
    hosts.of(popout).toggle(inPopout, true);

    expect(inMain.expanded).toBe(true);
    expect(inPopout.expanded).toBe(true);
    expect(main.documentElement.classList.contains(LOCKED)).toBe(true);
    expect(popout.documentElement.classList.contains(LOCKED)).toBe(true);

    hosts.of(popout).release(inPopout);

    expect(inMain.expanded).toBe(true);
    expect(main.documentElement.classList.contains(LOCKED)).toBe(true);
    expect(popout.documentElement.classList.contains(LOCKED)).toBe(false);

    hosts.of(main).collapse();
  });
});
