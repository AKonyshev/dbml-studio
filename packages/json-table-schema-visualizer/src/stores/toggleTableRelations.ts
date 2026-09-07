import { tableRelationsVisibilityStore } from "./tableRelationsVisibilityStore";

import eventEmitter from "@/events-emitter";

export const RELATIONS_TOGGLE_EVENT = "on:table:relations:toggle";

/**
 * Hide or show one table's relations on the canvas.
 *
 * The one way this state changes, so the header button and the keyboard
 * cannot drift apart: both land here, and everything watching the event — the
 * icon, the table's dashed outline, the connections — reacts the same either
 * way. Nothing is written to the schema file; this lives in the per-document
 * store alone.
 */
export const toggleTableRelations = (tableName: string): void => {
  if (tableName === "") {
    return;
  }

  tableRelationsVisibilityStore.toggleTableRelations(tableName);
  eventEmitter.emit(RELATIONS_TOGGLE_EVENT, tableName);
};
