import { Group, Layer, Rect, Stage } from "react-konva";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  type JSONTableRef,
  type JSONTableTable,
} from "shared/types/tableSchema";
import { type KonvaEventObject } from "konva/lib/Node";

import Toolbar from "../Toolbar/Toolbar";
import ShortcutsLegend from "../ShortcutsLegend/ShortcutsLegend";

import type { Stage as CoreStage } from "konva/lib/Stage";
import type { Group as CoreGroup } from "konva/lib/Group";

import { STORAGE_KEYS } from "@/constants/storageKeys";
import { useElementSize } from "@/hooks/elementSize";
import { useCursorChanger } from "@/hooks/cursor";
import { DIAGRAM_PADDING } from "@/constants/sizing";
import { REVEAL_ON_HOVER } from "@/constants/revealOnHover";
import { useThemeColors } from "@/hooks/theme";
import { useStageStartingState } from "@/hooks/stage";
import { stageStateStore } from "@/stores/stagesState";
import { useScrollDirectionContext } from "@/hooks/scrollDirection";
import eventEmitter from "@/events-emitter";
import { tableCoordsStore } from "@/stores/tableCoords";
import { tableDetailLevelStore } from "@/stores/tableDetailLevelStore";
import { useTablePositionContext } from "@/hooks/table";
import {
  getHighlightedColumns,
  getHoveredTableName,
  setHighlightedColumns,
  setHoveredTableName,
} from "@/stores/hoverStore";
import { exportStageSVG } from "@/export/svg/svg-exporter";
import { generateAsciiDoc } from "@/utils/exportAsciiDoc";
import { generateMarkdown } from "@/utils/exportMarkdown";
import useLocalStorage from "@/hooks/localStorage";
import { columnFocusStore } from "@/stores/columnFocusStore";
import {
  forgetRenames,
  reconcileAfterSchemaChange,
} from "@/stores/renameReconcile";
import { selectionStore } from "@/stores/selectionStore";
import { openQuickEdit } from "@/stores/quickEditStore";
import {
  useDiagramActions,
  useKeyboardShortcuts,
} from "@/hooks/keyboardShortcuts";
import { useTableDetailLevel } from "@/hooks/tableDetailLevel";
import { type TableDetailLevel } from "@/types/tableDetailLevel";
import { computeWheelZoom } from "@/utils/computeWheelZoom";
import { computeDiagramBounds } from "@/utils/diagramBounds";
import { drawnBoxes } from "@/utils/drawnBoxes";
import { viewportStore } from "@/stores/viewportStore";
import { toggleInteractionMode } from "@/stores/interactionModeStore";
import {
  showAllTableRelations,
  toggleTableRelations,
} from "@/stores/toggleTableRelations";
import { useMarqueeSelection } from "@/hooks/marqueeSelection";

interface DiagramWrapperProps {
  connections: ReactNode;
  tables: ReactNode;
  tablesMeta: JSONTableTable[];
  refs: JSONTableRef[];
  /** Passed straight through to the toolbar; see `DiagramApp`. */
  hostActions?: ReactNode;
  /**
   * Keep the whole diagram framed — on the first render instead of the starting
   * state, and again whenever the container changes size — for a host whose
   * reader cannot pan to find it.
   *
   * The embedded frame in a documentation page is that host: it can be a few
   * hundred pixels tall, it opens on a slice of a model somebody chose, and the
   * reader is reading prose around it rather than exploring a canvas. An
   * application's reader has a whole window and a toolbar; a page's reader has
   * whatever the author's `height=` gave them.
   *
   * Re-framing on resize is the part the other hosts must not have: for them a
   * resize is a dragged divider, and re-framing would throw away a pan that is
   * persisted nowhere. For this one a resize is the reader asking for the
   * diagram across the page, and leaving the old framing behind would answer by
   * putting the same small picture in the corner of a large empty one.
   */
  autoFit?: boolean;
  /**
   * Keep the toolbar out of sight until the pointer is over the diagram, for
   * the same host and the same reason as `autoFit`. See `REVEAL_ON_HOVER`.
   *
   * The toolbar floats over the bottom of the diagram. In a window that costs
   * a strip of empty canvas; in a 500px frame it covers the bottom fifth of the
   * thing the page put there to be looked at, and on a narrow one it wraps to
   * two rows and covers a third. The shortcuts keep working while it is hidden
   * — `F`, `L` and `D` are bound to the document, not to these buttons.
   *
   * The group this reveals from is on `DiagramViewer`'s `main`, because the
   * search bar hides with the toolbar and is not inside this component.
   */
  revealControlsOnHover?: boolean;
  /**
   * Whether a bare letter on the document runs the action bound to it.
   *
   * False inside VS Code, where the workbench owns the chords so that a reader
   * can rebind them, and hands them back as commands. The actions themselves
   * stay registered either way; only this listener goes.
   */
  keyboardShortcuts?: boolean;
}

