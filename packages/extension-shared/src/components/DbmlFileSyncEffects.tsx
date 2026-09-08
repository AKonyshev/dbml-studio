import { useDbmlMetaInfoSync } from "../hooks/dbmlMetaInfoSync";
import { useDiagramEditingHost } from "../hooks/diagramEditingHost";

interface DbmlFileSyncEffectsProps {
  rawContent: string | null;
  documentKey: string | null;
  editable: boolean;
}

// Writes table positions back into the open file. Hiding a table's relations is
// deliberately not here: that is a view preference, kept per document by the
// viewer, and it never touches the schema text.
const DbmlFileSyncEffects = ({
  rawContent,
  documentKey,
  editable,
}: DbmlFileSyncEffectsProps) => {
  useDbmlMetaInfoSync(true, documentKey);
  useDiagramEditingHost(editable, rawContent, documentKey);

  return null;
};

export default DbmlFileSyncEffects;
