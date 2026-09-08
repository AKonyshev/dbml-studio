import type { DiagramActionId } from "json-table-schema-visualizer/src/stores/diagramActions";

/**
 * The diagram's own actions, as commands the workbench owns.
 *
 * Inside the webview none of these has a key of its own any more: VS Code holds
 * the chord, which is what lets a reader rebind it in Keyboard Shortcuts or
 * reach the action from the palette, and the extension relays it to the diagram
 * that has focus. The right-hand value is the action id the diagram answers to
 * — `SHORTCUTS` in the visualizer is the other end of this table.
 */
export const DIAGRAM_ACTION_COMMANDS: ReadonlyArray<
  readonly [command: string, action: DiagramActionId]
> = [
  ["dbmlStudio.colorRelations", "colorRelations"],
  ["dbmlStudio.animateRelations", "animateRelations"],
  ["dbmlStudio.shortTableName", "shortTableName"],
  ["dbmlStudio.detailLevel", "detailLevel"],
  ["dbmlStudio.interactionMode", "interactionMode"],
  ["dbmlStudio.autoArrange", "autoArrange"],
  ["dbmlStudio.fitToView", "fitToView"],
  ["dbmlStudio.toggleTableRelations", "toggleRefs"],
  ["dbmlStudio.showAllTableRelations", "showAllRefs"],
  ["dbmlStudio.tableDetailLevel", "tableDetailLevel"],
  ["dbmlStudio.resetTableDetailLevels", "resetTableDetailLevels"],
  ["dbmlStudio.showShortcuts", "legend"],
  ["dbmlStudio.quickEdit", "quickEdit"],
];
