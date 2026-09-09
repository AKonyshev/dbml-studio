import { hoverStore } from "../hoverStore";

describe("hoverStore", () => {
  beforeEach(() => {
    hoverStore.setHoveredTableName(null);
    hoverStore.setHighlightedColumns([]);
  });

  test("tells subscribers when the hovered table changes", () => {
    let calls = 0;
    const stop = hoverStore.subscribe(() => {
      calls++;
    });

    hoverStore.setHoveredTableName("users");
    expect(hoverStore.getHoveredTableName()).toBe("users");
    expect(calls).toBe(1);

    stop();
  });

  // The pointer generates a stream of events over the same table; waking every
  // subscriber for each of them is what made moving the mouse expensive.
  test("stays quiet when the hovered table is the same as before", () => {
    hoverStore.setHoveredTableName("users");

    let calls = 0;
    const stop = hoverStore.subscribe(() => {
      calls++;
    });

    hoverStore.setHoveredTableName("users");
    hoverStore.setHoveredTableName("users");

    expect(calls).toBe(0);
    stop();
  });

  test("stays quiet when the highlighted columns are the same keys", () => {
    hoverStore.setHighlightedColumns(["a.x", "b.y"]);

    let calls = 0;
    const stop = hoverStore.subscribe(() => {
      calls++;
    });

    // A fresh array with the same contents is what a re-render hands it.
    hoverStore.setHighlightedColumns(["a.x", "b.y"]);
    expect(calls).toBe(0);

    hoverStore.setHighlightedColumns(["a.x"]);
    expect(calls).toBe(1);

    stop();
  });

  test("releases the pointed-at column when its own row is left", () => {
    hoverStore.setHoveredColumn({ table: "users", at: 0, offsetY: 0 });
    hoverStore.releaseHoveredColumn("users", 0);

    expect(hoverStore.getHoveredColumn()).toBeNull();
  });

  test("leaves the column of another table alone", () => {
    // The pointer moved from `users.id` onto `orders.id`: the new row's enter
    // lands before the old row's leave.
    hoverStore.setHoveredColumn({ table: "orders", at: 0, offsetY: 40 });
    hoverStore.releaseHoveredColumn("users", 0);

    expect(hoverStore.getHoveredColumn()).toEqual({
      table: "orders",
      at: 0,
      offsetY: 40,
    });
  });

  test("stops telling a subscriber that has unsubscribed", () => {
    let calls = 0;
    const stop = hoverStore.subscribe(() => {
      calls++;
    });
    stop();

    hoverStore.setHoveredTableName("orders");

    expect(calls).toBe(0);
  });
});
