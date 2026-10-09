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

  it("drops a typed password when a string is pasted", () => {
    let s = reduce(init(), { type: "password", value: "a" });
    s = reduce(s, {
      type: "host",
      message: { type: "pasted", fields: emptyFields("mysql") },
    });
    expect(s.password).toBe("");
  });

  it("clears a stale test result when a string is pasted", () => {
    let s = reduce(init(), {
      type: "host",
      message: { type: "testResult", ok: true, databases: ["a"] },
    });
    s = reduce(s, {
      type: "host",
      message: { type: "pasted", fields: emptyFields("mysql") },
    });
    expect(s.test).toBeUndefined();
  });

  it("lets an unreadable stored connection follow the kind's default port", () => {
    let s = reduce(initialState(), {
      type: "init",
      message: {
        type: "init",
        mode: "edit",
        fields: emptyFields("postgres"),
        strings: {},
        savedNames: [],
        editing: "old",
      },
    });
    s = reduce(s, { type: "field", key: "dialect", value: "mysql" });
    expect(s.fields.port).toBe("3306");
  });

  it("keeps a stored connection's own port when the kind changes", () => {
    let s = reduce(initialState(), {
      type: "init",
      message: {
        type: "init",
        mode: "edit",
        fields: { ...emptyFields("postgres"), name: "old", port: "6543" },
        strings: {},
        savedNames: ["old"],
        editing: "old",
      },
    });
    s = reduce(s, { type: "field", key: "dialect", value: "mysql" });
    expect(s.fields.port).toBe("6543");
  });

  it("keeps a save error apart from the test result, and clears it on an edit", () => {
    let s = reduce(init(), {
      type: "host",
      message: { type: "testResult", ok: true, databases: ["a"] },
    });
    s = reduce(s, {
      type: "host",
      message: { type: "saveError", message: "taken" },
    });
    expect(s.test).toEqual({ ok: true, databases: ["a"] });
    expect(s.saveError).toBe("taken");
    expect(s.testing).toBe(false);
    s = reduce(s, { type: "field", key: "host", value: "db" });
    expect(s.saveError).toBeUndefined();
  });

  it("clears a save error on a password edit, a test and a paste", () => {
    const failed = reduce(init(), {
      type: "host",
      message: { type: "saveError", message: "taken" },
    });
    expect(
      reduce(failed, { type: "password", value: "x" }).saveError,
    ).toBeUndefined();
    expect(
      reduce(failed, { type: "host", message: { type: "testing" } }).saveError,
    ).toBeUndefined();
    expect(
      reduce(failed, {
        type: "host",
        message: { type: "pasted", fields: emptyFields("mysql") },
      }).saveError,
    ).toBeUndefined();
  });

  it("clears the paste error on the first edit", () => {
    const failed = reduce(init(), {
      type: "host",
      message: { type: "pasteError", message: "unreadable" },
    });
    expect(failed.pasteError).toBe("unreadable");
    expect(
      reduce(failed, { type: "field", key: "host", value: "db" }).pasteError,
    ).toBeUndefined();
    expect(
      reduce(failed, { type: "password", value: "x" }).pasteError,
    ).toBeUndefined();
  });
});
