import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type JSX } from "react";
import { t } from "json-table-schema-visualizer/src/i18n/t";

export interface FileRowAction {
  label: string;
  run: () => void;
}

export interface FileRowProps {
  label: string;
  /** The full path, or nothing when the row is a file with no path to show. */
  hint?: string;
  /** Drawn before the name: what kind of thing this row is. */
  icon: ReactNode;
  depth: number;
  selected: boolean;
  /** The reader has their own version of this file. */
  edited: boolean;
  /** Said on the row it happened on, rather than somewhere the reader is not looking. */
  failed: boolean;
  actions: FileRowAction[];
  onOpen: () => void;
}

export const ROW_CLASS =
  "flex h-8 w-full items-center gap-2 truncate rounded-lg pr-1 text-left text-sm transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent";

/** Every one-glyph button in the tree: collapse, reveal, add, the row's menu. */
export const ICON_BUTTON_CLASS =
  "rounded-lg p-1 text-content-muted transition-colors hover:bg-accent/10 hover:text-content focus:outline-none focus-visible:ring-1 focus-visible:ring-accent";

/**
 * One file in the tree: what it is called, whether it is yours, and what can be
 * done to it.
 *
 * The menu is opened by a button rather than by right-clicking. The context menu
 * belongs to the browser, and a reader who wants to copy a name or open
 * something in a new tab should keep it.
 */
const FileRow = ({
  label,
  hint,
  icon,
  depth,
  selected,
  edited,
  failed,
  actions,
  onOpen,
}: FileRowProps): JSX.Element => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // A menu that stays open after the reader has moved on is a menu covering
  // rows they are trying to read.
  useEffect(() => {
    if (!open) {
      return;
    }

    const close = (event: MouseEvent): void => {
      if (containerRef.current?.contains(event.target as Node) !== true) {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", close);
    return () => {
      window.removeEventListener("mousedown", close);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative px-2">
      <div
        className={`group flex items-center rounded-lg ${
          selected ? "bg-accent/15" : "hover:bg-accent/10"
        }`}
      >
        <button
          type="button"
          aria-current={selected}
          // The path and the state, as the row's description rather than its
          // name. A name that grew a "changed" marker would rename the row the
          // moment somebody typed in it — for a screen reader, and for anything
          // else that finds a row by what it is called.
          title={[hint ?? label, edited ? t("files.edited") : null]
            .filter((part) => part !== null)
            .join(" — ")}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          className={`${ROW_CLASS} ${
            selected ? "font-medium text-content" : "text-content-muted"
          }`}
          onClick={onOpen}
        >
          <span
            className={`shrink-0 ${selected ? "text-accent" : "text-content-muted/70"} [&_svg]:h-4 [&_svg]:w-4`}
          >
            {icon}
          </span>
          <span className="truncate">{label}</span>
          {edited && (
            // A dot rather than a word: it has to sit beside names that already
            // fill the column. Hidden from the accessibility tree because the
            // same fact is in the row's description, where it does not change
            // what the row is called.
            <span
              aria-hidden="true"
              className="ml-auto mr-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
            />
          )}
          {failed && (
            <span className="ml-auto shrink-0 text-xs text-danger">
              {t("files.openFailed")}
            </span>
          )}
        </button>
        <button
          type="button"
          title={t("files.actions")}
          aria-label={`${t("files.actions")}: ${label}`}
          aria-expanded={open}
          className={`${ICON_BUTTON_CLASS} shrink-0 ${
            open || selected ? "" : "opacity-0 group-hover:opacity-100"
          } focus-visible:opacity-100`}
          onClick={() => {
            setOpen((current) => !current);
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      {open && (
        // `menu`/`menuitem` rather than a bare list of buttons: it is what the
        // thing is, it tells a screen reader that the page has opened something
        // over the row, and it gives every caller a way to say "the Download in
        // this menu" rather than "one of the two Downloads on the page".
        <ul
          role="menu"
          aria-label={`${t("files.actions")}: ${label}`}
          className="absolute right-2 z-10 mt-1 min-w-44 list-none overflow-hidden rounded-xl border border-subtle bg-surface-raised py-1 shadow-xl shadow-black/10"
        >
          {actions.map((action) => (
            <li key={action.label} role="none">
              <button
                type="button"
                role="menuitem"
                className="w-full px-3 py-1.5 text-left text-sm text-content transition-colors hover:bg-accent/10 focus:bg-accent/10 focus:outline-none"
                onClick={() => {
                  setOpen(false);
                  action.run();
                }}
              >
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default FileRow;
