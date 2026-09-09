import { tableClickIntent } from "../tableClickIntent";

import { InteractionMode } from "@/types/interactionMode";

describe("what clicking a table means", () => {
  test("points at that table alone, in either mode", () => {
    expect(
      tableClickIntent({ mode: InteractionMode.Pan, shiftKey: false }),
    ).toEqual({ kind: "select" });
    expect(
      tableClickIntent({ mode: InteractionMode.Select, shiftKey: false }),
    ).toEqual({ kind: "select" });
  });

  test("extends the group with Shift, in select mode", () => {
    expect(
      tableClickIntent({ mode: InteractionMode.Select, shiftKey: true }),
    ).toEqual({ kind: "toggle" });
  });

  // A group of two or more is what makes one drag move them all, and pan mode
  // is the mode whose whole point is that a drag moves one thing.
  test("keeps pan mode to one table, Shift or no Shift", () => {
    expect(
      tableClickIntent({ mode: InteractionMode.Pan, shiftKey: true }),
    ).toEqual({ kind: "select" });
  });
});
