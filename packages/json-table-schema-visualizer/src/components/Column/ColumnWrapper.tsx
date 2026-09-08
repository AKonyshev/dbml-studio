import { type ReactNode, useState } from "react";
import { Group, Rect } from "react-konva";

import type { KonvaEventObject } from "konva/lib/Node";

import { COLUMN_HEIGHT, PADDINGS } from "@/constants/sizing";
import { useTableWidth } from "@/hooks/table";
import { useIsColumnHighlighted } from "@/hooks/hover";
import { getHoveredColumn, setHoveredColumn } from "@/stores/hoverStore";
import { useIsColumnFocused } from "@/hooks/columnFocus";
import { focusColumn } from "@/stores/currentTarget";
import { openQuickEdit } from "@/stores/quickEditStore";
import { useThemeColors } from "@/hooks/theme";

interface ColumnWrapperProps {
  children: (highlighted: boolean) => ReactNode;
  offsetY?: number;
  tableName: string;
  relationalTables?: string[] | null;
  highlightColor: string;
  columnName: string;
}

const ColumnWrapper = ({
  children,
  offsetY,
  tableName,
  relationalTables,
  highlightColor,
  columnName,
}: ColumnWrapperProps) => {
  const [hovered, setHovered] = useState(false);
  const tablePreferredWidth = useTableWidth();
  const isFocused = useIsColumnFocused(tableName, columnName);
  const themeColors = useThemeColors();

  const handleClick = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
  ): void => {
    // Without this the same click also reaches the table's drag and its
    // selection, and the column would lose the focus it just took.
    event.cancelBubble = true;
    focusColumn(tableName, columnName, offsetY ?? 0);
  };

  // The mouse's way to what `F2` does. A table header's double-click is already
  // taken by its detail level, which is why renaming a table has no equivalent.
  const handleDoubleClick = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
  ): void => {
    event.cancelBubble = true;
    focusColumn(tableName, columnName, offsetY ?? 0);
    openQuickEdit({
      table: tableName,
      field: columnName,
      offsetY: offsetY ?? 0,
    });
  };

  const handleOnHover = (): void => {
    setHovered(true);
    setHoveredColumn({
      table: tableName,
      field: columnName,
      offsetY: offsetY ?? 0,
    });
  };

  const handleOnLeave = (): void => {
    setHovered(false);
    // Only if nothing else has claimed the pointer in the meantime: leaving one
    // column for the next raises the new one's enter before this leave.
    if (getHoveredColumn()?.field === columnName) {
      setHoveredColumn(null);
    }
  };

  // Its own pointer wins outright — the same short-circuit shouldHighLightCol
  // starts with — and the rest is one boolean this column alone subscribes to.
  const highlightedByHover = useIsColumnHighlighted({
    tableName,
    columnName,
    relationalTables,
  });
  const highlighted = hovered || highlightedByHover;

  return (
    <Group
      onMouseOver={handleOnHover}
      onMouseLeave={handleOnLeave}
      onClick={handleClick}
      onTap={handleClick}
      onDblClick={handleDoubleClick}
      onDblTap={handleDoubleClick}
      y={offsetY}
    >
      <Rect
        fill={highlighted ? highlightColor : "transparent"}
        width={tablePreferredWidth}
        height={COLUMN_HEIGHT}
      />
      {isFocused && (
        <Rect
          listening={false}
          stroke={themeColors.text[900]}
          strokeWidth={1}
          cornerRadius={PADDINGS.xs}
          width={tablePreferredWidth}
          height={COLUMN_HEIGHT}
        />
      )}
      {children(highlighted)}
    </Group>
  );
};

export default ColumnWrapper;
