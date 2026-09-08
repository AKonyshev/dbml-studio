/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from "@testing-library/react";

import QuickEditPopup from "../QuickEditPopup";

import type { EditOutcome } from "shared/types/diagramEdit";
import type { JSONTableField, JSONTableTable } from "shared/types/tableSchema";

import { setDiagramEditingHost } from "@/stores/diagramEditing";
import { closeQuickEdit, openQuickEdit } from "@/stores/quickEditStore";
import { setSchemaTables } from "@/stores/schemaIndexStore";
import { tableCoordsStore } from "@/stores/tableCoords";

// The box positions itself from the table's coordinates and measures text
// through Konva, neither of which jsdom has.
jest.mock("@/utils/computeTextSize", () => ({
  computeTextSize: jest.fn((text: string) => ({
    width: text.length * 8,
    height: 10,
  })),
}));

const fakeStorage = (): Storage => {
  const items = new Map<string, string>();

  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
    clear: () => {
      items.clear();
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    get length() {
      return items.size;
    },
  } as unknown as Storage;
};

const submitting = (
  outcome: EditOutcome | ((operation: unknown) => EditOutcome),
): jest.Mock =>
  jest.fn(async (operation: unknown) =>
    typeof outcome === "function" ? outcome(operation) : outcome,
  );

const host = (
  submit: jest.Mock,
  line = "email varchar",
  resolveRenamedTable?: (table: string, newName: string) => string | null,
): void => {
  setDiagramEditingHost({
    readFieldText: () => line,
    submit,
    resolveRenamedTable,
  });
};

const open = (): void => {
  act(() => {
    openQuickEdit({ table: "users", field: "email", offsetY: 30 });
  });
};

const box = (): HTMLTextAreaElement => screen.getByRole("textbox");

beforeAll(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: fakeStorage(),
    configurable: true,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    value: fakeStorage(),
    configurable: true,
  });
});

const column = (name: string, type: string): JSONTableField => {
  const field: JSONTableField = {
    name,
    type: { type_name: type, is_enum: false },
    is_relation: false,
  };

  return field;
};

const users: JSONTableTable = {
  name: "users",
  fields: [
    column("id", "uuid"),
    column("email", "varchar"),
    column("name", "varchar"),
  ],
  indexes: [],
  x: 0,
  y: 0,
};

beforeEach(() => {
  tableCoordsStore.switchTo("doc", [], []);
  tableCoordsStore.setCoords("users", { x: 0, y: 0 });
  setSchemaTables([users]);
});

afterEach(() => {
  act(() => {
    closeQuickEdit();
  });
  setDiagramEditingHost(null);
});

