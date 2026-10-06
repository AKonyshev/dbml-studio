import computeTablesPositions from "../computeTablesPositions";

import type { JSONTableRef, JSONTableTable } from "shared/types/tableSchema";

import { TableDetailLevel } from "@/types/tableDetailLevel";

// Konva measures text against a real canvas, which jsdom does not provide. The
// widths only have to be consistent here: what is under test is how the heights
// move, and every table below carries the same column names.
jest.mock("../../computeTextSize", () => ({
  computeTextSize: jest.fn((text: string) => ({
    width: text.length * 8,
    height: 10,
  })),
}));

const tableWith = (name: string, columns: number): JSONTableTable => ({
  name,
  fields: Array.from({ length: columns }, (_, i) => ({
    name: `column_number_${i}`,
    type: { type_name: "integer", is_enum: false },
    is_relation: false,
  })),
  indexes: [],
  x: 0,
  y: 0,
});

const refBetween = (from: string, to: string): JSONTableRef => ({
  endpoints: [
    { relation: "1", tableName: from, fieldNames: ["column_number_0"] },
    { relation: "*", tableName: to, fieldNames: ["column_number_0"] },
  ],
});

const spanOf = (
  positions: Map<string, { x: number; y: number; w: number; h: number }>,
): { width: number; height: number } => {
  const boxes = [...positions.values()];

  return {
    width:
      Math.max(...boxes.map((b) => b.x + b.w)) -
      Math.min(...boxes.map((b) => b.x)),
    height:
      Math.max(...boxes.map((b) => b.y + b.h)) -
      Math.min(...boxes.map((b) => b.y)),
  };
};

describe("computeTablesPositions and the detail level", () => {
  // Six wide tables around one hub — the shape a documentation page embeds, and
  // the shape that made this worth doing.
  const tables = [
    tableWith("hub", 40),
    ...Array.from({ length: 5 }, (_, i) => tableWith(`spoke${i}`, 40)),
  ];
  const refs = Array.from({ length: 5 }, (_, i) =>
    refBetween("hub", `spoke${i}`),
  );

  test("packs the tables tighter when only their headers are drawn", () => {
    const full = spanOf(
      computeTablesPositions(tables, refs, TableDetailLevel.FullDetails),
    );
    const headers = spanOf(
      computeTablesPositions(tables, refs, TableDetailLevel.HeaderOnly),
    );

    // A header is a fortieth of a forty-column table, and the gaps between the
    // tables are a share of their height, so both shrink. A third is a floor
    // with room in it: what it rules out is a layout that spaces headers as
    // though they were still full-height tables, which is what leaves a frame
    // showing four names in a field of white.
    expect(headers.height).toBeLessThan(full.height / 3);
  });

  test("keeps the diagram near the shape it aims for", () => {
    const headers = spanOf(
      computeTablesPositions(tables, refs, TableDetailLevel.HeaderOnly),
    );

    // `TARGET_ASPECT` is 5:4. Compacting must not turn the diagram into a
    // ribbon: shrinking the boxes without re-running the arrangement would
    // leave the same number of columns of tables, now far too wide for what
    // they hold.
    expect(headers.width / headers.height).toBeLessThan(6);
  });
});
