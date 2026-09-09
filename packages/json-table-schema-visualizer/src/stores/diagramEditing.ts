import type { EditOperation, EditOutcome } from "shared/types/diagramEdit";

export interface DiagramEditingHost {
  /** The current source text of one column, for the popup to open against. */
  readFieldText: (table: string, at: number) => string | null;
  /**
   * The name a rename would actually produce, asked before anything is written.
   *
   * The diagram cannot work it out for itself. What the reader types is not
   * necessarily the whole name: DBML keeps a table in its schema, so renaming
   * `acl.analysis` to `analysis111` yields `acl.analysis111` — and telling that
   * apart from a table whose own name contains a dot needs the parser. The
   * diagram has to know the answer *before* the write, because the write brings
   * back a schema in which the table is already drawn under its new name, and a
   * table reads its position by name when it is drawn.
   *
   * Optional: a host that cannot answer leaves the diagram with the typed text,
   * which is right whenever no schema prefix is in play.
   */
  resolveRenamedTable?: (table: string, newName: string) => string | null;
  submit: (
    operation: EditOperation,
    expectedText?: string,
  ) => Promise<EditOutcome>;
  /**
   * Put one line in front of the reader, in their language.
   *
   * The diagram has nowhere of its own to say anything: it is a canvas, and
   * the one place it does write — the editing box — is shut in exactly the
   * case worth telling them about. The host has the workbench's notifications.
   *
   * Optional, like `resolveRenamedTable`: a host that cannot show a message
   * leaves the diagram doing what it did before, quietly.
   */
  notify?: (message: string) => void;
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

export const setDiagramEditingHost = (
  next: DiagramEditingHost | null,
): void => {
  host = next;
};

export const getDiagramEditingHost = (): DiagramEditingHost | null => host;
