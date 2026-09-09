import { InteractionMode } from "@/types/interactionMode";

export interface TableClick {
  mode: InteractionMode;
  shiftKey: boolean;
}

export type TableClickIntent =
  /** This table alone becomes what the reader is working on. */
  | { kind: "select" }
  /** Add it to the group, or take it out again. */
  | { kind: "toggle" };

/**
 * What clicking a table means.
 *
 * A click points at the table, in either mode. It used to do that in select
 * mode only, so in the mode the diagram opens in — pan — clicking a table
 * showed nothing at all, and there was no way to say "this one" with the mouse.
 *
 * Extending the group with `Shift` stays a select-mode thing, and that is not
 * an oversight: a group of two or more is what makes a drag move them all, and
 * pan mode is the mode whose whole point is that a drag moves one table or the
 * canvas. So pan mode holds one table at a time, by construction rather than by
 * a rule somebody has to remember.
 */
export const tableClickIntent = (click: TableClick): TableClickIntent =>
  click.shiftKey && click.mode === InteractionMode.Select
    ? { kind: "toggle" }
    : { kind: "select" };
