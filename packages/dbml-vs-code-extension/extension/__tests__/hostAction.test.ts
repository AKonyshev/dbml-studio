import {
  RUN_DIAGRAM_ACTION,
  readDiagramAction,
  runDiagramActionMessage,
  setTypingFocusMessage,
  WebviewCommand,
} from "extension-shared/extension/types/webviewCommand";

const HOST = { name: "the frame above the page" };

describe("readDiagramAction", () => {
  test("takes the action out of a message from the host", () => {
    expect(
      readDiagramAction(
        { data: runDiagramActionMessage("toggleRefs"), source: HOST },
        HOST,
      ),
    ).toBe("toggleRefs");
  });

  test("takes a message whose sender cannot be named at all", () => {
    // Several hosts deliver an extension message with no `source`. Refusing
    // those would close the only way in, and close it silently: every command
    // in the extension would simply stop doing anything.
    expect(
      readDiagramAction({ data: runDiagramActionMessage("fitToView") }, HOST),
    ).toBe("fitToView");
  });

  test("refuses a sender it can name as something other than the host", () => {
    expect(
      readDiagramAction(
        { data: runDiagramActionMessage("fitToView"), source: { other: true } },
        HOST,
      ),
    ).toBeNull();
  });

  test("ignores the other messages the page receives", () => {
    // The schema arrives through the same listener; it must fall through here.
    expect(
      readDiagramAction({ data: { type: "setSchema" }, source: HOST }, HOST),
    ).toBeNull();
    expect(readDiagramAction({ source: HOST }, HOST)).toBeNull();
    expect(readDiagramAction({ data: "not an object" }, HOST)).toBeNull();
    expect(readDiagramAction({ data: null }, HOST)).toBeNull();
  });

  test("refuses an action that is not a name", () => {
    expect(
      readDiagramAction({ data: { type: RUN_DIAGRAM_ACTION } }, HOST),
    ).toBeNull();
    expect(
      readDiagramAction(
        { data: { type: RUN_DIAGRAM_ACTION, action: 7 } },
        HOST,
      ),
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
