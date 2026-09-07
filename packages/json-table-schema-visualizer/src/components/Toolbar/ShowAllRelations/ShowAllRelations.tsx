import { Link2Icon } from "lucide-react";

import ToolbarButton from "../Button";

import { shortcutKeyFor } from "@/constants/shortcuts";
import { t } from "@/i18n/t";
import { useHasHiddenRelations } from "@/hooks/tableRelationsVisibility";
import { showAllTableRelations } from "@/stores/toggleTableRelations";

/**
 * Undo every hiding at once.
 *
 * Relations are hidden one table at a time, from the table's own header, so the
 * way back was as many clicks as the way in — and the reader had to remember
 * which tables they had silenced, which is exactly what a diagram is for.
 *
 * Always in the toolbar rather than appearing with the first hidden table: the
 * buttons around it would shift under the pointer otherwise. Disabled instead,
 * which still carries the tooltip explaining what it would do.
 */
const ShowAllRelations = () => {
  const hasHidden = useHasHiddenRelations();

  return (
    <ToolbarButton
      label={t("action.showAllRefs")}
      shortcutKey={shortcutKeyFor("showAllRefs")}
      disabled={!hasHidden}
      onClick={showAllTableRelations}
    >
      <Link2Icon />
    </ToolbarButton>
  );
};

export default ShowAllRelations;
