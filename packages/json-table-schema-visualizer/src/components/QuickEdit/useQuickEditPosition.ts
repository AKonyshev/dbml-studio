import { useSyncExternalStore } from "react";

import type { QuickEditTarget } from "@/stores/quickEditStore";

import {
  COLUMN_HEIGHT,
  DIAGRAM_PADDING,
  TABLE_COLOR_HEIGHT,
  TABLE_HEADER_HEIGHT,
} from "@/constants/sizing";
import { tableCoordsStore } from "@/stores/tableCoords";
import { viewportStore } from "@/stores/viewportStore";

/**
 * Narrower than this and a line of DBML is not worth reading in the box. Also
 * what a table that has not been measured yet is assumed to be.
 */
export const MIN_POPUP_WIDTH = 200;

export interface QuickEditRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The diagram's own scale, so the box can be typed like the rows it covers. */
  scale: number;
}

/**
 * Where the popup sits, in screen pixels above the canvas.
 *
 * Recomputed on every viewport change rather than closed on a pan: there is one
 * popup on a diagram, so following the canvas costs nothing worth saving, and a
 * popup that vanished when the reader nudged the view would be worse than one
 * that moves.
 */
export const useQuickEditPosition = (
  target: QuickEditTarget | null,
): QuickEditRect | null => {
  const viewport = useSyncExternalStore(
    viewportStore.subscribe,
    viewportStore.get,
    viewportStore.get,
  );

  if (target === null) {
    return null;
  }

  const coords = tableCoordsStore.getFullCoords(target.table);
  const localY =
    target.at === undefined
      ? TABLE_COLOR_HEIGHT
      : TABLE_HEADER_HEIGHT + target.offsetY;
  const width = coords.w > 0 ? coords.w : MIN_POPUP_WIDTH;

  return {
    x: (coords.x + DIAGRAM_PADDING) * viewport.scale + viewport.x,
    y: (coords.y + DIAGRAM_PADDING + localY) * viewport.scale + viewport.y,
    width: width * viewport.scale,
    height: COLUMN_HEIGHT * viewport.scale,
    scale: viewport.scale,
  };
};
