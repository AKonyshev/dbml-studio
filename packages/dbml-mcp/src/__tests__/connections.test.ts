import { connectionsFromEnv, resolveConnection } from "../connections";
import { ToolError } from "../errors";

const URL_LOCAL = "postgresql://reader:s3cret@localhost:5432/library";

// Escaped, because the sources are English (sourceLanguage.test.ts).
const PROD_RU = "\u043f\u0440\u043e\u0434"; // Russian "prod"
const PROD_RU_TITLE = "\u041f\u0440\u043e\u0434"; // the same, capitalised
const PROD_RU_UPPER = "\u041f\u0420\u041e\u0414"; // the same, upper case
const LIBRARY_ZH = "\u56fe\u4e66\u9986"; // Chinese "library"

describe("connectionsFromEnv", () => {
  it("names a connection by its lower-cased suffix", () => {
    const source = connectionsFromEnv({
      DBML_CONNECTION_LOCAL: URL_LOCAL,
      DBML_CONNECTION_LIBRARY_PROD: "postgres://x@prod/library",
      PATH: "/usr/bin",
    });
    expect(source.names()).toEqual(["library_prod", "local"]);
    expect(source.get("local")).toBe(URL_LOCAL);
  });

  it("ignores empty values", () => {
    expect(connectionsFromEnv({ DBML_CONNECTION_X: "" }).names()).toEqual([]);
  });

  it("ignores a variable with an empty suffix", () => {
    const source = connectionsFromEnv({
      DBML_CONNECTION_: URL_LOCAL,
      DBML_CONNECTION_LOCAL: URL_LOCAL,
    });
    expect(source.names()).toEqual(["local"]);
  });

  it("refuses two variables that make the same name, naming both", () => {
    expect(() =>
      connectionsFromEnv({
        DBML_CONNECTION_LOCAL: URL_LOCAL,
        DBML_CONNECTION_local: URL_LOCAL,
      }),
    ).toThrow(
      /DBML_CONNECTION_LOCAL.*DBML_CONNECTION_local|DBML_CONNECTION_local.*DBML_CONNECTION_LOCAL/,
    );
  });
});

describe("ConnectionSource.entries", () => {
  it("reports the database kind of each connection, sorted by name", () => {
    const source = connectionsFromEnv({
      DBML_CONNECTION_SHOP: "mysql://u:p@h/shop",
      DBML_CONNECTION_LOCAL: URL_LOCAL,
      DBML_CONNECTION_ERP: "Server=h;Database=erp;User Id=u;Password=p",
      DBML_CONNECTION_WEB: "mariadb://u:p@h/web",
      DBML_CONNECTION_MSSQL: "sqlserver://u:p@h/erp",
    });
    expect(source.entries()).toEqual([
      { name: "erp", database: "mssql" },
      { name: "local", database: "postgres" },
      { name: "mssql", database: "mssql" },
      { name: "shop", database: "mysql" },
      { name: "web", database: "mysql" },
    ]);
  });

  it('lists a value no database accepts as "unknown"', () => {
    const source = connectionsFromEnv({
      DBML_CONNECTION_ODD: "snowflake://u:Secr3t@a/db",
    });
    expect(source.entries()).toEqual([{ name: "odd", database: "unknown" }]);
  });
});

