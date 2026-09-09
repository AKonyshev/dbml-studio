import { useEffect } from "react";

import Notation from "./Notation";

import { t } from "@/i18n/t";
import { displayKeyOf, SHORTCUTS } from "@/constants/shortcuts";

interface ShortcutsLegendProps {
  onClose: () => void;
  /**
   * Whether the keys below are defaults the host owns rather than what the page
   * itself listens for.
   *
   * True inside VS Code, where every one of them is a command the reader can
   * rebind and there is no API to ask what they rebound it to. Saying so is the
   * honest version of a list that would otherwise quietly claim a key that no
   * longer does anything.
   */
  keysAreDefaults?: boolean;
}

const ShortcutsLegend = ({
  onClose,
  keysAreDefaults = false,
}: ShortcutsLegendProps) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        // See `ExportMenu`: an Escape that closed this is not an Escape going
        // spare.
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        // `max-h-full` and its scroll: this box is as tall as its two sections
        // make it, and the space it has is the diagram's — which for the frame
        // embedded in a documentation page is whatever height the author gave
        // it. Without these the legend runs off both ends of a short frame and
        // the reader cannot reach the half they opened it for.
        className="flex max-h-full min-w-[320px] flex-col gap-5 overflow-y-auto rounded-2xl border border-subtle bg-surface-raised p-6 shadow-2xl shadow-black/20"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <section>
          <h2 className="mb-4 text-sm font-semibold text-content">
            {t("legend.notation")}
          </h2>

          <Notation />
        </section>

        <section>
          <h2 className="mb-4 text-sm font-semibold text-content">
            {t("legend.shortcuts")}
          </h2>

          <ul className="flex flex-col gap-2">
            {SHORTCUTS.map((shortcut) => (
              <li
                key={shortcut.id}
                className="flex items-center justify-between gap-6 text-xs text-content"
              >
                <span>{t(shortcut.labelKey)}</span>
                <kbd className="rounded-md border border-subtle bg-surface-sunken px-2 py-1 font-mono text-content-muted">
                  {displayKeyOf(shortcut)}
                </kbd>
              </li>
            ))}
          </ul>

          {keysAreDefaults && (
            <p className="mt-4 text-xs text-content-muted">
              {t("legend.keysAreDefaults")}
            </p>
          )}
        </section>
      </div>
    </div>
  );
};

export default ShortcutsLegend;
