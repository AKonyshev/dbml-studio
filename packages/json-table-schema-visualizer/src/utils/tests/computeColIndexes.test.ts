import { computeColIndexes, computeColIndexesKey } from "../computeColIndexes";

import { exampleData } from "@/fake/fakeJsonTables";
import { TableDetailLevel } from "@/types/tableDetailLevel";

describe("compute cols index map", () => {
  test("compute cols index map", () => {
    expect(
      computeColIndexes(exampleData.tables, () => TableDetailLevel.FullDetails),
    ).toEqual({
      "users.id": 0,
      "users.email": 1,
      "bookings.booking_date": 2,
      "bookings.country": 1,
      "bookings.id": 0,
      "follows.created_at": 3,
      "follows.following_user_id": 2,
      "follows.id": 0,
      "follows.status": 4,
      "follows.view": 1,
    });
  });
  test("a collapsed table drops out while its neighbours keep their rows", () => {
    const collapsed = exampleData.tables[0];
    const drawn = exampleData.tables[1];

    const indexes = computeColIndexes(exampleData.tables, (name) =>
      name === collapsed.name
        ? TableDetailLevel.HeaderOnly
        : TableDetailLevel.FullDetails,
    );

    // One table asking for headers used to answer for all of them, which put
    // every relation line on the wrong row of every other table.
    expect(
      indexes[computeColIndexesKey(collapsed.name, collapsed.fields[0].name)],
    ).toBeUndefined();
    expect(
      indexes[computeColIndexesKey(drawn.name, drawn.fields[0].name)],
    ).toBe(0);
  });
});
