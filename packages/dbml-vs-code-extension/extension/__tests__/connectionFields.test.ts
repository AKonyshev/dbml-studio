import { assertConnectionString } from "db-to-dbml";

import {
  buildConnection,
  emptyFields,
  parseConnection,
  sameFields,
  validateFields,
  type ConnectionFields,
} from "../connectionForm/connectionFields";

const named = (
  f: Omit<ConnectionFields, "name">,
  name = "shop",
): ConnectionFields => ({ ...f, name });

describe("parseConnection", () => {
  it.each([
    [
      "postgres://u:p@h:5432/db",
      {
        dialect: "postgres",
        host: "h",
        port: "5432",
        user: "u",
        database: "db",
      },
    ],
    [
      "postgresql://u@h/db",
      { dialect: "postgres", host: "h", port: "", user: "u", database: "db" },
    ],
    [
      "mysql://root:p@localhost:3306/library",
      {
        dialect: "mysql",
        host: "localhost",
        port: "3306",
        user: "root",
        database: "library",
      },
    ],
    ["mariadb://u:p@h/db", { dialect: "mysql", host: "h", database: "db" }],
    [
      "sqlserver://sa:p@h:1433/library?trustServerCertificate=true",
      {
        dialect: "mssql",
        host: "h",
        port: "1433",
        user: "sa",
        database: "library",
        encrypt: true,
        trustServerCertificate: true,
      },
    ],
    [
      "Server=h,1433;Initial Catalog=library;User Id=sa;Password=p;Encrypt=false",
      {
        dialect: "mssql",
        host: "h",
        port: "1433",
        database: "library",
        user: "sa",
        encrypt: false,
      },
    ],
    [
      "Server=h\\SQLEXPRESS;Database=db;User Id=sa;Password=p",
      { dialect: "mssql", host: "h", instance: "SQLEXPRESS", port: "" },
    ],
  ])("%s", (text, expected) => {
    expect(parseConnection(text).fields).toMatchObject(expected);
  });

  it("leaves the port open when a named instance is given, as the driver refuses both", () => {
    expect(
      parseConnection(
        "Server=tcp:h\\SQL,1433;Database=db;User Id=sa;Password=p",
      ).fields,
    ).toMatchObject({
      host: "h",
      instance: "SQL",
      port: "",
    });
  });

  it("carries the ADO keys it has no field for into the options, by the names the URL form reads", () => {
    const { fields } = parseConnection(
      "Server=h;Database=db;User Id=sa;Password={a;b};Application Name=x y;Packet Size=4096",
    );
    expect(fields.options).toBe("applicationName=x%20y&packet%20size=4096");
    expect(() =>
      assertConnectionString(buildConnection({ ...fields, name: "x" }, "a;b")),
    ).not.toThrow();
  });

  it("keeps the password out of the fields", () => {
    const { fields, password } = parseConnection("mysql://u:S%40cr%23t@h/db");
    expect(password).toBe("S@cr#t");
    expect(JSON.stringify(fields)).not.toContain("S@cr#t");
  });

  it("keeps parameters it has no field for, verbatim", () => {
    expect(
      parseConnection(
        "postgresql://u:p@h/db?sslmode=require&application_name=x",
      ).fields.options,
    ).toBe("sslmode=require&application_name=x");
  });

  it("refuses what it cannot read, without repeating it", () => {
    expect.assertions(2);
    try {
      parseConnection("snowflake://u:Secr3t@a/db");
    } catch (error) {
      expect((error as { code: string }).code).toBe(
        "INVALID_CONNECTION_STRING",
      );
      expect((error as Error).message).not.toContain("Secr3t");
    }
  });
});

describe("buildConnection", () => {
  const passwords = [
    "p@ss",
    "a:b/c?d#e%f",
    "x;y",
    "'quoted",
    "\u043f\u0430\u0440\u043e\u043b\u044c",
  ];

  it.each(["postgres", "mysql", "mssql"] as const)(
    "round-trips %s with awkward passwords",
    (dialect) => {
      for (const password of passwords) {
        const fields = {
          ...emptyFields(dialect),
          name: "x",
          user: "u",
          database: "library",
        };
        const built = buildConnection(fields, password);
        expect(() => assertConnectionString(built)).not.toThrow();
        const back = parseConnection(built);
        expect(back.password).toBe(password);
        expect(sameFields(back.fields, fields)).toBe(true);
      }
    },
  );

  it("writes an instance instead of a port, and the SQL Server flags", () => {
    const built = buildConnection(
      {
        ...emptyFields("mssql"),
        name: "x",
        host: "h",
        instance: "SQLEXPRESS",
        user: "sa",
        trustServerCertificate: true,
      },
      "p",
    );
    expect(built).toMatch(/^sqlserver:\/\/sa:p@h\/\?.*instanceName=SQLEXPRESS/);
    expect(built).toContain("trustServerCertificate=true");
    expect(built).toContain("encrypt=true");
  });

  it("keeps options when only the host changed", () => {
    const { fields, password } = parseConnection(
      "postgresql://u:p@h/db?sslmode=require&application_name=x",
    );
    const built = buildConnection(named({ ...fields, host: "h2" }), password);
    expect(built).toContain("@h2");
    expect(built).toContain("sslmode=require");
    expect(built).toContain("application_name=x");
  });
});

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
});