describe("connectionsFromEnv with DBML_CONNECTION_NAMES", () => {
  const URL_PROD = "postgresql://reader:pr0d@prod/library";

  it("names a mapped connection by its display name, in any language", () => {
    const source = connectionsFromEnv({
      DBML_CONNECTION_C1: URL_LOCAL,
      DBML_CONNECTION_C2: URL_PROD,
      DBML_CONNECTION_STAGING: "postgres://x@staging/library",
      DBML_CONNECTION_NAMES: JSON.stringify({
        C1: PROD_RU,
        C2: ` ${LIBRARY_ZH} `,
      }),
    });
    expect(source.names()).toEqual(["staging", PROD_RU, LIBRARY_ZH]);
    expect(source.get(PROD_RU)).toBe(URL_LOCAL);
    expect(source.get(LIBRARY_ZH)).toBe(URL_PROD);
    expect(source.get("c1")).toBeUndefined();
  });

  it("matches a display name regardless of case", () => {
    const source = connectionsFromEnv({
      DBML_CONNECTION_C1: URL_LOCAL,
      DBML_CONNECTION_NAMES: JSON.stringify({ C1: PROD_RU }),
    });
    expect(source.get(PROD_RU_TITLE)).toBe(URL_LOCAL);
    expect(resolveConnection(source, PROD_RU_UPPER)).toBe(URL_LOCAL);
  });

  it("matches the suffix exactly as written", () => {
    const source = connectionsFromEnv({
      DBML_CONNECTION_C1: URL_LOCAL,
      DBML_CONNECTION_NAMES: JSON.stringify({ c1: PROD_RU }),
    });
    expect(source.names()).toEqual(["c1"]);
  });

  it("is not a connection itself", () => {
    const source = connectionsFromEnv({
      DBML_CONNECTION_NAMES: JSON.stringify({}),
    });
    expect(source.names()).toEqual([]);
  });

  it.each([
    ["not JSON", `{C1: ${PROD_RU}`],
    ["an array", JSON.stringify([PROD_RU])],
    ["null", "null"],
    ["a number for a name", JSON.stringify({ C1: 1 })],
    ["an empty name", JSON.stringify({ C1: "  " })],
  ])("refuses a value that is %s, naming the variable", (_label, names) => {
    expect(() =>
      connectionsFromEnv({
        DBML_CONNECTION_C1: URL_LOCAL,
        DBML_CONNECTION_NAMES: names,
      }),
    ).toThrow(/^DBML_CONNECTION_NAMES /);
  });

  it("never quotes a connection string when it refuses the map", () => {
    expect(() =>
      connectionsFromEnv({
        DBML_CONNECTION_C1: URL_LOCAL,
        DBML_CONNECTION_NAMES: "{",
      }),
    ).toThrow(/^(?!.*s3cret)/s);
  });

  it("refuses two display names equal but for case, naming both variables", () => {
    expect(() =>
      connectionsFromEnv({
        DBML_CONNECTION_C1: URL_LOCAL,
        DBML_CONNECTION_C2: URL_PROD,
        DBML_CONNECTION_NAMES: JSON.stringify({
          C1: PROD_RU_TITLE,
          C2: PROD_RU,
        }),
      }),
    ).toThrow(
      /DBML_CONNECTION_C1.*DBML_CONNECTION_C2|DBML_CONNECTION_C2.*DBML_CONNECTION_C1/,
    );
  });

  it("refuses a display name that collides with a plain one", () => {
    expect(() =>
      connectionsFromEnv({
        DBML_CONNECTION_C1: URL_LOCAL,
        DBML_CONNECTION_LOCAL: URL_PROD,
        DBML_CONNECTION_NAMES: JSON.stringify({ C1: "Local" }),
      }),
    ).toThrow(
      /DBML_CONNECTION_C1.*DBML_CONNECTION_LOCAL|DBML_CONNECTION_LOCAL.*DBML_CONNECTION_C1/,
    );
  });
});

