import { type ButtonHTMLAttributes } from "react";

import { composeTooltip } from "@/utils/composeTooltip";

// `title` is omitted so a caller cannot reintroduce the native tooltip. The
// accessible name is guarded by ordering instead, not by the type: TypeScript
// does not check hyphenated JSX attributes at all, so omitting "aria-label"
// here would look like protection while permitting every caller to pass it.
interface ToolbarButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  onClick: () => void;
  /** Human-readable name. Becomes the accessible name and the tooltip text. */
  label: string;
  /** Registry key for this action, when it has one. */
  shortcutKey?: string;
}

const ToolbarButton = ({
  onClick,
  label,
  shortcutKey,
  children,
  className = "",
  ...props
}: ToolbarButtonProps) => {
  const tooltip = composeTooltip(label, shortcutKey);

  return (
    <button
      onClick={onClick}
      className={`group relative flex items-center rounded-lg p-1.5 text-content-muted transition-colors hover:bg-accent/10 hover:text-content focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-content-muted ${className}`}
      {...props}
      // Deliberately AFTER the spread: later JSX attributes win, so a caller
      // cannot replace the computed accessible name. There is no `title` — the
      // native tooltip lags ~1s and would surface on top of ours — so this is
      // the only name an icon-only button has, and it carries the shortcut so a
      // screen-reader user learns the key like everyone else.
      aria-label={tooltip}
    >
      {children}

      <span
        // Hidden from assistive tech: it repeats the accessible name verbatim,
        // and announcing it twice is noise. It is a purely visual affordance.
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-content px-2 py-1 text-xs font-normal text-surface opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
      >
        {tooltip}
      </span>
    </button>
  );
};

export default ToolbarButton;
