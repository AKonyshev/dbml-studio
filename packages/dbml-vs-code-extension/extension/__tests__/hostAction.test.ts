import {
  RUN_DIAGRAM_ACTION,
  readDiagramAction,
  runDiagramActionMessage,
  setTypingFocusMessage,
  WebviewCommand,
} from "extension-shared/extension/types/webviewCommand";

describe("readDiagramAction", () => {
  test("takes the action out of the message, whoever sent it", () => {
    // Measured inside a real VS Code webview: the sender is the shell frame
    // between the page and the workbench. It is neither the page's `parent`
    // nor its `top` nor itself, and the page holds no reference to it — so a
    // guard comparing windows rejected the one message that matters, and every
    // diagram command in VS Code silently did nothing. The sender is no longer
    // looked at, which is what this asserts: an unrecognisable one is fine, and
    // so is a message that carries no sender at all.
    expect(
      readDiagramAction({
        data: runDiagramActionMessage("toggleRefs"),
        source: { aFrameWeCannotName: true },
      } as { data: unknown }),
    ).toBe("toggleRefs");

    expect(
      readDiagramAction({ data: runDiagramActionMessage("fitToView") }),
    ).toBe("fitToView");
  });

  test("ignores the other messages the page receives", () => {
    // The schema arrives through the same listener; it must fall through here.
    expect(readDiagramAction({ data: { type: "setSchema" } })).toBeNull();
    expect(readDiagramAction({} as { data: unknown })).toBeNull();
    expect(readDiagramAction({ data: "not an object" })).toBeNull();
    expect(readDiagramAction({ data: null })).toBeNull();
  });

  test("refuses an action that is not a name", () => {
    // The type alone is not enough: what keeps this narrow is the name, which
    // `runDiagramAction` then matches against the actions the diagram declares.
    expect(
      readDiagramAction({ data: { type: RUN_DIAGRAM_ACTION } }),
    ).toBeNull();
    expect(
      readDiagramAction({ data: { type: RUN_DIAGRAM_ACTION, action: 7 } }),
    ).toBeNull();
  });
});

describe("setTypingFocusMessage", () => {
  test("is the command the extension listens for", () => {
    expect(setTypingFocusMessage(true)).toEqual({
      command: WebviewCommand.SET_TYPING_FOCUS,
      typing: true,
    });
  });
});