describe("QuickEditPopup", () => {
  it("opens holding the column's line as it stands in the file", () => {
    host(submitting({ ok: true, table: "users", field: "email" }));
    render(<QuickEditPopup />);
    open();

    expect(box().value).toBe("email varchar");
  });

  it("applies on Enter with the text the box opened against", async () => {
    const submit = submitting({ ok: true, table: "users", field: "email" });
    host(submit);
    render(<QuickEditPopup />);
    open();

    fireEvent.change(box(), { target: { value: "email varchar [unique]" } });
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter" });
    });

    expect(submit).toHaveBeenCalledWith(
      {
        kind: "replaceField",
        table: "users",
        field: "email",
        text: "email varchar [unique]",
      },
      "email varchar",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("keeps the text and shows the reason when the host refuses", async () => {
    host(
      submitting({
        ok: false,
        reason: { code: "parseError", message: 'Expected "]"' },
      }),
    );
    render(<QuickEditPopup />);
    open();

    fireEvent.change(box(), { target: { value: "email varchar [[[" } });
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter" });
    });

    expect(box().value).toBe("email varchar [[[");
    expect(screen.getByText(/Expected "\]"/)).toBeTruthy();
  });

  it("applies when the reader clicks anywhere else", async () => {
    const submit = submitting({ ok: true, table: "users", field: "email" });
    host(submit);
    render(<QuickEditPopup />);
    open();

    fireEvent.change(box(), { target: { value: "email text" } });
    await act(async () => {
      fireEvent.pointerDown(document.body);
    });

    expect(submit).toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("throws typing away on Escape", async () => {
    const submit = submitting({ ok: true, table: "users", field: "email" });
    host(submit);
    render(<QuickEditPopup />);
    open();

    fireEvent.change(box(), { target: { value: "email text" } });
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Escape" });
    });

    expect(submit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  // The chain the spec asks for, and the one that used to break: the second
  // request aimed at the column's *old* name and carried the *old* text.
  it("adds a column below, aimed at the column's new name", async () => {
    const submit = submitting((operation) => {
      const op = operation as { kind: string; field?: string };
      if (op.kind === "replaceField") {
        return { ok: true, table: "users", field: "contact" };
      }

      return { ok: true, table: "users", field: "new_column" };
    });
    host(submit);
    render(<QuickEditPopup />);
    open();

    fireEvent.change(box(), { target: { value: "contact varchar" } });
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter", ctrlKey: true });
    });

    expect(submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "insertFieldAfter", field: "contact" }),
      undefined,
    );
  });

  // The reader renames a table the diagram shows schema-qualified, and types a
  // name that does not repeat the prefix. The host puts the prefix back, so the
  // table arrives under a name the typed text never spelled — and the position
  // carried ahead of the write has to be filed under *that* name, or the table
  // is drawn with no coordinates and paints at the origin until the reply lands.
  it("carries the position to the name the host will answer with", async () => {
    tableCoordsStore.setCoords("acl.analysis", { x: 400, y: 250 });
    let knownAtSubmit: boolean | null = null;
    const submit = jest.fn(async (): Promise<EditOutcome> => {
      knownAtSubmit = tableCoordsStore.hasCoords("acl.analysis111");

      return { ok: true, table: "acl.analysis111" };
    });
    host(submit, "email varchar", (_table, typed) => `acl.${typed}`);
    render(<QuickEditPopup />);
    act(() => {
      openQuickEdit({ table: "acl.analysis", offsetY: 0 });
    });

    fireEvent.change(box(), { target: { value: "analysis111" } });
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter" });
    });

    expect(knownAtSubmit).toBe(true);
    expect(tableCoordsStore.getCoords("acl.analysis111")).toEqual(
      expect.objectContaining({ x: 400, y: 250 }),
    );
  });

  // A rename refused by the host has two halves to undo: the reader has to be
  // told why, and the position carried ahead of the write has to go back where
  // it came from. Silence here is what a reader reports as "F2 does nothing".
  it("says why a rename was refused and puts the carried position back", async () => {
    tableCoordsStore.setCoords("users", { x: 400, y: 250 });
    const submit = submitting({
      ok: false,
      reason: { code: "tableNotFound" },
    });
    host(submit, "email varchar", (_table, typed) => typed);
    render(<QuickEditPopup />);
    act(() => {
      openQuickEdit({ table: "users", offsetY: 0 });
    });

    fireEvent.change(box(), { target: { value: "people" } });
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter" });
    });

    expect(box().value).toBe("people");
    expect(screen.getByText(/no longer in the document/)).toBeTruthy();
    expect(tableCoordsStore.getCoords("users")).toEqual(
      expect.objectContaining({ x: 400, y: 250 }),
    );
    expect(tableCoordsStore.hasCoords("people")).toBe(false);
  });

  it("moves to the row drawn below on Tab", async () => {
    host(submitting({ ok: true, table: "users", field: "email" }));
    render(<QuickEditPopup />);
    open();

    await act(async () => {
      fireEvent.keyDown(box(), { key: "Tab" });
    });

    expect(box().getAttribute("aria-label")).toBe("name");
  });

  it("sends nothing further while the host has not answered", async () => {
    const held: { answer?: (outcome: EditOutcome) => void } = {};
    const submit = jest.fn(
      async () =>
        await new Promise<EditOutcome>((resolve) => {
          held.answer = resolve;
        }),
    );
    host(submit);
    render(<QuickEditPopup />);
    open();

    fireEvent.change(box(), { target: { value: "email varchar [unique]" } });
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter" });
    });
    // The reader presses it again because nothing has happened yet.
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter" });
    });

    expect(submit).toHaveBeenCalledTimes(1);

    await act(async () => {
      held.answer?.({ ok: true, table: "users", field: "email" });
    });
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("closes on Tab from the last row", async () => {
    host(submitting({ ok: true, table: "users", field: "name" }));
    render(<QuickEditPopup />);
    act(() => {
      openQuickEdit({ table: "users", field: "name", offsetY: 60 });
    });

    await act(async () => {
      fireEvent.keyDown(box(), { key: "Tab" });
    });

    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
