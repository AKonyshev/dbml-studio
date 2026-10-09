import { assertConnectionString, parseAdo } from "db-to-dbml";

import { emptyFields, sameFields } from "../connectionForm/connectionFields";
import {
  buildConnection,
  parseConnection,
} from "../connectionForm/connectionString";

import type { ConnectionFields } from "../connectionForm/connectionFields";

// The real driver's reader, to prove that what the form writes is what it reads.
const {
  ConnectionPool: RealPool,
}: {
  ConnectionPool: {
    parseConnectionString: (text: string) => Record<string, unknown> & {
      options: Record<string, unknown>;
    };
  };
} = jest.requireActual("mssql");

const named = (
  f: Omit<ConnectionFields, "name">,
  name = "shop",
): ConnectionFields => ({ ...f, name });

const catchError = (run: () => unknown): { code: string; message: string } => {
  try {
    run();
  } catch (error) {
    return error as { code: string; message: string };
  }
  throw new Error("expected a refusal");
};

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
    [
      "postgresql://u:p@[::1]:5432/db",
      { dialect: "postgres", host: "::1", port: "5432" },
    ],
    ["sqlserver://sa:p@[::1]/db", { dialect: "mssql", host: "::1", port: "" }],
  ])("%s", (text, expected) => {
    expect(parseConnection(text).fields).toMatchObject(expected);
  });

  it("leaves the port open when a named instance is given, as the driver ignores it", () => {
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

  it("carries the ADO keys it has no field for into the options", () => {
    const { fields } = parseConnection(
      "Server=h;Database=db;User Id=sa;Password={a;b};Application Name=x y;Packet Size=4096;Authentication=ActiveDirectoryPassword",
    );
    expect(fields.options).toBe(
      "application%20name=x%20y&packet%20size=4096&authentication=ActiveDirectoryPassword",
    );
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

  describe("encrypt and trustServerCertificate", () => {
    it.each([
      ["true", true],
      ["Yes", true],
      ["1", true],
      ["Strict", true],
      ["Mandatory", true],
      ["false", false],
      ["No", false],
      ["0", false],
      ["Optional", false],
    ])("reads Encrypt=%s as %s, in ADO and in a URL", (value, expected) => {
      const ado = parseConnection(
        `Server=h;Database=d;User Id=sa;Password=p;Encrypt=${value}`,
      );
      const url = parseConnection(`sqlserver://sa:p@h/d?encrypt=${value}`);
      expect(ado.fields.encrypt).toBe(expected);
      expect(url.fields.encrypt).toBe(expected);
    });

    it("keeps encryption on when the string does not say", () => {
      expect(parseConnection("Server=h;Database=d").fields.encrypt).toBe(true);
      expect(parseConnection("sqlserver://h/d").fields.encrypt).toBe(true);
    });

    it.each([
      ["true", true],
      ["Yes", true],
      ["1", true],
      ["false", false],
      ["0", false],
      ["Strict", false],
    ])("reads TrustServerCertificate=%s as %s", (value, expected) => {
      expect(
        parseConnection(`Server=h;Database=d;TrustServerCertificate=${value}`)
          .fields.trustServerCertificate,
      ).toBe(expected);
      expect(
        parseConnection(`sqlserver://h/d?trustServerCertificate=${value}`)
          .fields.trustServerCertificate,
      ).toBe(expected);
    });
  });

  describe("secrets", () => {
    it("lifts a password given in the query into the password", () => {
      const pg = parseConnection("postgresql://h/db?user=u&password=pw%40x");
      expect(pg.password).toBe("pw@x");
      expect(pg.fields.options).toBe("user=u");

      const my = parseConnection("mysql://u@h/db?PWD=a%26b&ssl=true");
      expect(my.password).toBe("a&b");
      expect(my.fields.options).toBe("ssl=true");

      const ms = parseConnection("sqlserver://sa@h/db?password=q%3Br");
      expect(ms.password).toBe("q;r");
      expect(ms.fields.options).toBe("");
    });

    it("lets the password in front of the host win over one in the query", () => {
      const { password, fields, hiddenOptions } = parseConnection(
        "postgresql://u:real@h/db?password=other&sslmode=require",
      );
      expect(password).toBe("real");
      expect(fields.options).toBe("sslmode=require");
      expect(hiddenOptions).toBe("");
    });

    it.each([
      [
        "mysql://u:p@h/db?password1=s1&passwordSha1=ab&ssl=true",
        "password1=s1&passwordSha1=ab",
      ],
      [
        "sqlserver://sa:p@h/db?Client%20Secret=cs&token=t&Access%20Token=at&MSI%20Secret=ms",
        "Client%20Secret=cs&token=t&Access%20Token=at&MSI%20Secret=ms",
      ],
      [
        "Server=h;Database=d;Password=p;Client Secret=cs;Token=t;MSI Secret=ms;ApplicationIntent=ReadOnly",
        "client%20secret=cs&token=t&msi%20secret=ms",
      ],
    ])("holds back the secret keys of %s", (text, hidden) => {
      const parsed = parseConnection(text);
      expect(parsed.hiddenOptions).toBe(hidden);
      const shown = JSON.stringify(parsed.fields).toLowerCase();
      for (const secret of [
        "password1",
        "passwordsha1",
        "secret",
        "token",
        "=cs",
        "=t&",
        "=ms",
      ]) {
        expect(shown).not.toContain(secret);
      }
    });

    it("hands a hidden key back to the build, and only there", () => {
      const text =
        "sqlserver://sa:p@h:1433/d?encrypt=true&Client%20Secret=cs&authentication=ActiveDirectoryServicePrincipal";
      const { fields, password, hiddenOptions } = parseConnection(text);
      expect(JSON.stringify(fields)).not.toContain("cs");
      expect(fields.options).toBe(
        "authentication=ActiveDirectoryServicePrincipal",
      );

      const rebuilt = buildConnection(
        named({ ...fields, host: "h2" }),
        password,
        hiddenOptions,
      );
      expect(rebuilt).toContain("@h2");
      expect(rebuilt).toContain("Client%20Secret=cs");
      expect(rebuilt).toContain(
        "authentication=ActiveDirectoryServicePrincipal",
      );
      expect(
        parseAdo(assertConnectionString(rebuilt)).get("client secret"),
      ).toBe("cs");
      expect(buildConnection(named(fields), password)).not.toContain("Secret");
    });
  });

  describe("refusals", () => {
    it("refuses what it cannot read, without repeating it", () => {
      const error = catchError(() =>
        parseConnection("snowflake://u:Secr3t@a/db"),
      );
      expect(error.code).toBe("INVALID_CONNECTION_STRING");
      expect(error.message).not.toContain("Secr3t");
    });

    it.each([
      [
        "postgresql://u:p%@h/db",
        "Connection string is not a readable PostgreSQL URL",
      ],
      [
        "postgres://u:Secr3t#x@h/db",
        "Connection string is not a readable PostgreSQL URL",
      ],
      [
        "mysql://u:Secr3t%zz@h/db",
        "Connection string is not a readable MySQL URL",
      ],
      [
        "sqlserver://u:Secr3t%zz@h/db",
        "Connection string is not a readable SQL Server connection string",
      ],
      [
        "sqlserver://u:Secr3t@/db",
        "Connection string is not a readable SQL Server connection string",
      ],
      [
        "Server=;Password=Secr3t",
        "Connection string is not a readable SQL Server connection string",
      ],
    ])("refuses %s with its dialect's sentence", (text, sentence) => {
      const error = catchError(() => parseConnection(text));
      expect(error.code).toBe("INVALID_CONNECTION_STRING");
      expect(error.message).toBe(sentence);
    });
  });
});

describe("buildConnection", () => {
  const passwords = [
    "p@ss",
    "a:b/c?d#e%f",
    "x;y",
    "'quoted",
    // Not Latin, spelled by code point: sources hold no non-English text.
    String.fromCodePoint(0x43f, 0x430, 0x440, 0x43e, 0x43b, 0x44c),
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

  it.each(["postgres", "mysql", "mssql"] as const)(
    "round-trips %s with an IPv6 host, typed with or without brackets",
    (dialect) => {
      for (const host of ["::1", "[::1]"]) {
        const fields = { ...emptyFields(dialect), name: "x", host, user: "u" };
        const built = buildConnection(fields, "p");
        expect(built).toContain("@[::1]");
        expect(built).not.toContain("[[");
        expect(() => assertConnectionString(built)).not.toThrow();
        expect(parseConnection(built).fields.host).toBe("::1");
      }
    },
  );

  it("round-trips an instance, which stands in for the port", () => {
    const fields = {
      ...emptyFields("mssql"),
      name: "x",
      host: "h",
      port: "",
      instance: "SQL",
      user: "sa",
    };
    const back = parseConnection(buildConnection(fields, "p"));
    expect(sameFields(back.fields, fields)).toBe(true);
  });

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

  it("is read by the SQL Server adapter as the server, port, instance and flags it was given", () => {
    const base = {
      ...emptyFields("mssql"),
      name: "x",
      user: "sa",
      database: "lib",
    };

    const withPort = buildConnection(
      {
        ...base,
        host: "h",
        port: "1444",
        encrypt: false,
        trustServerCertificate: true,
      },
      "p",
    );
    const ado = parseAdo(assertConnectionString(withPort));
    expect(ado.get("server")).toBe("h,1444");
    expect(ado.get("encrypt")).toBe("false");
    expect(ado.get("trustservercertificate")).toBe("true");
    expect(
      RealPool.parseConnectionString(assertConnectionString(withPort)),
    ).toMatchObject({
      server: "h",
      port: 1444,
      options: { encrypt: false, trustServerCertificate: true },
    });

    const withInstance = buildConnection(
      { ...base, host: "h", instance: "SQLEXPRESS" },
      "p",
    );
    expect(
      RealPool.parseConnectionString(assertConnectionString(withInstance)),
    ).toMatchObject({
      server: "h",
      database: "lib",
      options: {
        instanceName: "SQLEXPRESS",
        encrypt: true,
      },
    });
    expect(parseAdo(assertConnectionString(withInstance)).get("server")).toBe(
      "h\\SQLEXPRESS",
    );
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

  it("keeps the password when there is no user", () => {
    for (const dialect of ["postgres", "mysql", "mssql"] as const) {
      const built = buildConnection(
        { ...emptyFields(dialect), name: "x", user: "", database: "d" },
        "secret",
      );
      expect(built).toContain("://:secret@");
      expect(parseConnection(built).password).toBe("secret");
    }
  });

  it("encodes a # in the options so it is not read as a fragment", () => {
    const built = buildConnection(
      {
        ...emptyFields("postgres"),
        name: "x",
        user: "u",
        options: "application_name=a#b",
      },
      "p",
    );
    expect(built).toContain("application_name=a%23b");
    expect(parseConnection(built).fields.options).toBe(
      "application_name=a%23b",
    );
  });

  it("lets the SQL Server fields win over the same keys typed into the options", () => {
    const built = buildConnection(
      {
        ...emptyFields("mssql"),
        name: "x",
        host: "h",
        encrypt: true,
        options:
          "Encrypt=false&instanceName=Other&TrustServerCertificate=true&packet%20size=4096",
      },
      "p",
    );
    expect(built).toContain("encrypt=true");
    expect(built).not.toMatch(/encrypt=false/i);
    expect(built).not.toContain("Other");
    expect(built).not.toContain("rustServerCertificate");
    expect(built).toContain("packet%20size=4096");
  });

  it("leaves those keys in the options of the other dialects", () => {
    const built = buildConnection(
      { ...emptyFields("mysql"), name: "x", options: "encrypt=false" },
      "p",
    );
    expect(built).toContain("encrypt=false");
  });
});
