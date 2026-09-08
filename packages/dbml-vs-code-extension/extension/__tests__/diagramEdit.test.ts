import {
  diagramEditResultMessage,
  readDiagramEditResult,
} from "extension-shared/extension/types/webviewCommand";

describe("readDiagramEditResult", () => {
  test("reads a success reply", () => {
    const message = diagramEditResultMessage("req-1", {
      ok: true,
      table: "users",
      field: "email",
    });

    expect(readDiagramEditResult({ data: message })).toEqual({
      requestId: "req-1",
      outcome: { ok: true, table: "users", field: "email" },
    });
  });

  test("reads a rejection", () => {
    const message = diagramEditResultMessage("req-2", {
      ok: false,
      reason: { code: "staleText" },
    });

    expect(readDiagramEditResult({ data: message })?.outcome).toEqual({
      ok: false,
      reason: { code: "staleText" },
    });
  });

  test("ignores a message that is not a reply", () => {
    expect(readDiagramEditResult({ data: { type: "setSchema" } })).toBeNull();
    expect(readDiagramEditResult({ data: null })).toBeNull();
    expect(readDiagramEditResult({ data: "not an object" })).toBeNull();
    expect(readDiagramEditResult({} as { data: unknown })).toBeNull();
  });

  test("ignores a reply that carries no request to match", () => {
    expect(
      readDiagramEditResult({ data: { type: "diagramEditResult" } }),
    ).toBeNull();
    expect(
      readDiagramEditResult({
        data: { type: "diagramEditResult", requestId: "r", outcome: null },
      }),
    ).toBeNull();
  });
});
