import { applyDiagramEdit } from "extension-shared/extension/views/applyDiagramEdit";
import { WebviewCommand } from "extension-shared/extension/types/webviewCommand";

import type { ApplyDiagramEditMessage } from "extension-shared/extension/types/webviewCommand";
import type { EditOperation } from "shared/types/diagramEdit";
import type { TextEdit } from "dbml-to-json-table-schema";

const source = [
  "Table users {",
  "  id integer [pk]",
  "  email varchar",
  "}",
  "",
].join("\n");

const deps = (
  text: string,
  over: { isUntitled?: boolean; writable?: boolean } = {},
): {
  applied: TextEdit[];
  openDocument: () => Promise<{
    getText: () => string;
    isUntitled: boolean;
    isClosed: boolean;
  }>;
  applyEdit: (document: unknown, edits: TextEdit[]) => Promise<boolean>;
} => {
  const applied: TextEdit[] = [];

  return {
    applied,
    openDocument: async () => ({
      getText: () => text,
      isUntitled: over.isUntitled ?? false,
      isClosed: false,
      languageId: "dbml",
    }),
    applyEdit: async (_document: unknown, edits: TextEdit[]) => {
      if (over.writable === false) {
        return false;
      }
      applied.push(...edits);

      return true;
    },
  };
};

const request = (
  operation: EditOperation,
  expectedText?: string,
): ApplyDiagramEditMessage => ({
  command: WebviewCommand.APPLY_DIAGRAM_EDIT,
  documentUri: "file:///a.dbml",
  requestId: "r1",
  operation,
  expectedText,
});

describe("applyDiagramEdit", () => {
  test("applies the planned ranges and answers with the new identity", async () => {
    const d = deps(source);
    const outcome = await applyDiagramEdit(
      request({
        kind: "replaceField",
        table: "users",
        at: 1,
        text: "contact varchar",
      }),
      d,
    );

    expect(outcome).toEqual({ ok: true, table: "users", at: 1 });
    expect(d.applied).toHaveLength(1);
    expect(d.applied[0].text).toBe("contact varchar");
  });

  test("writes nothing when the candidate does not parse", async () => {
    const d = deps(source);
    const outcome = await applyDiagramEdit(
      request({
        kind: "replaceField",
        table: "users",
        at: 1,
        text: "email varchar [[[",
      }),
      d,
    );

    expect(outcome.ok).toBe(false);
    expect(d.applied).toEqual([]);
  });

  test("refuses an untitled document before planning anything", async () => {
    const d = deps(source, { isUntitled: true });
    const outcome = await applyDiagramEdit(
      request({ kind: "deleteField", table: "users", at: 1 }),
      d,
    );

    expect(outcome).toEqual({ ok: false, reason: { code: "notEditable" } });
    expect(d.applied).toEqual([]);
  });

  test("refuses when the document no longer holds the expected text", async () => {
    const d = deps(source);
    const outcome = await applyDiagramEdit(
      request(
        {
          kind: "replaceField",
          table: "users",
          at: 1,
          text: "email text",
        },
        "email varchar [unique]",
      ),
      d,
    );

    expect(outcome).toEqual({ ok: false, reason: { code: "staleText" } });
    expect(d.applied).toEqual([]);
  });

  test("reports a refused write as not editable", async () => {
    const d = deps(source, { writable: false });
    const outcome = await applyDiagramEdit(
      request({ kind: "deleteField", table: "users", at: 1 }),
      d,
    );

    expect(outcome).toEqual({ ok: false, reason: { code: "notEditable" } });
  });
});
