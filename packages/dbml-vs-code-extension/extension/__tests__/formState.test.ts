import { emptyFields } from "../connectionForm/connectionFields";
import {
  canSave,
  errors,
  initialState,
  persistable,
  reduce,
  visibleFields,
} from "../connectionForm/formState";

const init = (mode: "new" | "edit" = "new") =>
  reduce(initialState(), {
    type: "init",
    message: {
      type: "init",
      mode,
      fields: { ...emptyFields("postgres"), name: "shop" },
      strings: {},
      savedNames: ["legacy"],
    },
  });

describe("formState", () => {
  it("swaps the default port with the kind until the user edits it", () => {
    let s = reduce(init(), { type: "field", key: "dialect", value: "mysql" });
    expect(s.fields.port).toBe("3306");
    s = reduce(s, { type: "field", key: "port", value: "13306" });
    s = reduce(s, { type: "field", key: "dialect", value: "mssql" });
    expect(s.fields.port).toBe("13306");
  });

  it("shows SQL Server's fields for SQL Server only", () => {
    expect(visibleFields("mssql")).toEqual(
      expect.arrayContaining(["instance", "encrypt", "trustServerCertificate"]),
    );
    expect(visibleFields("postgres")).not.toContain("instance");
    expect(visibleFields("mysql")).not.toContain("trustServerCertificate");
  });

  it("disables Save while a field is wrong", () => {
    const s = reduce(init(), { type: "field", key: "name", value: "Legacy" });
    expect(errors(s).name).toBeDefined();
    expect(canSave(s)).toBe(false);
  });

  it("fills the fields from a pasted string and marks the port as given", () => {
    const s = reduce(init(), {
      type: "host",
      message: {
        type: "pasted",
        fields: { ...emptyFields("mysql"), host: "db", port: "3307" },
      },
    });
    expect(s.fields).toMatchObject({
      name: "shop",
      dialect: "mysql",
      host: "db",
      port: "3307",
    });
    expect(s.portTouched).toBe(true);
  });

  it("never lets the password into what is persisted", () => {
    const s = reduce(init(), { type: "password", value: "Secr3t" });
    expect(JSON.stringify(persistable(s))).not.toContain("Secr3t");
  });

  it("tracks a test in flight and its result", () => {
    let s = reduce(init(), { type: "host", message: { type: "testing" } });
    expect(s.testing).toBe(true);
    s = reduce(s, {
      type: "host",
      message: { type: "testResult", ok: true, databases: ["a", "b"] },
    });
    expect(s).toMatchObject({
      testing: false,
      test: { ok: true, databases: ["a", "b"] },
    });
  });
});
