import { LayoutListIcon } from "lucide-react";

import ToolbarButton from "../Button";

import { shortcutKeyFor } from "@/constants/shortcuts";
import { t } from "@/i18n/t";
import { useHasTableDetailLevelOverrides } from "@/hooks/tableDetailLevelOverride";
import { tableDetailLevelStore } from "@/stores/tableDetailLevelStore";

/**
 * Give every table the diagram's own detail level back.
 *
 * The counterpart to setting one table apart, and the only way back that does
 * not mean finding each of them again — a table keeps the level it was given
 * while `D` moves everything around it, which is the point of setting it apart
 * and also what makes it easy to lose track of.
 *
 * Always in the toolbar rather than appearing with the first table set apart:
 * the buttons around it would shift under the pointer otherwise. Disabled
 * instead, which still carries the tooltip explaining what it would do. See
 * `ShowAllRelations`, which is the same shape for the same reasons.
 */
const ResetDetailLevels = () => {
  const hasOverrides = useHasTableDetailLevelOverrides();

  return (
    <ToolbarButton
      label={t("action.resetTableDetailLevels")}
      shortcutKey={shortcutKeyFor("resetTableDetailLevels")}
      disabled={!hasOverrides}
      onClick={() => {
        tableDetailLevelStore.resetAll();
      }}
    >
      <LayoutListIcon />
    </ToolbarButton>
  );
};

export default ResetDetailLevels;
