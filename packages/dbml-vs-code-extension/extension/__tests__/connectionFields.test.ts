import {
  DEFAULT_PORTS,
  emptyFields,
  sameFields,
  validateFields,
} from "../connectionForm/connectionFields";

describe("validateFields", () => {
  const base = { ...emptyFields("postgres"), name: "shop" };

  it("wants a name, unique ignoring case and spaces", () => {
    expect(validateFields({ ...base, name: "  " }, []).name).toBeDefined();
    expect(
      validateFields({ ...base, name: " Shop " }, ["shop"]).name,
    ).toBeDefined();
    expect(
      validateFields({ ...base, name: "Shop" }, ["shop"], "shop").name,
    ).toBeUndefined();
    expect(
      validateFields({ ...base, name: "legacy" }, ["shop", "legacy"], "shop")
        .name,
    ).toBeDefined();
  });

  it("wants a host and a port in range, if any", () => {
    expect(validateFields({ ...base, host: "" }, []).host).toBeDefined();
    expect(validateFields({ ...base, port: "0" }, []).port).toBeDefined();
    expect(validateFields({ ...base, port: "65536" }, []).port).toBeDefined();
    expect(validateFields({ ...base, port: "abc" }, []).port).toBeDefined();
    expect(validateFields({ ...base, port: "" }, []).port).toBeUndefined();
  });

  it.each([
    "db.example.com",
    "10.0.0.5",
    "::1",
    "[::1]",
    "fe80::1",
    "localhost",
  ])("takes %s as a host", (host) => {
    expect(validateFields({ ...base, host }, []).host).toBeUndefined();
  });

  it.each([
    "h:5432",
    "[h:5432]",
    "[::1]:5432",
    "[host]",
    "h/x",
    "h?x=1",
    "h#x",
    "u@h",
    "my host",
    "h%",
    "h\\x",
    "tcp:h",
  ])("refuses %s as a host", (host) => {
    expect(validateFields({ ...base, host }, []).host).toBe(
      "The host is a name or address, without a port or path.",
    );
  });
});

describe("emptyFields", () => {
  it("starts on the dialect's default port", () => {
    for (const dialect of ["postgres", "mysql", "mssql"] as const) {
      expect(emptyFields(dialect).port).toBe(DEFAULT_PORTS[dialect]);
    }
  });
});

describe("sameFields", () => {
  const a = { ...emptyFields("postgres"), port: "8080" };
  const { name: _name, ...bare } = a;

  it("reads spelling as no difference", () => {
    expect(sameFields(bare, { ...bare, port: "08080" })).toBe(true);
    expect(sameFields(bare, { ...bare, host: " localhost " })).toBe(true);
    expect(sameFields(bare, { ...bare, options: "?" })).toBe(true);
    expect(
      sameFields({ ...bare, host: "::1" }, { ...bare, host: "[::1]" }),
    ).toBe(true);
  });

  it("sees a different port, and a flag only where the dialect has it", () => {
    expect(sameFields(bare, { ...bare, port: "8081" })).toBe(false);
    expect(sameFields(bare, { ...bare, encrypt: false })).toBe(true);
    const ms = { ...bare, dialect: "mssql" as const };
    expect(sameFields(ms, { ...ms, encrypt: false })).toBe(false);
  });
});
