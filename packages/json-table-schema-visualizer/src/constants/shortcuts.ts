import { type MessageKey } from "@/i18n/messages";

export interface ShortcutEntry {
  id: string;
  /** `event.key` value for executable entries; display text for reference rows. */
  key: string;
  labelKey: MessageKey;
  /** false — a legend-only row; its logic lives elsewhere. */
  executable: boolean;
}

// The single source of truth: both the key handler and the legend are derived
// from it, so the legend cannot drift from what actually fires.
export const SHORTCUTS = [
  {
    id: "colorRelations",
    key: "c",
    labelKey: "action.colorRelations",
    executable: true,
  },
  {
    id: "animateRelations",
    key: "a",
    labelKey: "action.animateRelations",
    executable: true,
  },
  {
    id: "shortTableName",
    key: "s",
    labelKey: "action.shortTableName",
    executable: true,
  },
  {
    id: "detailLevel",
    key: "d",
    labelKey: "action.detailLevel",
    executable: true,
  },
  {
    id: "interactionMode",
    key: "v",
    labelKey: "action.interactionMode.select",
    executable: true,
  },
  {
    id: "autoArrange",
    key: "l",
    labelKey: "action.autoArrange",
    executable: true,
  },
  {
    id: "fitToView",
    key: "f",
    labelKey: "action.fitToView",
    executable: true,
  },
  {
    id: "toggleRefs",
    key: "h",
    labelKey: "action.toggleRefs",
    executable: true,
  },
  {
    id: "showAllRefs",
    key: "r",
    labelKey: "action.showAllRefs",
    executable: true,
  },
  {
    id: "tableDetailLevel",
    key: "t",
    labelKey: "action.tableDetailLevel",
    executable: true,
  },
  {
    id: "resetTableDetailLevels",
    key: "u",
    labelKey: "action.resetTableDetailLevels",
    executable: true,
  },
  {
    id: "quickEdit",
    key: "F2",
    labelKey: "action.quickEdit",
    executable: true,
  },
  {
    id: "legend",
    key: "?",
    labelKey: "action.showLegend",
    executable: true,
  },
  {
    id: "closeLegend",
    key: "Esc",
    labelKey: "action.closeLegend",
    executable: false,
  },
  {
    id: "search",
    key: "Ctrl/Cmd+F",
    labelKey: "action.search",
    executable: false,
  },
] as const satisfies readonly ShortcutEntry[];

export type ExecutableShortcutId = Extract<
  (typeof SHORTCUTS)[number],
  { executable: true }
>["id"];

// Lets a button ask for its shortcut without reaching into the registry itself:
// the registry stays the single source of truth, and a tooltip built from it
// cannot claim a binding that does not fire.
export const shortcutKeyFor = (id: ExecutableShortcutId): string => {
  const entry = SHORTCUTS.find((shortcut) => shortcut.id === id);
  return entry?.key ?? "";
};
