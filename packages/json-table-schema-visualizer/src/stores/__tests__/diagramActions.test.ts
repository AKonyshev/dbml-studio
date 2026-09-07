import {
  DIAGRAM_ACTION_IDS,
  isDiagramActionId,
  runDiagramAction,
  setDiagramActions,
  type DiagramActionHandlers,
} from "../diagramActions";

const handlers = (): {
  calls: string[];
  map: DiagramActionHandlers;
} => {
  const calls: string[] = [];
  const map = Object.fromEntries(
    DIAGRAM_ACTION_IDS.map((id) => [
      id,
      () => {
        calls.push(id);
      },
    ]),
  ) as DiagramActionHandlers;

  return { calls, map };
};

afterEach(() => {
  setDiagramActions(null);
});

describe("diagram action registry", () => {
  test("runs the registered handler and says so", () => {
    const { calls, map } = handlers();
    setDiagramActions(map);

    expect(runDiagramAction("toggleRefs")).toBe(true);
    expect(calls).toEqual(["toggleRefs"]);
  });

  test("ignores an id no action answers to", () => {
    const { calls, map } = handlers();
    setDiagramActions(map);

    expect(runDiagramAction("closeLegend")).toBe(false);
    expect(runDiagramAction("somethingElse")).toBe(false);
    expect(calls).toEqual([]);
  });

  test("runs nothing once the handlers are withdrawn", () => {
    const { calls, map } = handlers();
    setDiagramActions(map);
    setDiagramActions(null);

    expect(runDiagramAction("fitToView")).toBe(false);
    expect(calls).toEqual([]);
  });

  test("reads the gate at the call, not at registration", () => {
    const { calls, map } = handlers();
    let open = false;
    setDiagramActions(map, () => !open);

    expect(runDiagramAction("legend")).toBe(true);
    open = true;
    expect(runDiagramAction("legend")).toBe(false);
    expect(calls).toEqual(["legend"]);
  });

  test("every executable shortcut is an action id", () => {
    expect(DIAGRAM_ACTION_IDS).toContain("toggleRefs");
    DIAGRAM_ACTION_IDS.forEach((id) => {
      expect(isDiagramActionId(id)).toBe(true);
    });
  });
});
