import {
  RELATIONS_TOGGLE_EVENT,
  tableRelationsVisibilityStore,
} from "./tableRelationsVisibilityStore";

import eventEmitter from "@/events-emitter";

// Re-exported from where the store defines it: callers reach for the event
// beside the actions that raise it, and moving the definition should not move
// every import.
export { RELATIONS_TOGGLE_EVENT };

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

/**
 * Bring every hidden relation on this document back, in one go.
 *
 * The counterpart to hiding tables one at a time: a reader who has silenced a
 * dozen tables while following one path has no way back other than finding each
 * of them again. It goes through the same store and the same event, so the
 * icons, the dashed outlines and the connections come back the way they went.
 *
 * The event carries no table name, and nothing needs one — every listener reads
 * the store again rather than trusting the payload, which is what lets one
 * announcement stand for any number of tables.
 */
export const showAllTableRelations = (): void => {
  if (!tableRelationsVisibilityStore.showAllTableRelations()) {
    return;
  }

  eventEmitter.emit(RELATIONS_TOGGLE_EVENT);
};
