import { drawnTableHeight } from "../drawnTableHeight";

import type { JSONTableField } from "shared/types/tableSchema";

import {
  COLUMN_HEIGHT,
  PADDINGS,
  TABLE_HEADER_HEIGHT,
} from "@/constants/sizing";
import { TableDetailLevel } from "@/types/tableDetailLevel";

const plainField = (name: string): JSONTableField => ({
  name,
  type: { type_name: "int", is_enum: false },
  is_relation: false,
});

const keyField = (name: string): JSONTableField => ({
  name,
  type: { type_name: "int", is_enum: false },
  is_relation: true,
  relational_tables: ["other"],
});

describe("drawnTableHeight", () => {
  const fields = [keyField("a_id"), plainField("b"), plainField("c")];

  test("counts every column at full detail", () => {
    expect(drawnTableHeight(fields, TableDetailLevel.FullDetails)).toBe(
      TABLE_HEADER_HEIGHT + 3 * COLUMN_HEIGHT + PADDINGS.sm,
    );
  });

  test("counts no column at header level", () => {
    expect(drawnTableHeight(fields, TableDetailLevel.HeaderOnly)).toBe(
      TABLE_HEADER_HEIGHT + PADDINGS.sm,
    );
  });

  test("counts only the related columns at key level", () => {
    expect(drawnTableHeight(fields, TableDetailLevel.KeyOnly)).toBe(
      TABLE_HEADER_HEIGHT + COLUMN_HEIGHT + PADDINGS.sm,
    );
  });
});