interface PendingWheelEvent {
  deltaY: number;
  ctrlKey: boolean;
  pointerX: number;
  pointerY: number;
}

const DiagramWrapper = ({
  connections,
  tables,
  tablesMeta,
  refs,
  hostActions = null,
  autoFit = false,
  revealControlsOnHover = false,
  keyboardShortcuts = true,
}: DiagramWrapperProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<null | CoreStage>(null);
  const tablesGroupRef = useRef<null | CoreGroup>(null);

  const { detailLevel, next: nextDetailLevel } = useTableDetailLevel();
  // Read through a ref rather than closed over: `fitToView` is captured once,
  // by the mount-time subscription below, and a captured detail level would be
  // whatever it was when the document opened for the rest of the document's
  // life.
  const detailLevelRef = useRef(detailLevel);
  detailLevelRef.current = detailLevel;

  // One resolver for everything on this component that measures tables. Built
  // here rather than taken from `useDetailLevelResolver`, because the callers
  // below are captured at mount: the ref is why the global level it reads is
  // the current one, and the store is read the same way, at the call.
  const levelFor = (tableName: string): TableDetailLevel =>
    tableDetailLevelStore.levelFor(tableName) ?? detailLevelRef.current;

  const {
    marquee,
    stageIsDraggable,
    isPanning,
    onMouseDown: onMarqueeMouseDown,
    onMouseMove: onMarqueeMouseMove,
  } = useMarqueeSelection({
    stageRef,
    tablesGroupRef,
    // Read at the end of the gesture, not now: `drawnBoxes` asks each table's
    // level, and a table set apart between mousedown and mouseup should be
    // caught as it is drawn when the reader lets go.
    boxes: () =>
      drawnBoxes(tableCoordsStore.getCurrentStore(), tablesMeta, levelFor),
  });
  const { height: viewHeight, width: viewWidth } = useElementSize(containerRef);
  const { scrollDirection } = useScrollDirectionContext();
  // Konva is written to directly on pan and zoom, so this is the only thing
  // that can tell the rest of the app the view moved.
  const publishViewport = useCallback((): void => {
    const stage = stageRef.current;
    if (stage === null) {
      return;
    }

    viewportStore.set({
      scale: stage.scaleX(),
      x: stage.x(),
      y: stage.y(),
      width: stage.width(),
      height: stage.height(),
    });
  }, []);

  const { onChange: onGrabbing, onRestore: onGrabRelease } =
    useCursorChanger("grabbing");
  const themeColors = useThemeColors();

  const diagramBounds = (): {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null =>
    computeDiagramBounds(
      tableCoordsStore.getCurrentStore(),
      tablesMeta,
      levelFor,
    );

  const fitToView = () => {
    if (stageRef.current != null) {
      const stage = stageRef.current;
      const container = stage.container();
      const containerWidth = container.offsetWidth;
      const containerHeight = container.offsetHeight;

      // `diagramBounds` rather than the stage: see `computeDiagramBounds` for
      // why the stage is the wrong thing to measure and why the stored heights
      // are not the right ones either.
      const contentBounds =
        diagramBounds() ?? stage.getClientRect({ relativeTo: stage });
      contentBounds.x = contentBounds.x - DIAGRAM_PADDING;
      contentBounds.y = contentBounds.y - DIAGRAM_PADDING;
      contentBounds.width = contentBounds.width + 2 * DIAGRAM_PADDING;
      contentBounds.height = contentBounds.height + 2 * DIAGRAM_PADDING;
      const scaleX = containerWidth / contentBounds.width;
      const scaleY = containerHeight / contentBounds.height;
      const scale = Math.min(scaleX, scaleY);

      stage.scale({ x: scale, y: scale });
      stage.position({
        x:
          (containerWidth - contentBounds.width * scale) / 2 -
          contentBounds.x * scale,
        y:
          (containerHeight - contentBounds.height * scale) / 2 -
          contentBounds.y * scale,
      });
      stage.batchDraw();
      stageStateStore.set({ scale, position: stage.position() });
      // After the position, never between it and the scale: a viewport
      // published half-updated culls against a rectangle that never existed,
      // and every table disappears.
      publishViewport();
    }
  };

  // repositioning the stage: once for most hosts, on every resize for the one
  // that asked to be kept framed
  const { scale: defaultStageScale, position: defaultStagePosition } =
    useStageStartingState({ width: viewWidth, height: viewHeight });
  const hasPositionedStage = useRef(false);
  useEffect(() => {
    // Only after there is a real size to fit into.
    if (stageRef.current === null || viewWidth === 0 || viewHeight === 0) {
      return;
    }

    // A host that asked to be kept framed gets the same measurement the
    // toolbar's fit button makes, rather than the starting state: the starting
    // state takes its bounds from table coordinates alone, so a table's own
    // width and height fall outside the box it computes, and the rightmost one
    // is cut off by however wide it happens to be.
    //
    // Ahead of the once-only guard, because for this host the resizes are the
    // point — see `autoFit`.
    if (autoFit) {
      hasPositionedStage.current = true;
      // Fits and publishes the viewport itself.
      fitToView();
      return;
    }

    // Once, for everyone else. The starting state depends on the container's
    // dimensions, so without this guard every resize — a dragged divider most of
    // all — would reposition the diagram and throw away the reader's pan.
    // Panning is not persisted, so there would be nothing to restore it from.
    //
    // And the starting state is not something to override even once here:
    // `useStageStartingState` returns a view the reader left behind when there
    // is one, and replacing it would drop them somewhere they did not ask to be,
    // every time they came back to a document.
    if (hasPositionedStage.current) {
      return;
    }

    hasPositionedStage.current = true;

    stageRef.current.scale({
      x: defaultStageScale,
      y: defaultStageScale,
    });
    stageRef.current.position(defaultStagePosition);
    publishViewport();
  }, [
    defaultStageScale,
    defaultStagePosition,
    viewWidth,
    viewHeight,
    publishViewport,
    autoFit,
  ]);

  const pendingWheelRef = useRef<PendingWheelEvent | null>(null);
  const wheelFrameRef = useRef<number | null>(null);

  const applyPendingWheelZoom = useCallback((): void => {
    wheelFrameRef.current = null;
    const pending = pendingWheelRef.current;
    pendingWheelRef.current = null;
    const stage = stageRef.current;
    if (pending === null || stage === null) {
      return;
    }

    const { scale, position } = computeWheelZoom({
      oldScale: stage.scaleX(),
      deltaY: pending.deltaY,
      ctrlKey: pending.ctrlKey,
      scrollDirection,
      pointerX: pending.pointerX,
      pointerY: pending.pointerY,
      stageX: stage.x(),
      stageY: stage.y(),
    });

    stage.scale({ x: scale, y: scale });
    stage.position(position);
    stage.batchDraw();
    stageStateStore.set({ scale, position });
    publishViewport();
  }, [scrollDirection, publishViewport]);

  useEffect(
    () => () => {
      if (wheelFrameRef.current !== null) {
        cancelAnimationFrame(wheelFrameRef.current);
      }
    },
    [],
  );

  const handleZooming = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.currentTarget as CoreStage;
    const pointer = stage.getPointerPosition();
    if (pointer === null) {
      return;
    }

    const pending = pendingWheelRef.current;
    if (pending === null) {
      pendingWheelRef.current = {
        deltaY: e.evt.deltaY,
        ctrlKey: e.evt.ctrlKey,
        pointerX: pointer.x,
        pointerY: pointer.y,
      };
    } else {
      pending.deltaY += e.evt.deltaY;
      pending.ctrlKey = e.evt.ctrlKey;
      pending.pointerX = pointer.x;
      pending.pointerY = pointer.y;
    }

    if (wheelFrameRef.current === null) {
      wheelFrameRef.current = requestAnimationFrame(applyPendingWheelZoom);
    }
  };

  const nodeBelongsToTable = (node: any): boolean => {
    let currentNode = node;
    while (currentNode != null) {
      if (
        typeof currentNode.name === "function" &&
        typeof currentNode.name() === "string"
      ) {
        const names = (currentNode.name() as string).split(/\s+/);
        if (names.some((n) => n.startsWith("table-"))) {
          return true;
        }
      }
      currentNode = currentNode.getParent?.() ?? null;
    }
    return false;
  };

  const handleStagePointerDown = (
    e: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    // Read at the moment of the click rather than subscribed to: this component
    // has no reason to re-render as the pointer crosses tables.
    const highlightedColumns = getHighlightedColumns();
    if (
      getHoveredTableName() == null &&
      (highlightedColumns == null || highlightedColumns.length === 0)
    )
      return;
    if (nodeBelongsToTable(e.target)) return;
    setHoveredTableName(null);
    setHighlightedColumns([]);
  };

  /**
   * A fresh arrangement gets a fresh view.
   *
   * Auto-arrange moves every table at once, so the framing the reader had was
   * framing a layout that no longer exists — press `L` on a diagram you have
   * zoomed into and the result can land entirely off-screen, with nothing on
   * screen changing to say why.
   *
   * This is deliberately *not* the `hasPositionedStage` path above. That one
   * answers "where does the stage start", once, and must keep refusing to run
   * again — a re-fit on every recomputation would take the reader's pan away
   * whenever the split divider moved. This one answers a different question:
   * the coordinates were replaced, so frame what replaced them.
   *
   * The same event covers opening a file and switching to a document with no
   * stored layout, which are the other two ways a whole arrangement is computed
   * at once. Framing those is right for the same reason.
   */
  useEffect(() => {
    return tableCoordsStore.subscribeToReset(() => {
      // Next frame, not now. The store emits before React has re-rendered the
      // tables at their new coordinates, so measuring the stage here would frame
      // the arrangement that has just been replaced — the old view, computed
      // twice.
      requestAnimationFrame(() => {
        fitToView();
      });
    });
    // `fitToView` reads nothing but `stageRef`, constants and refs, so the copy
    // captured here stays correct for the life of the component.
  }, []);

  /**
   * A different amount of table gets an arrangement of its own.
   *
   * The layout is computed from how tall the tables are drawn — the gaps
   * between them are a share of their height, and the number of columns the
   * diagram is broken into is chosen to bring the whole near `TARGET_ASPECT`.
   * None of that survives the tables becoming a fortieth of their height, so
   * headers left in a full-detail arrangement sit in a field of white with the
   * relations running the length of it.
   *
   * `switchToDetailLevel` re-keys the store to this level and either recovers
   * the arrangement the reader last had here or computes one. Announcing the
   * coordinates as replaced is what moves the tables; the subscription above
   * hears that too and would eventually frame them, but only on the next
   * animation frame, and a frame that is off-screen or in a background tab is
   * not given one. The framing is called for here instead, where it is
   * immediate and certain — nothing is waited for, because the bounds are read
   * from the coordinate store rather than measured off the stage.
   *
   * The guard keeps this off the mount, where it would arrange a document that
   * `switchDocument` has just arranged and take away the view a returning
   * reader left behind. The viewer is keyed by document, so a document switch
   * mounts a fresh one and lands here too.
   */
  const arrangedAtDetailLevel = useRef(detailLevel);
  useEffect(() => {
    if (arrangedAtDetailLevel.current === detailLevel) {
      return;
    }

    arrangedAtDetailLevel.current = detailLevel;
    tableCoordsStore.switchToDetailLevel(tablesMeta, refs);
    fitToView();
  }, [detailLevel, tablesMeta, refs]);

  /**
   * Undo restores the text of a rename but not the keys these stores hold, so
   * every new schema is checked against the renames this session made. See
   * `reconcileAfterSchemaChange`.
   */
  useEffect(() => {
    reconcileAfterSchemaChange(tablesMeta.map((table) => table.name));
  }, [tablesMeta]);

  useEffect(() => forgetRenames, []);

  const [, setColorRelations] = useLocalStorage<boolean>(
    STORAGE_KEYS.COLOR_RELATIONS,
    false,
  );
  const [, setAnimateRelations] = useLocalStorage<boolean>(
    STORAGE_KEYS.ANIMATE_RELATIONS,
    false,
  );
  const [, setShortTableName] = useLocalStorage<boolean>(
    STORAGE_KEYS.SHORT_TABLE_NAME,
    false,
  );
  const { resetPositions } = useTablePositionContext();
  const [isLegendOpen, setIsLegendOpen] = useState(false);

  useDiagramActions(
    {
      colorRelations: () => {
        setColorRelations((prev) => !prev);
      },
      animateRelations: () => {
        setAnimateRelations((prev) => !prev);
      },
      shortTableName: () => {
        setShortTableName((prev) => !prev);
      },
      detailLevel: nextDetailLevel,
      autoArrange: resetPositions,
      interactionMode: toggleInteractionMode,
      fitToView,
      legend: () => {
        setIsLegendOpen(true);
      },
      // Reading the hovered table at the keypress rather than subscribing to
      // it: this component has no reason to re-render as the pointer moves.
      toggleRefs: () => {
        toggleTableRelations(getHoveredTableName() ?? "");
      },
      showAllRefs: showAllTableRelations,
      // The hovered table read at the keypress, for the reason `toggleRefs`
      // gives just above: the pointer moving is no reason to re-render this.
      // An empty name is not a table and the store ignores it.
      tableDetailLevel: () => {
        tableDetailLevelStore.cycle(getHoveredTableName() ?? "");
      },
      resetTableDetailLevels: () => {
        tableDetailLevelStore.resetAll();
      },
      /**
       * One key for all of it, because the reader is only ever pointing at one
       * thing: a focused column wins, then a single selected table, then the
       * table under the pointer.
       *
       * That last fallback is what makes renaming reachable. A table can only
       * be selected in select mode, so requiring a selection meant pressing
       * `V`, clicking, renaming, and pressing `V` back — a ritual nobody
       * guesses, and nobody did. `H` and `T` already act on the hovered table,
       * so this is the diagram's own idiom rather than a new one.
       *
       * One command rather than two on the same chord, which would have needed
       * a context key the webview kept the workbench told about: a whole
       * channel of state to keep in step, for a choice already made here.
       *
       * All of it read at the keypress rather than subscribed to: pointing at
       * something is no reason to re-render the diagram. Aimed at nothing, this
       * does nothing.
       */
      quickEdit: () => {
        const focused = columnFocusStore.get();
        if (focused !== null) {
          openQuickEdit({
            table: focused.table,
            field: focused.field,
            offsetY: focused.offsetY,
          });

          return;
        }

        const selected = [...selectionStore.getSelected()];
        const table =
          selected.length === 1 ? selected[0] : getHoveredTableName();
        if (table == null || table === "") return;

        openQuickEdit({ table, offsetY: 0 });
      },
    },
    !isLegendOpen,
  );

  useKeyboardShortcuts(keyboardShortcuts);

  /**
   * Center handler: listen for requests to center the stage on a given table
   *  when the search option is clicked.
   */
  useEffect(() => {
    const handler = ({ tableName }: { tableName: string }) => {
      if (stageRef.current == null) return;

      const stage = stageRef.current;
      const container = stage.container();
      const containerWidth = container.offsetWidth;
      const containerHeight = container.offsetHeight;

      // Try to find the node by name first
      const nodeName = `table-${tableName.replace(/\s+/g, "_")}`;
      // Konva's findOne accepts a selector like `.name`
      const node = stage.findOne(`.${nodeName}`);

      // Get bounding rect relative to stage
      let rect: { x: number; y: number; width: number; height: number };
      if (node != null && typeof (node as any).getClientRect === "function") {
        rect = (node as any).getClientRect({ relativeTo: stage });
      } else {
        // Fallback to stored coords (top-left) and assume a small box
        const coords = tableCoordsStore.getCoords(tableName);
        rect = { x: coords.x, y: coords.y, width: 200, height: 100 };
      }

      const scale = stage.scaleX();

      const newPos = {
        x: containerWidth / 2 - (rect.x + rect.width / 2) * scale,
        y: containerHeight / 2 - (rect.y + rect.height / 2) * scale,
      };

      // animate stage position for a smooth pan
      try {
        (stage as any).to({
          x: newPos.x,
          y: newPos.y,
          duration: 0.45,
          onFinish: () => {
            stage.batchDraw();
            stageStateStore.set({ scale: stage.scaleX(), position: newPos });
          },
        });
      } catch (e) {
        // fallback to immediate set
        stage.position(newPos);
        stage.batchDraw();
        stageStateStore.set({ scale: stage.scaleX(), position: newPos });
      }
    };

    eventEmitter.on("table:center", handler);
    return () => {
      eventEmitter.off("table:center", handler);
    };
  }, []);

  const downloadBlob = (blob: Blob, filename: string) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const onDownloadPng = () => {
    if (stageRef.current == null) return;
    const stage = stageRef.current;

    // Save current stage state
    const originalScale = stage.scaleX();
    const originalPosition = { ...stage.position() };

    // Reset stage to scale 1 and position 0,0 to get actual content bounds
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });

    const contentBounds = stage.getClientRect({ relativeTo: stage });

    // Calculate square dimensions (use the larger dimension)
    const maxDimension = Math.max(contentBounds.width, contentBounds.height);

    // Center the content in the square
    const offsetX = (maxDimension - contentBounds.width) / 2;
    const offsetY = (maxDimension - contentBounds.height) / 2;

    const data = stage.toDataURL({
      x: contentBounds.x - offsetX,
      y: contentBounds.y - offsetY,
      width: maxDimension,
      height: maxDimension,
      pixelRatio: 2,
    });

    // Restore original stage state
    stage.scale({ x: originalScale, y: originalScale });
    stage.position(originalPosition);

    const link = document.createElement("a");
    link.href = data;
    link.download = `diagram-${Date.now()}.png`;
    link.click();
  };

  const onDownloadSvg = async () => {
    if (stageRef.current == null) return;
    const result = await exportStageSVG(stageRef.current, true);
    if (result instanceof Blob) {
      downloadBlob(result, `diagram-${Date.now()}.svg`);
    }
  };

  const onDownloadMarkdown = () => {
    const markdown = generateMarkdown(tablesMeta, refs);
    const blob = new Blob([markdown], { type: "text/markdown" });
    downloadBlob(blob, `diagram-${Date.now()}.md`);
  };

  const onDownloadAdoc = () => {
    const asciiDoc = generateAsciiDoc(tablesMeta, refs);
    const blob = new Blob([asciiDoc], { type: "text/plain" });
    downloadBlob(blob, `diagram-${Date.now()}.adoc`);
  };

  return (
    // `relative` so the toolbar below anchors to this box rather than to the
    // page, and `overflow-hidden` so a stage mid-resize cannot widen the
    // document. Both matter only once the diagram shares a page with something
    // else, which is exactly when they stop being cosmetic.
    <div
      ref={containerRef}
      // The reader has to be told the mode is temporarily something else, or
      // holding space looks like the marquee has broken. The middle button
      // needs no cursor of its own: `useCursorChanger("grabbing")` is already
      // wired to the stage's drag events, which a middle-button pan goes
      // through.
      className={`relative h-full w-full overflow-hidden ${
        isPanning ? "cursor-grab" : ""
      }`}
    >
      <Stage
        draggable={stageIsDraggable}
        ref={stageRef}
        onDragStart={onGrabbing}
        onDragMove={publishViewport}
        onDragEnd={onGrabRelease}
        onWheel={handleZooming}
        onMouseDown={(event) => {
          handleStagePointerDown(event);
          onMarqueeMouseDown?.(event);
        }}
        onMouseMove={onMarqueeMouseMove}
        onTouchStart={handleStagePointerDown}
        width={viewWidth}
        height={viewHeight}
        style={{ backgroundColor: themeColors.bg }}
      >
        <Layer>
          <Group offsetX={-DIAGRAM_PADDING} offsetY={-DIAGRAM_PADDING}>
            {connections}
          </Group>
        </Layer>
        <Layer>
          <Group
            ref={tablesGroupRef}
            offsetX={-DIAGRAM_PADDING}
            offsetY={-DIAGRAM_PADDING}
          >
            {tables}
          </Group>
        </Layer>

        {marquee !== null && (
          // Its own layer, above the tables: the marquee is drawn over whatever
          // it is catching. Deaf to the pointer, so the rectangle under it
          // cannot swallow the mouse-up that ends the gesture.
          <Layer listening={false}>
            <Group offsetX={-DIAGRAM_PADDING} offsetY={-DIAGRAM_PADDING}>
              <Rect
                x={marquee.x}
                y={marquee.y}
                width={marquee.w}
                height={marquee.h}
                fill={themeColors.selection.fill}
                opacity={0.25}
                stroke={themeColors.selection.stroke}
                // Divided by the scale so the outline stays a hairline however
                // far out the reader has zoomed.
                strokeWidth={1 / (stageRef.current?.scaleX() ?? 1)}
                dash={[4, 3]}
              />
            </Group>
          </Layer>
        )}
      </Stage>

      {/* A plain wrapper, with no positioning of its own, so the toolbar inside
          still anchors to the container above rather than to this. */}
      <div className={revealControlsOnHover ? REVEAL_ON_HOVER : ""}>
        <Toolbar
          onFitToView={fitToView}
          onDownloadPng={onDownloadPng}
          onDownloadSvg={() => {
            void onDownloadSvg();
          }}
          onDownloadAdoc={onDownloadAdoc}
          onDownloadMarkdown={onDownloadMarkdown}
          onShowLegend={() => {
            setIsLegendOpen(true);
          }}
          hostActions={hostActions}
        />
      </div>

      {isLegendOpen && (
        <ShortcutsLegend
          keysAreDefaults={!keyboardShortcuts}
          onClose={() => {
            setIsLegendOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default DiagramWrapper;
