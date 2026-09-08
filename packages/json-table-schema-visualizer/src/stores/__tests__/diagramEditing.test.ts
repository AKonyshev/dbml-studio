import {
  getDiagramEditingHost,
  setDiagramEditingHost,
} from "../diagramEditing";

describe("diagram editing host", () => {
  afterEach(() => {
    setDiagramEditingHost(null);
  });

  it("is absent until a host registers one", () => {
    expect(getDiagramEditingHost()).toBeNull();
  });

  it("hands back the registered host", async () => {
    const submit = jest.fn(
      async () => await Promise.resolve({ ok: true as const, table: "users" }),
    );
    setDiagramEditingHost({
      readFieldText: () => "id integer",
      submit,
    });

    const host = getDiagramEditingHost();

    expect(host?.readFieldText("users", "id")).toBe("id integer");

    await host?.submit({ kind: "deleteField", table: "users", field: "id" });

    expect(submit).toHaveBeenCalled();
  });

  it("withdraws on null", () => {
    setDiagramEditingHost({
      readFieldText: () => null,
      submit: async () => await Promise.resolve({ ok: true, table: "users" }),
    });
    setDiagramEditingHost(null);

    expect(getDiagramEditingHost()).toBeNull();
  });
});
