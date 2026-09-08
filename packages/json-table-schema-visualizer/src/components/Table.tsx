import { Group, Rect } from "react-konva";
import { useEffect, useMemo, useRef } from "react";
import { computeRelationalFieldKey } from "shared/utils/computeRelationalFieldKey";

import TableHeader from "./TableHeader";
import Column from "./Column/Column";

import type { JSONTableTable } from "shared/types/tableSchema";
import type { KonvaEventObject } from "konva/lib/Node";
import type Konva from "konva";

import {
  COLUMN_HEIGHT,
  PADDINGS,
  SELECTION_OUTLINE_INSET,
  TABLE_HEADER_HEIGHT,
} from "@/constants/sizing";
import { useThemeColors, useThemeContext } from "@/hooks/theme";
import { Theme } from "@/types/theme";
import eventEmitter from "@/events-emitter";
import { computeTableDragEventName } from "@/utils/eventName";
import { useTableDefaultPosition, useTableWidth } from "@/hooks/table";
import { setHoveredTableName } from "@/stores/hoverStore";
import { tableCoordsStore } from "@/stores/tableCoords";
import { useTableRelationsVisibility } from "@/hooks/tableRelationsVisibility";
import { useResolvedTableDetailLevel } from "@/hooks/tableDetailLevelOverride";
import { useAreRowsWorthDrawing } from "@/hooks/viewport";
import { TableDetailLevel } from "@/types/tableDetailLevel";
import { filterByDetailLevel } from "@/utils/filterByDetailLevel";
import { computeFieldMarks } from "@/utils/fieldMarks";
import { useForeignKeys } from "@/hooks/foreignKeys";
import { useIsSelectMode, useIsTableSelected } from "@/hooks/selection";
import { SELECTED_OUTLINE_NAME } from "@/constants/selection";
import { selectionStore } from "@/stores/selectionStore";
import { selectTables, toggleTableSelection } from "@/stores/currentTarget";
import {
  beginGroupDrag,
  endGroupDrag,
  moveGroupDrag,
  subscribeToGroupDrag,
} from "@/stores/groupDrag";
import { drawnTableHeight } from "@/utils/drawnTableHeight";

interface TableProps extends JSONTableTable {
  /**
   * How many columns the whole schema has, which decides whether the rows are
   * drawn at every zoom or only when the reader is close enough. It is the
   * schema that is affordable or not, not this table, so the count cannot come
   * from `fields`.
   */
  schemaColumns: number;
}

