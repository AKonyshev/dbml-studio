import { planEdit, type TextEdit } from "dbml-to-json-table-schema";

import type { ApplyDiagramEditMessage } from "../types/webviewCommand";
import type { EditOutcome } from "shared/types/diagramEdit";

/** Just enough of a `TextDocument` to decide and to read. */
export interface EditableDocument {
  getText: () => string;
  isUntitled: boolean;
  isClosed: boolean;
  languageId: string;
}

export interface ApplyDeps {
  openDocument: (uri: string) => Promise<EditableDocument | null>;
  applyEdit: (
    document: EditableDocument,
    edits: TextEdit[],
  ) => Promise<boolean>;
}

/**
 * The only thing that turns a diagram's intent into characters in a file.
 *
 * The order is the whole point. The document is read here and now, the text the
 * popup started from is checked against it, the candidate is proved to parse,
 * and only then is anything written. A rejection at any of those steps leaves
 * the file exactly as it was.
 */
export const applyDiagramEdit = async (
  request: ApplyDiagramEditMessage,
  deps: ApplyDeps,
): Promise<EditOutcome> => {
  const document = await deps.openDocument(request.documentUri);
  if (document === null || document.isUntitled || document.isClosed) {
    return { ok: false, reason: { code: "notEditable" } };
  }

  const plan = planEdit(
    document.getText(),
    request.operation,
    request.expectedText,
  );
  if (!plan.ok) return { ok: false, reason: plan.reason };

  const written = await deps.applyEdit(document, plan.edits);
  if (!written) return { ok: false, reason: { code: "notEditable" } };

  return { ok: true, table: plan.table, field: plan.field };
};
