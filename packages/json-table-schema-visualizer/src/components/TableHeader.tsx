import { Group, Rect, Line, Circle } from "react-konva";

import KonvaText from "./dumb/KonvaText";

import type { KonvaEventObject } from "konva/lib/Node";

import { STORAGE_KEYS } from "@/constants/storageKeys";
import {
  COLUMN_HEIGHT,
  FONT_SIZES,
  PADDINGS,
  TABLE_COLOR_HEIGHT,
} from "@/constants/sizing";
import { useThemeColors } from "@/hooks/theme";
import { useTableColor } from "@/hooks/tableColor";
import { useTableWidth } from "@/hooks/table";
import { useIsTableHovered } from "@/hooks/hover";
import useLocalStorage from "@/hooks/localStorage";
import { useTableRelationsVisibility } from "@/hooks/tableRelationsVisibility";
import { tableDetailLevelStore } from "@/stores/tableDetailLevelStore";
import { shouldShowRelationsIcon } from "@/utils/shouldShowRelationsIcon";

interface TableHeaderProps {
  title: string;
}

const RELATIONS_ICON_GUTTER = 22;
const RELATIONS_ICON_HIT = 18;
const RELATIONS_GLYPH_DX = 5;
const RELATIONS_GLYPH_R = 2.4;
const RELATIONS_GLYPH_STRIKE = 7;

const setCursor = (
  event: KonvaEventObject<MouseEvent>,
  cursor: string,
): void => {
  const container = event.target.getStage()?.container();
  if (container != null) {
    container.style.cursor = cursor;
  }
};

const TableHeader = ({ title }: TableHeaderProps) => {
  const [isShortTableName] = useLocalStorage<boolean>(
    STORAGE_KEYS.SHORT_TABLE_NAME,
    false,
  );
  const titleDisplay = isShortTableName ? title.split(".")[1] ?? title : title;
  const themeColors = useThemeColors();
  const tableColors = useTableColor(title);
  const tablePreferredWidth = useTableWidth();
  const tableMarkerColor = tableColors?.regular ?? "red";

  const isHovered = useIsTableHovered(title);
  const { isHidden, toggle } = useTableRelationsVisibility(title);
  const showIcon = shouldShowRelationsIcon(isHovered, isHidden);

  // icon geometry: a small relation glyph on the right of the header row
  const headerCenterY = TABLE_COLOR_HEIGHT + COLUMN_HEIGHT / 2;
  const iconCenterX = tablePreferredWidth - RELATIONS_ICON_GUTTER / 2;
  const glyphColor = themeColors.tableHeader.fg;

  // The mouse's way to the key's action, through the same store, so the two
  // cannot drift. `cancelBubble` for the reason the icon sets it: without it
  // the second click also reaches the table's drag and selection handling.
  const handleHeaderDoubleClick = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
  ): void => {
    event.cancelBubble = true;
    tableDetailLevelStore.cycle(title);
  };

  const handleIconClick = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
  ): void => {
    event.cancelBubble = true;
    toggle();
  };

  return (
    <Group
      onDblClick={handleHeaderDoubleClick}
      onDblTap={handleHeaderDoubleClick}
    >
      <Rect
        cornerRadius={[PADDINGS.sm, PADDINGS.sm]}
        fill={tableMarkerColor}
        height={TABLE_COLOR_HEIGHT}
        width={tablePreferredWidth}
      />

      <Rect
        y={TABLE_COLOR_HEIGHT}
        fill={themeColors.tableHeader.bg}
        width={tablePreferredWidth}
        height={COLUMN_HEIGHT}
      />

      <KonvaText
        listening={false}
        text={titleDisplay}
        y={TABLE_COLOR_HEIGHT}
        fill={themeColors.tableHeader.fg}
        width={tablePreferredWidth - RELATIONS_ICON_GUTTER}
        height={COLUMN_HEIGHT}
        align="center"
        strokeWidth={PADDINGS.xs}
        padding={PADDINGS.xs}
        fontSize={FONT_SIZES.tableTitle}
      />

      {showIcon && (
        <Group
          onClick={handleIconClick}
          onTap={handleIconClick}
          onMouseDown={(e) => {
            e.cancelBubble = true;
          }}
          onMouseEnter={(e) => {
            setCursor(e, "pointer");
          }}
          onMouseLeave={(e) => {
            setCursor(e, "default");
          }}
          opacity={isHidden ? 0.45 : 1}
        >
          {/* transparent hit area (Konva hit-tests a set fill regardless of
              alpha, so `fill="transparent"` makes this Rect clickable) */}
          <Rect
            x={iconCenterX - RELATIONS_ICON_HIT / 2}
            y={headerCenterY - RELATIONS_ICON_HIT / 2}
            width={RELATIONS_ICON_HIT}
            height={RELATIONS_ICON_HIT}
            fill="transparent"
          />
          {/* relation glyph: two nodes joined by a line */}
          <Line
            points={[
              iconCenterX - RELATIONS_GLYPH_DX,
              headerCenterY,
              iconCenterX + RELATIONS_GLYPH_DX,
              headerCenterY,
            ]}
            stroke={glyphColor}
            strokeWidth={1.5}
          />
          <Circle
            x={iconCenterX - RELATIONS_GLYPH_DX}
            y={headerCenterY}
            radius={RELATIONS_GLYPH_R}
            fill={glyphColor}
          />
          <Circle
            x={iconCenterX + RELATIONS_GLYPH_DX}
            y={headerCenterY}
            radius={RELATIONS_GLYPH_R}
            fill={glyphColor}
          />
          {/* strike-through when hidden */}
          {isHidden && (
            <Line
              points={[
                iconCenterX - RELATIONS_GLYPH_STRIKE,
                headerCenterY - RELATIONS_GLYPH_STRIKE,
                iconCenterX + RELATIONS_GLYPH_STRIKE,
                headerCenterY + RELATIONS_GLYPH_STRIKE,
              ]}
              stroke={glyphColor}
              strokeWidth={1.5}
            />
          )}
        </Group>
      )}
    </Group>
  );
};

export default TableHeader;
