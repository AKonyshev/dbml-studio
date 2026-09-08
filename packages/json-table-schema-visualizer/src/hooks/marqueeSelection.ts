import { useEffect, useRef, useState, type RefObject } from "react";
import { type KonvaEventObject } from "konva/lib/Node";

import type { Group as CoreGroup } from "konva/lib/Group";
import type { Stage as CoreStage } from "konva/lib/Stage";
import type { XYWHPosition } from "@/types/positions";

import { useIsSelectMode } from "@/hooks/selection";
import { selectionStore } from "@/stores/selectionStore";
import { clearCurrentTarget, selectTables } from "@/stores/currentTarget";
import {
  normalizeMarquee,
  selectionFromMarquee,
  type Marquee,
} from "@/utils/selectionFromMarquee";
import {
  isSpaceActivatedTarget,
  isTypingTarget,
  type TypingTarget,
} from "@/utils/isTypingTarget";

interface MarqueeSelectionArgs {
  stageRef: RefObject<CoreStage | null>;
  /**
   * The tables as they are drawn right now, read at the end of the gesture.
   *
   * Not `tableCoordsStore` directly, which is what this used to read: the
   * heights in there belong to the layout, made once at full detail, so a drag
   * through the empty space under a collapsed table caught it anyway. See
   * `drawnBoxes`.
   */
  boxes: () => ReadonlyMap<string, XYWHPosition>;
  /**
   * The Group the tables live in. A pointer position read from it is already in
   * the coordinates `tableCoordsStore` holds — the stage transform and the
   * Group's own offset included — so nothing here has to undo either.
   */
  tablesGroupRef: RefObject<CoreGroup | null>;
}

export interface MarqueeSelection {
  /** The rectangle to draw, already the right way round. Null when idle. */
  marquee: Marquee | null;
  /** What the stage's `draggable` prop should be right now. */
  stageIsDraggable: boolean;
  /** True while the reader is holding space to pan inside select mode. */
  isPanning: boolean;
  onMouseDown: ((event: KonvaEventObject<MouseEvent>) => void) | undefined;
  onMouseMove: (() => void) | undefined;
}

/** Where the drag began, and how it was started. */
interface MarqueeStart {
  x: number;
  y: number;
  /**
   * Whether the modifier was down when the drag began. Read once, at the
   * start: the reader may let Shift go halfway through, and the gesture they
   * started is the one they meant.
   */
  additive: boolean;
}

/**
 * Choosing tables with a rectangle, and everything that gesture drags in with
 * it: the selection's lifetime, and panning while it is in progress.
 *
 * Its own hook because none of it is about what `DiagramWrapper` is about.
 * That component frames and zooms a stage; this decides what a press of the
 * mouse means, and the two change for different reasons.
 */
