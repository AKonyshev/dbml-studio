import { useCallback, useSyncExternalStore } from "react";

import type { EditOperation, EditOutcome } from "shared/types/diagramEdit";

export interface DiagramEditingHost {
  isEditable: () => boolean;
  /** The current source text of one column, for the popup to open against. */
  readFieldText: (table: string, field: string) => string | null;
  submit: (
    operation: EditOperation,
    expectedText?: string,
  ) => Promise<EditOutcome>;
}

/**
 * Editing is a capability a host lends the diagram, not something the diagram
 * has of its own.
 *
 * The web app and the Antora embed register nothing, so they cannot edit by
 * construction rather than by a flag someone has to remember to unset. It also
 * keeps the diagram ignorant of DBML: it renders a JSON table schema and asks
 * whoever owns the source to change it.
 *
 * A module-level singleton for the reason `diagramActions` is one: there is a
 * single diagram on a page.
 */
let host: DiagramEditingHost | null = null;
const listeners = new Set<() => void>();

export const setDiagramEditingHost = (
  next: DiagramEditingHost | null,
): void => {
  host = next;
  listeners.forEach((listener) => {
    listener();
  });
};

export const getDiagramEditingHost = (): DiagramEditingHost | null => host;

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

export const useIsDiagramEditable = (): boolean => {
  const read = useCallback(() => host !== null && host.isEditable(), []);

  return useSyncExternalStore(subscribe, read, read);
};
