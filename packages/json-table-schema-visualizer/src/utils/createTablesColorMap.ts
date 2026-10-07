import { type JSONTableTable } from "shared/types/tableSchema";

import { getTableColorFromName } from "./colors/getTableColorFromName";
import { getContrastColor } from "./colors/getContrastColor";

import { type TableColors } from "@/types/tableColor";

export const createTablesColorMap = (
  tables: JSONTableTable[],
): Map<string, TableColors> => {
  const tableColors = new Map<string, TableColors>();
  tables.forEach((table) => {
    // An explicit header colour wins; an absent or empty one falls back to the
    // colour derived from the table name.
    const tableColor =
      table.headerColor != null && table.headerColor.length > 0
        ? {
            regular: table.headerColor,
            lighter: getContrastColor(table.headerColor),
          }
        : getTableColorFromName(table.name);

    tableColors.set(table.name, tableColor);
  });

  return tableColors;
};