export const useMarqueeSelection = ({
  stageRef,
  tablesGroupRef,
  boxes,
}: MarqueeSelectionArgs): MarqueeSelection => {
  const isSelectMode = useIsSelectMode();
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const startRef = useRef<MarqueeStart | null>(null);
  // Konva has no filter for which mouse button starts a drag, so panning inside
  // select mode is the stage being made draggable for the length of one gesture
  // and put back afterwards.
  const [isPanning, setIsPanning] = useState(false);
  const isMiddleButtonDownRef = useRef(false);

  const stageIsDraggable = !isSelectMode || isPanning;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key !== "Escape" ||
        selectionStore.getSelected().size === 0 ||
        // The one definition of "the reader is busy with this key" — see
        // `isTypingTarget`. Escape in the editor beside the diagram means
        // "dismiss what you are showing me", not "drop my selection".
        isTypingTarget(event.target as TypingTarget | null)
      ) {
        return;
      }

      // Marked as spent, the way the legend and the export menu mark theirs:
      // the embedded frame reads exactly this to decide whether an Escape was
      // the reader asking for the page back. Without it one keypress would both
      // drop the selection and collapse an expanded frame.
      event.preventDefault();
      clearCurrentTarget();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    // An unmount cleanup rather than a watch on the document key: the hook does
    // not receive the key, and remounting is exactly what a document change
    // does to the diagram. Without this, opening another schema leaves a
    // selection naming tables that are not on the canvas.
    return () => {
      clearCurrentTarget();
    };
  }, []);

  useEffect(() => {
    if (!isSelectMode) {
      // A selection that outlived the mode would silently change what a plain
      // drag does, in the mode whose whole point is that a drag moves the
      // canvas. Panning stays reachable inside select mode, so nobody has to
      // leave it mid-task.
      clearCurrentTarget();
    }
  }, [isSelectMode]);

  useEffect(() => {
    if (!isSelectMode) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.code !== "Space" ||
        isSpaceActivatedTarget(event.target as TypingTarget | null)
      ) {
        return;
      }

      // Otherwise the page around an embedded frame scrolls a screen down while
      // the reader is holding the key to pan.
      event.preventDefault();
      setIsPanning(true);
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === "Space") {
        setIsPanning(false);
      }
    };

    // A reader who switches windows mid-pan never sends the key-up.
    const onBlur = (): void => {
      setIsPanning(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      setIsPanning(false);
    };
  }, [isSelectMode]);

  const pointerInDiagram = (): { x: number; y: number } | null =>
    tablesGroupRef.current?.getRelativePointerPosition() ?? null;

  /** The rectangle between where the drag began and where the pointer is. */
  const marqueeFrom = (
    start: MarqueeStart,
    point: { x: number; y: number } | null,
  ): Marquee => ({
    x: start.x,
    y: start.y,
    w: point === null ? 0 : point.x - start.x,
    h: point === null ? 0 : point.y - start.y,
  });

  /**
   * Ends whatever gesture was in flight, whichever way it ended.
   *
   * One function for both gestures, and the caller binds it to every way a drag
   * can stop. A middle-button pan released outside the canvas used to send no
   * mouse-up at all, so its flag stayed raised and the stage stayed draggable:
   * select mode silently became pan mode, and the next drag both drew a marquee
   * and moved the canvas.
   *
   * `draggable` is restored to what the prop says rather than to `false`.
   * Konva is being written to directly here, and React will not re-apply a prop
   * whose value has not changed — so hardcoding `false` left the stage
   * undraggable while the reader was still holding space for it.
   */
  const endGesture = (): void => {
    if (isMiddleButtonDownRef.current) {
      isMiddleButtonDownRef.current = false;
      stageRef.current?.stopDrag();
      stageRef.current?.draggable(stageIsDraggable);
    }

    const start = startRef.current;

    if (start === null) {
      return;
    }

    selectTables(
      selectionFromMarquee(
        boxes(),
        marqueeFrom(start, pointerInDiagram()),
        start.additive,
        selectionStore.getSelected(),
      ),
    );

    startRef.current = null;
    setMarquee(null);
  };

  // Bound once, and read at the moment the gesture ends, so the listener below
  // never needs re-attaching.
  const endGestureRef = useRef(endGesture);
  endGestureRef.current = endGesture;

  useEffect(() => {
    // On the window rather than on the stage, which is the whole point: Konva
    // captures the pointer for the length of a stage drag, so the stage hears
    // no `mouseleave` and — if the button comes up outside the canvas — no
    // `mouseup` either. Listening here is the only way to be told the gesture
    // is over wherever it ended. `blur` covers the reader switching apps
    // mid-drag, which sends no pointer event at all.
    const onEnd = (): void => {
      endGestureRef.current();
    };

    window.addEventListener("mouseup", onEnd);
    window.addEventListener("blur", onEnd);

    return () => {
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("blur", onEnd);
    };
  }, []);

  const onMouseDown = (event: KonvaEventObject<MouseEvent>): void => {
    // Space is held, so the stage is already draggable and Konva is about to
    // pan with this very drag. Opening a marquee on top of it would end by
    // committing an empty one: the tables move with the stage, so the pointer
    // barely moves relative to them, and the box `endGesture` computes catches
    // nothing — which clears the selection the reader held space to keep.
    if (isPanning) {
      return;
    }

    // 1 is the middle button. Konva cannot be told which buttons drag, so the
    // stage is made draggable for the length of this gesture and `endGesture`
    // puts it back.
    if (event.evt.button === 1) {
      isMiddleButtonDownRef.current = true;
      stageRef.current?.draggable(true);
      stageRef.current?.startDrag();
      return;
    }

    // Only a drag that began on empty canvas. One that began on a table is that
    // table being moved, which Konva is already handling.
    if (event.target !== stageRef.current) {
      return;
    }

    const point = pointerInDiagram();

    if (point === null) {
      return;
    }

    startRef.current = { ...point, additive: event.evt.shiftKey };
    setMarquee({ x: point.x, y: point.y, w: 0, h: 0 });
  };

  const onMouseMove = (): void => {
    const start = startRef.current;
    const point = pointerInDiagram();

    if (start === null || point === null) {
      return;
    }

    setMarquee(marqueeFrom(start, point));
  };

  return {
    marquee: marquee === null ? null : normalizeMarquee(marquee),
    stageIsDraggable,
    isPanning,
    onMouseDown: isSelectMode ? onMouseDown : undefined,
    onMouseMove: isSelectMode ? onMouseMove : undefined,
  };
};
