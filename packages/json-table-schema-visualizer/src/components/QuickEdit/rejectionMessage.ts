import type { EditRejection } from "shared/types/diagramEdit";

import { type MessageKey } from "@/i18n/messages";
import { t } from "@/i18n/t";

/**
 * A rejection in the reader's own language, with the parser's own words kept
 * verbatim underneath. The parser speaks English only, and paraphrasing a
 * syntax error into another language would lose the part that says where.
 *
 * Its own module because a refusal now reaches the reader two ways: under the
 * editing box, and through the host when the key that was refused was pressed
 * with no box open at all.
 */
export const messageForRejection = (reason: EditRejection): string => {
  if (reason.code === "parseError") {
    return `${t("quickEdit.rejected")} ${reason.message}`;
  }

  return t(`quickEdit.${reason.code}` as MessageKey);
};