describe("resolveConnection", () => {
  const source = connectionsFromEnv({ DBML_CONNECTION_STAGING: URL_LOCAL });

  it("resolves a known name", () => {
    expect(resolveConnection(source, "staging")).toBe(URL_LOCAL);
  });

  it("matches a name regardless of case", () => {
    expect(resolveConnection(source, "Staging")).toBe(URL_LOCAL);
  });

  it("accepts a raw postgres URL", () => {
    expect(resolveConnection(source, "postgres://u@h/db")).toBe(
      "postgres://u@h/db",
    );
  });

  it.each([
    "mysql://u:p@h/db",
    "sqlserver://u:p@h/db",
    "Server=h;Database=db;User Id=u;Password=p",
  ])("accepts the raw connection string %s", (value) => {
    expect(resolveConnection(source, value)).toBe(value);
  });

  it("gives a raw string of a database it does not know CONNECTION_NOT_FOUND, without echoing it", () => {
    expect.assertions(3);
    try {
      resolveConnection(source, "snowflake://u:Secr3t@a/db");
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      expect((error as ToolError).code).toBe("CONNECTION_NOT_FOUND");
      expect((error as ToolError).message).not.toContain("Secr3t");
    }
  });

  it("names the three URL forms when a value matches nothing and nothing is configured", () => {
    expect(() =>
      resolveConnection(connectionsFromEnv({}), "snowflake://u:Secr3t@a/db"),
    ).toThrow(/postgres:\/\/, mysql:\/\/ or sqlserver:\/\/ URL/);
  });

  it("adds a database to a MySQL URL that names none", () => {
    expect(resolveConnection(source, "mysql://u:p@h", "library")).toBe(
      "mysql://u:p@h/library",
    );
  });

  it("answers INVALID_CONNECTION_STRING for a configured value no database accepts", async () => {
    const bad = connectionsFromEnv({
      DBML_CONNECTION_ODD: "snowflake://u:Secr3t@a/db",
    });
    expect.assertions(3);
    try {
      resolveConnection(bad, "odd");
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      expect((error as ToolError).code).toBe("INVALID_CONNECTION_STRING");
      expect((error as ToolError).message).not.toContain("Secr3t");
    }
  });

  it("switches the database when one is given", () => {
    expect(resolveConnection(source, "staging", "archive")).toBe(
      "postgresql://reader:s3cret@localhost:5432/archive",
    );
  });

  it("says which names exist when the value is neither", () => {
    expect.assertions(3);
    try {
      resolveConnection(source, "prod");
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      expect((error as ToolError).code).toBe("CONNECTION_NOT_FOUND");
      expect((error as ToolError).message).toContain("staging");
    }
  });

  it("explains how to configure one when there are none", () => {
    expect(() => resolveConnection(connectionsFromEnv({}), "prod")).toThrow(
      /DBML_CONNECTION_<NAME>/,
    );
  });

  it("never echoes the password of a raw URL it cannot use", () => {
    expect.assertions(1);
    try {
      resolveConnection(source, "postgres://u:p#ss@h/db", "other");
    } catch (error) {
      expect((error as Error).message).not.toContain("p#ss");
    }
  });

  it.each([
    "postgres:/u:Pa55@h/db",
    "user:Pa55@host/db",
    "jdbc:postgresql://u:Pa55@h/db",
  ])("does not echo a value that is not a name: %s", (value) => {
    expect.assertions(3);
    try {
      resolveConnection(source, value);
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      expect((error as ToolError).code).toBe("CONNECTION_NOT_FOUND");
      expect((error as ToolError).message).not.toContain("Pa55");
    }
  });

  it("does not echo it when no connections are configured either", () => {
    expect(() =>
      resolveConnection(connectionsFromEnv({}), "user:Pa55@host/db"),
    ).toThrow(/^(?!.*Pa55).*DBML_CONNECTION_<NAME>/s);
  });

  it("calls a raw URL no parser can read an invalid connection string, without echoing it", () => {
    expect.assertions(3);
    try {
      resolveConnection(source, "postgresql://u:WRONG PW@local host:x/db");
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      expect((error as ToolError).code).toBe("INVALID_CONNECTION_STRING");
      expect((error as ToolError).message).not.toContain("WRONG PW");
    }
  });

  it.each([
    "mysql://u:Pa55#w0rd?x@h/db",
    "sqlserver://u:Pa55@h%zz/db",
    "Server=;Database=db;User Id=u;Password=Pa55",
  ])(
    "calls a raw string its database cannot read an invalid connection string, without echoing it: %#",
    (value) => {
      expect.assertions(3);
      try {
        resolveConnection(source, value);
      } catch (error) {
        expect(error).toBeInstanceOf(ToolError);
        expect((error as ToolError).code).toBe("INVALID_CONNECTION_STRING");
        expect((error as ToolError).message).not.toContain("Pa55");
      }
    },
  );

  it("still accepts a socket URL that has no host before the path", () => {
    expect(resolveConnection(source, "postgres://u@/library?host=/tmp")).toBe(
      "postgres://u@/library?host=/tmp",
    );
  });

  it("still echoes a value that looks like a name", () => {
    expect(() => resolveConnection(source, "prod")).toThrow(
      'No connection named "prod"',
    );
  });
});