const Table = ({ fields, name, schemaColumns }: TableProps) => {
  const foreignKeys = useForeignKeys();
  const themeColors = useThemeColors();
  // The dashed outline marks a table whose relations are hidden — the same
  // state the header icon toggles, so the two always agree.
  const { isHidden: hasHiddenRefs } = useTableRelationsVisibility(name);
  const isSelected = useIsTableSelected(name);
  const isSelectMode = useIsSelectMode();
  // Its own level if the reader set one, the diagram's otherwise. Everything
  // below — the visible rows, and the height the connections and fit-to-view
  // are computed from — follows from this one value.
  const detailLevel = useResolvedTableDetailLevel(name);
  const tableRef = useRef<null | Konva.Group>(null);
  const highlightRef = useRef<null | Konva.Rect>(null);
  const { theme } = useThemeContext();
  const { x: tableX, y: tableY } = useTableDefaultPosition(name);
  const tablePreferredWidth = useTableWidth();
  const visibleFields = useMemo(() => {
    return filterByDetailLevel(fields, detailLevel);
  }, [detailLevel, fields]);
  // The footprint below is computed from `visibleFields` either way: a table
  // that changed height with zoom would move every connection anchor and shift
  // the bounds fit-to-view works from, which oscillates around the threshold.
  // Only whether the rows are drawn depends on how far out the reader is.
  const rowsAreWorthDrawing = useAreRowsWorthDrawing(schemaColumns);
  useEffect(() => {
    if (tableRef.current != null) {
      tableRef.current.x(tableX);
      tableRef.current.y(tableY);
      eventEmitter.emit(tableDragEventName, { x: tableX, y: tableY });
    }
  }, [tableX, tableY]);

  // The same function `computeDiagramBounds` frames this table with, so that
  // fit-to-view is computed for the drawing that is actually on screen.
  const tableHeight = drawnTableHeight(fields, detailLevel);

  const tableDragEventName = computeTableDragEventName(name);

  // Subscribe to highlight events for this table and animate the border
  useEffect(() => {
    const eventName = `highlight:table:${name}`;

    const handler = () => {
      const rect = highlightRef.current;
      if (rect === null || rect === undefined) return;

      const color = theme === Theme.dark ? "#FBBF24" : "#3B82F6";

      // Nombre de clignotements et intervalle
      const flashes = 3;
      const interval = 200; // ms

      let count = 0;
      rect.stroke(color);
      rect.opacity(1);
      rect.strokeWidth(5);

      const blinkInterval = setInterval(() => {
        rect.opacity(rect.opacity() === 1 ? 0 : 1);
        count++;
        if (count >= flashes * 2) {
          clearInterval(blinkInterval);
          // Reset strokeWidth and opacity
          rect.to({ strokeWidth: 0, opacity: 0, duration: 0.5 });
        }
      }, interval);
    };

    eventEmitter.on(eventName, handler);
    return () => {
      eventEmitter.off(eventName, handler);
    };
  }, [name, theme]);

  // Read through a ref rather than closed over: the drawn size changes with the
  // detail level, and the group-drag subscription below is set up once per
  // table. A captured size would write the box the table had when it mounted.
  const drawnSizeRef = useRef({ w: tablePreferredWidth, h: tableHeight });
  drawnSizeRef.current = { w: tablePreferredWidth, h: tableHeight };

  const propagateCoordinates = (node: Konva.Group) => {
    const existing = tableCoordsStore.getFullCoords(name);
    const tableCoords = {
      x: node.x(),
      y: node.y(),
      w: existing.w > 0 ? existing.w : drawnSizeRef.current.w,
      h: existing.h > 0 ? existing.h : drawnSizeRef.current.h,
    };
    eventEmitter.emit(tableDragEventName, tableCoords);
    tableCoordsStore.setFullCoords(name, tableCoords);
  };

  const handleOnDragStart = () => {
    // Dragging a table the reader has not selected is them changing their mind
    // about what they are working on: the table they took hold of becomes the
    // selection, and the group they had is let go. Without this the outlines
    // would go on claiming a group that is not the one moving.
    if (isSelectMode && !selectionStore.isSelected(name)) {
      selectTables(new Set([name]));
    }

    beginGroupDrag(name);
  };

  const handleOnDrag = (event: KonvaEventObject<DragEvent>) => {
    event.currentTarget.moveToTop();

    const node = event.target as Konva.Group;

    propagateCoordinates(node);
    moveGroupDrag(name, { x: node.x(), y: node.y() });
  };

  const handleOnDragEnd = () => {
    endGroupDrag();
  };

  useEffect(() => {
    return subscribeToGroupDrag(({ positions }) => {
      const position = positions.get(name);
      const node = tableRef.current;

      if (position === undefined || node === null) {
        return;
      }

      node.x(position.x);
      node.y(position.y);
      // The same call the table's own drag makes, so relation anchors and the
      // coordinate store follow a group move exactly as they follow a single
      // one.
      propagateCoordinates(node);
    });
    // Once per table. Everything the handler needs that can change is read
    // through a ref, so there is nothing here to re-subscribe for.
  }, [name]);

  const handleOnHover = () => {
    setHoveredTableName(name);
  };

  const handleOnBlur = () => {
    setHoveredTableName(null);
  };

  const handleOnClick = (event: KonvaEventObject<MouseEvent>) => {
    if (tableRef.current != null) {
      tableRef.current.moveToTop();
    }

    if (!isSelectMode) {
      return;
    }

    // Konva raises `click` only when the pointer did not drag, so there is
    // nothing to tell a click from a move by hand.
    if (event.evt.shiftKey) {
      toggleTableSelection(name);
      return;
    }

    selectTables(new Set([name]));
  };

  return (
    <Group
      name={`table-${name.replace(/\s+/g, "_")}`}
      ref={tableRef}
      draggable
      onDragStart={handleOnDragStart}
      onDragMove={handleOnDrag}
      onDragEnd={handleOnDragEnd}
      width={tablePreferredWidth}
      height={tableHeight}
      onMouseEnter={handleOnHover}
      onMouseLeave={handleOnBlur}
      onClick={handleOnClick}
    >
      <Rect
        shadowBlur={PADDINGS.xs}
        shadowOpacity={0.2}
        shadowColor={themeColors.table.shadow}
        shadowForStrokeEnabled={false}
        perfectDrawEnabled={false}
        height={tableHeight}
        width={tablePreferredWidth}
        fill={themeColors.table.bg}
        cornerRadius={PADDINGS.sm}
      />
      {hasHiddenRefs && (
        <Rect
          x={-3}
          y={-3}
          width={tablePreferredWidth + 6}
          height={tableHeight + 6}
          stroke="yellow"
          strokeWidth={1.5}
          dash={[6, 4]}
          fill="transparent"
          cornerRadius={PADDINGS.sm + 1}
          listening={false}
        />
      )}

      {isSelected && (
        // Its own Rect rather than the highlight one below: that one is an
        // animation that ends at `strokeWidth: 0`, and sharing it would let a
        // search hit quietly erase the outline it happened to finish on.
        <Rect
          // Named so a test can count what is selected. A canvas has no DOM to
          // query, and picking these out by stroke width catches every other
          // outline on the diagram too.
          name={SELECTED_OUTLINE_NAME}
          x={-SELECTION_OUTLINE_INSET}
          y={-SELECTION_OUTLINE_INSET}
          width={tablePreferredWidth + SELECTION_OUTLINE_INSET * 2}
          height={tableHeight + SELECTION_OUTLINE_INSET * 2}
          stroke={themeColors.selection.stroke}
          strokeWidth={2}
          fill="transparent"
          cornerRadius={PADDINGS.sm + 1}
          listening={false}
        />
      )}

      <TableHeader title={name} />
      {detailLevel !== TableDetailLevel.HeaderOnly && rowsAreWorthDrawing ? (
        <Group y={TABLE_HEADER_HEIGHT}>
          {visibleFields.map((field, index) => (
            <Column
              key={field.name}
              colName={field.name}
              tableName={name}
              isEnum={field.type.is_enum}
              marks={computeFieldMarks(
                field,
                foreignKeys.has(computeRelationalFieldKey(name, field.name)),
              )}
              isPrimaryKey={field.pk}
              offsetY={index * COLUMN_HEIGHT}
              relationalTables={field.relational_tables}
              note={field.note}
            />
          ))}
        </Group>
      ) : (
        <></>
      )}

      {/* Highlight border temporarily when the a search option is clicked */}
      <Rect
        ref={highlightRef}
        height={tableHeight}
        width={tablePreferredWidth}
        cornerRadius={PADDINGS.sm}
        stroke={theme === Theme.dark ? "#FBBF24" : "#3B82F6"}
        strokeWidth={0}
        opacity={0}
        listening={false}
      />
    </Group>
  );
};

export default Table;
