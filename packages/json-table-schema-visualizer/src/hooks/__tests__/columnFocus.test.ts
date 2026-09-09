/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";

import { useIsColumnFocused } from "../columnFocus";

import { columnFocusStore } from "@/stores/columnFocusStore";
import { clearColumnFocus, focusColumn } from "@/stores/currentTarget";

describe("useIsColumnFocused", () => {
  afterEach(() => {
    clearColumnFocus();
  });

  test("answers for the column that holds the focus", () => {
    const { result } = renderHook(() => useIsColumnFocused("users", 1));

    expect(result.current).toBe(false);

    act(() => {
      focusColumn("users", 1, 30);
    });

    expect(result.current).toBe(true);
  });

  // What the reader saw: three columns all called `new_column`, and the
  // outline on every one of them. A column is told from its namesake by
  // where it stands and by nothing else.
  test("leaves the column of the same name beneath it alone", () => {
    const second = renderHook(() => useIsColumnFocused("users", 2));
    const third = renderHook(() => useIsColumnFocused("users", 3));

    act(() => {
      focusColumn("users", 2, 60);
    });

    expect(second.result.current).toBe(true);
    expect(third.result.current).toBe(false);
  });

  test("leaves the same position in another table alone", () => {
    const { result } = renderHook(() => useIsColumnFocused("orders", 1));

    act(() => {
      focusColumn("users", 1, 30);
    });

    expect(result.current).toBe(false);
    expect(columnFocusStore.get()?.table).toBe("users");
  });
});
