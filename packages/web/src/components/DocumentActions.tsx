import { t } from "json-table-schema-visualizer/src/i18n/t";

import type { JSX } from "react";

export interface DocumentActionsProps {
  onDownload: () => void;
  onWriteLayout: () => void;
}

const BUTTON_CLASS =
  "rounded-lg px-2.5 py-1 text-sm text-content-muted transition-colors hover:bg-accent/10 hover:text-content focus:outline-none focus-visible:ring-1 focus-visible:ring-accent";

/**
 * The two actions the site adds to the diagram's toolbar, through the slot the
 * viewer offers hosts.
 *
 * Downloading is also on every row of the file tree, and deliberately so: a
 * schema that does not parse has no diagram, so no toolbar — which is exactly
 * the moment someone wants their text out of the page. The row is the promise;
 * this is the convenience of having it where the reader is already looking.
 */
const DocumentActions = ({
  onDownload,
  onWriteLayout,
}: DocumentActionsProps): JSX.Element => (
  <>
    <button
      type="button"
      title={t("action.downloadFile.hint")}
      className={BUTTON_CLASS}
      onClick={onDownload}
    >
      {t("action.downloadFile")}
    </button>
    {/* Deliberately a button and not something that happens by itself.
        Dragging a table writes nothing: the extension rewrites a file that is
        not on screen, whereas here the text is right there, and an automatic
        write would put every drag into the editor's undo history — so Ctrl+Z
        would take back where a table was dropped instead of what was typed.
        The positions are still remembered without asking, in browser storage. */}
    <button
      type="button"
      title={t("action.writeLayout.hint")}
      className={BUTTON_CLASS}
      onClick={onWriteLayout}
    >
      {t("action.writeLayout")}
    </button>
  </>
);

export default DocumentActions;
