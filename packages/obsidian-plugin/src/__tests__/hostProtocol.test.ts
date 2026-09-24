import {
  documentMessage,
  expandedMessage,
  parseFrameMessage,
  readyMessage,
  themeMessage,
} from "../hostProtocol";

describe("the host's half of the protocol", () => {
  it("answers hello", () => {
    expect(readyMessage()).toEqual({ source: "dbml-frame", type: "ready" });
  });

  it("says what it settled on", () => {
    expect(expandedMessage(true)).toEqual({
      source: "dbml-frame",
      type: "expanded",
      expanded: true,
    });
  });

  it("hands over a model", () => {
    expect(documentMessage("Table a { id int }", ["a"], "dark")).toEqual({
      source: "dbml-frame",
      type: "document",
      text: "Table a { id int }",
      tables: ["a"],
      theme: "dark",
    });
  });

  it("says the lights went off", () => {
    expect(themeMessage("dark")).toEqual({
      source: "dbml-frame",
      type: "theme",
      theme: "dark",
    });
  });
});

describe("parseFrameMessage", () => {
  it("reads the frame's hello", () => {
    expect(parseFrameMessage({ source: "dbml-frame", type: "hello" })).toEqual({
      source: "dbml-frame",
      type: "hello",
    });
  });

  it("reads a request to expand and to go back", () => {
    expect(
      parseFrameMessage({
        source: "dbml-frame",
        type: "expand",
        expanded: true,
      }),
    ).toEqual({ source: "dbml-frame", type: "expand", expanded: true });
    expect(
      parseFrameMessage({
        source: "dbml-frame",
        type: "expand",
        expanded: false,
      }),
    ).toEqual({ source: "dbml-frame", type: "expand", expanded: false });
  });

  // A note's window carries any number of other frames and scripts, and the
  // host's own messages are not the frame's.
  it("refuses everything else", () => {
    expect(parseFrameMessage(readyMessage())).toBeNull();
    expect(parseFrameMessage(documentMessage("a", null, "light"))).toBeNull();
    expect(parseFrameMessage(themeMessage("light"))).toBeNull();
    expect(parseFrameMessage({ type: "hello" })).toBeNull();
    expect(parseFrameMessage({ source: "webpack", type: "hello" })).toBeNull();
    expect(
      parseFrameMessage({ source: "dbml-frame", type: "expand" }),
    ).toBeNull();
    expect(parseFrameMessage(null)).toBeNull();
    expect(parseFrameMessage("hello")).toBeNull();
    expect(parseFrameMessage(["dbml-frame"])).toBeNull();
  });
});
