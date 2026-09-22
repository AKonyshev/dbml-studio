import { expandMessage, helloMessage, parseHostMessage } from "../frameHost";

describe("the frame's half of the protocol", () => {
  it("announces itself", () => {
    expect(helloMessage()).toEqual({ source: "dbml-frame", type: "hello" });
  });

  it("asks to be expanded and to be put back", () => {
    expect(expandMessage(true)).toEqual({
      source: "dbml-frame",
      type: "expand",
      expanded: true,
    });
    expect(expandMessage(false)).toEqual({
      source: "dbml-frame",
      type: "expand",
      expanded: false,
    });
  });
});

describe("parseHostMessage", () => {
  it("reads the answer to hello", () => {
    expect(parseHostMessage({ source: "dbml-frame", type: "ready" })).toEqual({
      source: "dbml-frame",
      type: "ready",
    });
  });

  it("reads the state the host settled on", () => {
    expect(
      parseHostMessage({
        source: "dbml-frame",
        type: "expanded",
        expanded: true,
      }),
    ).toEqual({ source: "dbml-frame", type: "expanded", expanded: true });

    expect(
      parseHostMessage({
        source: "dbml-frame",
        type: "expanded",
        expanded: false,
      }),
    ).toEqual({ source: "dbml-frame", type: "expanded", expanded: false });
  });

  it("refuses the frame's own messages", () => {
    // Not a hypothetical: a frame opened straight from the address bar has
    // `window.parent === window`, so its own hello arrives back at it. Taking
    // that for an answer would show an expand button on a page with no host to
    // expand anything.
    expect(parseHostMessage(helloMessage())).toBeNull();
    expect(parseHostMessage(expandMessage(true))).toBeNull();
  });

  it("refuses traffic that is not ours", () => {
    expect(parseHostMessage({ type: "ready" })).toBeNull();
    expect(parseHostMessage({ source: "webpack", type: "ready" })).toBeNull();
    expect(
      parseHostMessage({ source: "dbml-frame", type: "nonsense" }),
    ).toBeNull();
  });

  it("refuses a state that is not a state", () => {
    expect(
      parseHostMessage({ source: "dbml-frame", type: "expanded" }),
    ).toBeNull();
    expect(
      parseHostMessage({
        source: "dbml-frame",
        type: "expanded",
        expanded: "yes",
      }),
    ).toBeNull();
  });

  it("reads a model the host pushed", () => {
    expect(
      parseHostMessage({
        source: "dbml-frame",
        type: "document",
        text: "Table a { id integer }",
        tables: ["a"],
        theme: "dark",
      }),
    ).toEqual({
      source: "dbml-frame",
      type: "document",
      text: "Table a { id integer }",
      tables: ["a"],
      theme: "dark",
    });
  });

  it("reads a pushed model with no filter on it", () => {
    expect(
      parseHostMessage({
        source: "dbml-frame",
        type: "document",
        text: "Table a { id integer }",
        tables: null,
        theme: "light",
      }),
    ).toEqual({
      source: "dbml-frame",
      type: "document",
      text: "Table a { id integer }",
      tables: null,
      theme: "light",
    });
  });

  // A host is a program, but the frame is the thing left holding a half-written
  // message: a plugin under development sends these by hand long before it sends
  // them right.
  it("refuses a pushed model that is not one", () => {
    const base = { source: "dbml-frame", type: "document", theme: "light" };

    expect(parseHostMessage({ ...base, tables: null })).toBeNull();
    expect(parseHostMessage({ ...base, text: 1, tables: null })).toBeNull();
    expect(parseHostMessage({ ...base, text: "a", tables: "a" })).toBeNull();
    expect(parseHostMessage({ ...base, text: "a", tables: [1] })).toBeNull();
    expect(
      parseHostMessage({
        source: "dbml-frame",
        type: "document",
        text: "a",
        tables: null,
        theme: "sepia",
      }),
    ).toBeNull();
  });

  it("reads the theme the host settled on", () => {
    expect(
      parseHostMessage({ source: "dbml-frame", type: "theme", theme: "dark" }),
    ).toEqual({ source: "dbml-frame", type: "theme", theme: "dark" });

    expect(
      parseHostMessage({ source: "dbml-frame", type: "theme", theme: "light" }),
    ).toEqual({ source: "dbml-frame", type: "theme", theme: "light" });
  });

  // A theme the frame does not have is not a reason to repaint at random: the
  // page carries whatever its author chose, and the frame keeps what it has.
  it("refuses a theme it does not know", () => {
    expect(
      parseHostMessage({ source: "dbml-frame", type: "theme", theme: "sepia" }),
    ).toBeNull();
    expect(
      parseHostMessage({ source: "dbml-frame", type: "theme" }),
    ).toBeNull();
  });

  it("refuses what is not an object at all", () => {
    for (const value of [null, undefined, "ready", 7, []]) {
      expect(parseHostMessage(value)).toBeNull();
    }
  });
});
