import { useEffect, useState } from "react";

import { tableRelationsVisibilityStore } from "@/stores/tableRelationsVisibilityStore";
import {
  RELATIONS_TOGGLE_EVENT,
  toggleTableRelations,
} from "@/stores/toggleTableRelations";
import eventEmitter from "@/events-emitter";

export function useTableRelationsVisibility(tableName: string): {
  isHidden: boolean;
  toggle: () => void;
} {
  const [isHidden, setIsHidden] = useState(() =>
    tableRelationsVisibilityStore.areTableRelationsHidden(tableName),
  );

  useEffect(() => {
    const sync = (): void => {
      setIsHidden(
        tableRelationsVisibilityStore.areTableRelationsHidden(tableName),
      );
    };
    // Resync after Connections has called store.switchTo(documentKey) on mount
    // (Connections renders before the tables, so its effect runs first), so a
    // persisted-hidden table reflects correctly on first load.
    sync();
    eventEmitter.on(RELATIONS_TOGGLE_EVENT, sync);
    return () => {
      eventEmitter.off(RELATIONS_TOGGLE_EVENT, sync);
    };
  }, [tableName]);

  // The shared toggle, so the button and the keyboard cannot diverge. The event it
  // emits is what the effect above is listening for, which is also how a table
  // learns that the keyboard toggled it rather than its own icon.
  const toggle = (): void => {
    toggleTableRelations(tableName);
  };

  return { isHidden, toggle };
}
