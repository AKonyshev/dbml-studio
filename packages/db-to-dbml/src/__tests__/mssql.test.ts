import { DbImportError, DbImportErrorCode } from "../errors";
import { mssql } from "../dialects/mssql";
import { parseAdo } from "../dialects/ado";

// The real parser, to prove that what the adapter writes is what the driver
// reads. Taken before the mock below replaces the module.
const {
  ConnectionPool: RealPool,
}: {
  ConnectionPool: {
    parseConnectionString: (text: string) => Record<string, unknown> & {
      options: Record<string, unknown>;
    };
  };
} = jest.requireActual("mssql");

const connect = jest.fn();
const poolConfigs: string[] = [];
const closeGlobal = jest.fn();
jest.mock("mssql", () => ({
  __esModule: true,
  default: {
    ConnectionPool: class {
      constructor(config: string) {
        poolConfigs.push(config);
        // The driver parses the string in its constructor, and throws from it.
        if (config.includes("explode"))
          throw new Error("driver text: " + config);
      }
      async connect(): Promise<unknown> {
        return await connect();
      }
    },
    close: () => closeGlobal(),
  },
}));
const fetchSchemaJson = jest.fn();
jest.mock("@dbml/connector/dist/connectors/mssqlConnector", () => ({
  fetchSchemaJson: (conn: string) => fetchSchemaJson(conn),
}));

beforeEach(() => {
  connect.mockReset();
  fetchSchemaJson.mockReset();
  closeGlobal.mockReset();
  closeGlobal.mockResolvedValue(undefined);
  poolConfigs.length = 0;
});

const catchError = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe("SQL Server connection strings", () => {
  it("accepts sqlserver://, mssql:// and ADO strings", () => {
    expect(mssql.accepts("sqlserver://u:p@h/db")).toBe(true);
    expect(mssql.accepts("MSSQL://u:p@h/db")).toBe(true);
    expect(mssql.accepts("Server=h;Database=db;User Id=u;Password=p")).toBe(
      true,
    );
    expect(mssql.accepts("Data Source=h;Initial Catalog=db")).toBe(true);
    expect(mssql.accepts("Address=h;Database=db")).toBe(true);
    expect(mssql.accepts("mysql://u:p@h/db")).toBe(false);
    expect(mssql.accepts("snowflake://acct/db")).toBe(false);
  });

  it("turns a URL into the ADO string the driver reads", () => {
    const ado = parseAdo(
      mssql.normalize(
        "sqlserver://us%40r:p%3Bw@h:1433/library?trustServerCertificate=true",
      ),
    );
    expect(ado.get("server")).toBe("h,1433");
    expect(ado.get("database")).toBe("library");
    expect(ado.get("user id")).toBe("us@r");
    expect(ado.get("password")).toBe("p;w");
    expect(ado.get("encrypt")).toBe("true");
    expect(ado.get("trustservercertificate")).toBe("true");
  });

  it("keeps a named instance from a URL or an ADO string", () => {
    expect(
      parseAdo(
        mssql.normalize("sqlserver://u:p@h/db?instanceName=SQLEXPRESS"),
      ).get("server"),
    ).toBe("h\\SQLEXPRESS");
    expect(
      parseAdo(
        mssql.normalize(
          "Server=h\\SQLEXPRESS;Database=db;User Id=u;Password=p",
        ),
      ).get("server"),
    ).toBe("h\\SQLEXPRESS");
  });

  it("hands the driver an instance, not a port", () => {
    for (const text of [
      mssql.normalize("sqlserver://u:p@h/db?instanceName=SQLEXPRESS"),
      mssql.normalize("Server=h\\SQLEXPRESS;Database=db;User Id=u;Password=p"),
    ]) {
      const config = RealPool.parseConnectionString(text);
      expect(config.server).toBe("h");
      expect(config.options.instanceName).toBe("SQLEXPRESS");
    }
  });

  it("keeps an instance and a port apart", () => {
    const config = RealPool.parseConnectionString(
      mssql.normalize("sqlserver://u:p@h:1444/db?instanceName=SQLEXPRESS"),
    );
    expect(config.server).toBe("h");
    expect(config.port).toBe(1444);
    expect(config.options.instanceName).toBe("SQLEXPRESS");
  });

  it("spells the other ADO names for the server and the database once", () => {
    const ado = parseAdo(
      mssql.normalize("Data Source=h,1444;Initial Catalog=db;Uid=u;Pwd=p"),
    );
    expect(ado.get("server")).toBe("h,1444");
    expect(ado.has("data source")).toBe(false);
    expect(ado.get("database")).toBe("db");
    expect(ado.has("initial catalog")).toBe(false);
  });

  it("switches the database in either form", () => {
    expect(
      parseAdo(
        mssql.withDatabase(
          "Server=h;Initial Catalog=a;User Id=u;Password={x;y}",
          "library",
        ),
      ).get("database"),
    ).toBe("library");
    expect(
      parseAdo(
        mssql.withDatabase(
          "Server=h;Initial Catalog=a;User Id=u;Password={x;y}",
          "library",
        ),
      ).get("password"),
    ).toBe("x;y");
    expect(
      parseAdo(mssql.withDatabase("sqlserver://u:p@h/a", "library")).get(
        "database",
      ),
    ).toBe("library");
  });

  it("adds a database to a connection that names none", () => {
    expect(
      parseAdo(mssql.withDatabase("sqlserver://u:p@h:1433", "library")).get(
        "database",
      ),
    ).toBe("library");
    expect(mssql.databaseOf("sqlserver://u:p@h")).toBeUndefined();
    expect(mssql.databaseOf("Server=h;Database=")).toBeUndefined();
  });

  it("reads the database from either form", () => {
    expect(mssql.databaseOf("sqlserver://u:p@h/my%20db")).toBe("my db");
    expect(mssql.databaseOf("Server=h;Initial Catalog=library")).toBe(
      "library",
    );
  });

  it("defaults to dbo", () => {
    expect(mssql.defaultSchema("sqlserver://u:p@h/library")).toBe("dbo");
  });

  it("refuses a string with no server, without repeating it", () => {
    const error = catchError(() =>
      mssql.normalize("Database=db;User Id=u;Password=Secr3t"),
    );
    expect(error).toBeInstanceOf(DbImportError);
    expect((error as DbImportError).code).toBe(
      DbImportErrorCode.INVALID_CONNECTION_STRING,
    );
    expect((error as DbImportError).message).not.toContain("Secr3t");
  });

  it("refuses a string of another kind with the sentence that names every form", () => {
    const error = catchError(() => mssql.normalize("postgres://u:Secr3t@h/db"));
    expect((error as DbImportError).message).toMatch(/sqlserver:\/\//);
    expect((error as DbImportError).message).not.toContain("Secr3t");
  });

  it("refuses what the URL parser refuses, without repeating it", () => {
    const error = catchError(() =>
      mssql.normalize("sqlserver://u:Secr#t@:80:80/db"),
    );
    expect(error).toBeInstanceOf(DbImportError);
    expect((error as DbImportError).message).not.toContain("Secr");
  });
});

// The review's second case: a password that the ADO grammar and the URL
// grammar each have to protect.
describe("SQL Server passwords with ; = and }", () => {
  const password = "a;b=c}d";

  it("reaches the driver intact from a braced ADO value", () => {
    const config = RealPool.parseConnectionString(
      mssql.normalize(`Server=h;Database=db;User Id=u;Password={a;b=c}}d}`),
    );
    expect(config.password).toBe(password);
  });

  it("reaches the driver intact from a quoted ADO value", () => {
    const config = RealPool.parseConnectionString(
      mssql.normalize(`Server=h;Database=db;User Id=u;Password="a;b=c}d"`),
    );
    expect(config.password).toBe(password);
  });

  it("reaches the driver intact from a percent-encoded URL", () => {
    const config = RealPool.parseConnectionString(
      mssql.normalize(`sqlserver://u:${encodeURIComponent(password)}@h/db`),
    );
    expect(config.password).toBe(password);
  });

  it("survives withDatabase in both forms", () => {
    for (const original of [
      `Server=h;Database=a;User Id=u;Password={a;b=c}}d}`,
      `sqlserver://u:${encodeURIComponent(password)}@h/a`,
    ]) {
      const switched = mssql.withDatabase(original, "library");
      const config = RealPool.parseConnectionString(switched);
      expect(config.password).toBe(password);
      expect(config.database).toBe("library");
      // And once more: the result is itself something we read back.
      expect(
        RealPool.parseConnectionString(mssql.withDatabase(switched, "again"))
          .password,
      ).toBe(password);
    }
  });
});

describe("SQL Server malformed input", () => {
  const BAD = [
    ["host", "sqlserver://u:Secr3t@h%E0%A4%A/db"],
    ["user", "sqlserver://u%E0%A4%A:Secr3t@h/db"],
    ["password", "sqlserver://u:Secr%E0%A4%A@h/db"],
    ["database", "sqlserver://u:Secr3t@h/%E0%A4%A"],
  ] as const;

  it.each([
    ["databaseOf", (c: string) => mssql.databaseOf(c)],
    ["withDatabase", (c: string) => mssql.withDatabase(c, "library")],
    ["normalize", (c: string) => mssql.normalize(c)],
  ])(
    "%s turns a malformed escape into a fixed refusal, not a URIError",
    (_name, run) => {
      for (const [, bad] of BAD) {
        const error = catchError(() => run(bad));
        expect(error).toBeInstanceOf(DbImportError);
        expect((error as DbImportError).code).toBe(
          DbImportErrorCode.INVALID_CONNECTION_STRING,
        );
        expect((error as DbImportError).message).not.toMatch(/Secr|%E0|h%/);
      }
    },
  );

  it("refuses a malformed escape before connecting, from every async entry point", async () => {
    for (const [, bad] of BAD) {
      for (const run of [
        async () => await mssql.listDatabases(bad),
        async () => await mssql.listSchemas(bad),
        async () => await mssql.fetchSchema(bad),
      ]) {
        const error = (await run().catch((e: unknown) => e)) as DbImportError;
        expect(error).toBeInstanceOf(DbImportError);
        expect(error.code).toBe(DbImportErrorCode.INVALID_CONNECTION_STRING);
        expect(error.message).not.toMatch(/Secr|%E0|h%/);
      }
    }
    expect(poolConfigs).toEqual([]);
    expect(fetchSchemaJson).not.toHaveBeenCalled();
  });

  it("never throws from defaultSchema", () => {
    for (const [, bad] of BAD) expect(mssql.defaultSchema(bad)).toBe("dbo");
  });
});

describe("SQL Server catalogue", () => {
  const pool = (rows: unknown[]): { request: jest.Mock; close: jest.Mock } => ({
    request: jest.fn(() => ({
      query: jest.fn().mockResolvedValue({ recordset: rows }),
    })),
    close: jest.fn().mockResolvedValue(undefined),
  });

  it("lists user databases with bounded timeouts", async () => {
    const p = pool([{ name: "archive" }, { name: "library" }]);
    connect.mockResolvedValue(p);
    expect(await mssql.listDatabases("sqlserver://u:p@h/master")).toEqual([
      "archive",
      "library",
    ]);
    const config = parseAdo(poolConfigs[0]);
    expect(config.get("connect timeout")).toBe("10");
    expect(config.get("request timeout")).toBe("15000");
    expect(p.close).toHaveBeenCalled();
  });

  it("overrides the timeouts a connection string asks for, under any name", async () => {
    connect.mockResolvedValue(pool([]));
    await mssql.listSchemas(
      "Server=h;Connection Timeout=300;Timeout=300;Request Timeout=0",
    );
    const config = RealPool.parseConnectionString(poolConfigs[0]);
    expect(config.connectionTimeout).toBe(10_000);
    expect(config.requestTimeout).toBe(15_000);
  });

  it("lists the schemas of the database the string points at", async () => {
    connect.mockResolvedValue(pool([{ name: "audit" }, { name: "dbo" }]));
    expect(await mssql.listSchemas("sqlserver://u:p@h/library")).toEqual([
      "audit",
      "dbo",
    ]);
    expect(parseAdo(poolConfigs[0]).get("database")).toBe("library");
  });

  it("uses a pool of its own for each call, not the driver's global one", async () => {
    connect.mockResolvedValue(pool([]));
    await mssql.listDatabases("sqlserver://u:p@one/master");
    await mssql.listDatabases("sqlserver://u:p@two/master");
    expect(poolConfigs.map((c) => parseAdo(c).get("server"))).toEqual([
      "one",
      "two",
    ]);
    expect(closeGlobal).not.toHaveBeenCalled();
  });

  it("closes, and awaits it, when the query succeeded", async () => {
    let settled = false;
    const p = pool([{ name: "library" }]);
    p.close.mockImplementation(async () => {
      await Promise.resolve();
      settled = true;
    });
    connect.mockResolvedValue(p);
    await mssql.listDatabases("sqlserver://u:p@h/master");
    expect(settled).toBe(true);
  });

  it("starts closing and does not wait when the query fails", async () => {
    // After a timeout the request may still be running, and `close` waits for
    // the connections it holds: awaiting it would hold the caller for as long as
    // the query takes, which is what the timeout is there to prevent.
    const p = {
      request: () => ({
        query: jest.fn().mockRejectedValue({ code: "EREQUEST", number: 18456 }),
      }),
      close: jest.fn().mockReturnValue(new Promise(() => undefined)),
    };
    connect.mockResolvedValue(p);
    await expect(
      mssql.listDatabases("sqlserver://u:p@h/master"),
    ).rejects.toMatchObject({ code: DbImportErrorCode.AUTH_FAILED });
    expect(p.close).toHaveBeenCalledTimes(1);
  });

  it("copes with a close that throws on the failure path", async () => {
    const p = {
      request: () => ({
        query: jest.fn().mockRejectedValue({ code: "ETIMEOUT" }),
      }),
      close: jest.fn(() => {
        throw new Error("driver text");
      }),
    };
    connect.mockResolvedValue(p);
    await expect(
      mssql.listDatabases("sqlserver://u:p@h/master"),
    ).rejects.toMatchObject({ code: DbImportErrorCode.UNREACHABLE });
  });

  it("has nothing to close when the connect fails", async () => {
    connect.mockRejectedValue({ code: "ESOCKET" });
    await expect(
      mssql.listDatabases("sqlserver://u:p@h/master"),
    ).rejects.toMatchObject({ code: DbImportErrorCode.UNREACHABLE });
  });

  it("maps a driver that throws while parsing the string, without its text", async () => {
    const error = (await mssql
      .listDatabases("Server=h;Application Name=explode")
      .catch((e: unknown) => e)) as DbImportError;
    expect(error).toBeInstanceOf(DbImportError);
    expect(error.code).toBe(DbImportErrorCode.UNKNOWN);
    expect(error.message).not.toMatch(/driver text|explode|Server=/);
  });

  it("refuses a string of another kind before connecting", async () => {
    await expect(mssql.listDatabases("postgres://u:p@h")).rejects.toMatchObject(
      {
        code: DbImportErrorCode.INVALID_CONNECTION_STRING,
      },
    );
    expect(poolConfigs).toEqual([]);
  });
});

describe("SQL Server fetchSchema", () => {
  it("calls the connector with the ADO string, bounded", async () => {
    fetchSchemaJson.mockResolvedValue({ tables: [] });
    await mssql.fetchSchema("sqlserver://u:p%3Bw@h:1433/library");
    const sent = parseAdo(fetchSchemaJson.mock.calls[0][0] as string);
    expect(sent.get("server")).toBe("h,1433");
    expect(sent.get("database")).toBe("library");
    expect(sent.get("password")).toBe("p;w");
    expect(sent.get("connect timeout")).toBe("10");
    expect(sent.get("request timeout")).toBe("15000");
  });

  it("keeps the timeouts a connection string asks for", async () => {
    fetchSchemaJson.mockResolvedValue({ tables: [] });
    await mssql.fetchSchema(
      "Server=h;Database=db;Connect Timeout=30;Request Timeout=60000",
    );
    const config = RealPool.parseConnectionString(
      fetchSchemaJson.mock.calls[0][0] as string,
    );
    expect(config.connectionTimeout).toBe(30_000);
    expect(config.requestTimeout).toBe(60_000);
  });

  it("returns what the connector read, which already names its schemas", async () => {
    const raw = {
      tables: [{ name: "book", schemaName: "dbo" }],
      fields: { "dbo.book": [] },
      refs: [],
    };
    fetchSchemaJson.mockResolvedValue(raw);
    expect(await mssql.fetchSchema("sqlserver://u:p@h/library")).toBe(raw);
    expect(closeGlobal).not.toHaveBeenCalled();
  });

  it("maps a connector failure without the driver's text, and drops the global pool it may leave", async () => {
    fetchSchemaJson.mockRejectedValue(
      new Error("SQL connection error: Login failed for user 'u'."),
    );
    const error = (await mssql
      .fetchSchema("sqlserver://u:p@h/library")
      .catch((e: unknown) => e)) as DbImportError;
    expect(error.code).toBe(DbImportErrorCode.AUTH_FAILED);
    expect(error.message).not.toContain("'u'");
    expect(closeGlobal).toHaveBeenCalledTimes(1);
  });

  it("does not wait for the global pool to close", async () => {
    fetchSchemaJson.mockRejectedValue({ code: "ETIMEOUT" });
    closeGlobal.mockReturnValue(new Promise(() => undefined));
    await expect(
      mssql.fetchSchema("sqlserver://u:p@h/library"),
    ).rejects.toMatchObject({ code: DbImportErrorCode.UNREACHABLE });
  });

  it("survives a global close that throws", async () => {
    fetchSchemaJson.mockRejectedValue({ code: "ETIMEOUT" });
    closeGlobal.mockImplementation(() => {
      throw new Error("driver text");
    });
    await expect(
      mssql.fetchSchema("sqlserver://u:p@h/library"),
    ).rejects.toMatchObject({ code: DbImportErrorCode.UNREACHABLE });
  });

  // The connector connects through the driver's one global pool, which a second
  // `connect` with another string silently shares. Two reads at once could
  // therefore read the same server, and the first to finish closes the pool
  // under the other.
  it("reads one schema at a time", async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    fetchSchemaJson.mockImplementationOnce(async () => {
      order.push("first:start");
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      order.push("first:end");
      return { tables: [] };
    });
    fetchSchemaJson.mockImplementationOnce(async () => {
      order.push("second:start");
      return { tables: [] };
    });

    const first = mssql.fetchSchema("sqlserver://u:p@one/a");
    const second = mssql.fetchSchema("sqlserver://u:p@two/b");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order).toEqual(["first:start"]);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("goes on to the next read after one fails", async () => {
    fetchSchemaJson.mockRejectedValueOnce({ code: "ETIMEOUT" });
    fetchSchemaJson.mockResolvedValueOnce({ tables: [] });
    const first = mssql.fetchSchema("sqlserver://u:p@one/a");
    const second = mssql.fetchSchema("sqlserver://u:p@two/b");
    await expect(first).rejects.toBeInstanceOf(DbImportError);
    await expect(second).resolves.toEqual({ tables: [] });
  });
});

describe("SQL Server errors", () => {
  it.each([
    [
      { code: "ELOGIN", message: "Login failed for user 'u'." },
      DbImportErrorCode.AUTH_FAILED,
    ],
    [
      {
        code: "ELOGIN",
        message:
          'Cannot open database "nope" requested by the login. The login failed.',
      },
      DbImportErrorCode.DATABASE_NOT_FOUND,
    ],
    [
      {
        code: "EREQUEST",
        number: 229,
        message: "The SELECT permission was denied on the object",
      },
      DbImportErrorCode.ACCESS_DENIED,
    ],
    [
      { code: "ELOGIN", originalError: { info: { number: 18456 } } },
      DbImportErrorCode.AUTH_FAILED,
    ],
    [{ code: "ESOCKET" }, DbImportErrorCode.UNREACHABLE],
    [{ code: "ETIMEOUT" }, DbImportErrorCode.UNREACHABLE],
    [
      new Error("SQL connection error: Login failed for user 'u'."),
      DbImportErrorCode.AUTH_FAILED,
    ],
    [
      new Error("SQL connection error: Failed to connect to h:1433 in 15000ms"),
      DbImportErrorCode.UNREACHABLE,
    ],
    [new Error("something else, with 'u' and nope"), DbImportErrorCode.UNKNOWN],
    [undefined, DbImportErrorCode.UNKNOWN],
    [null, DbImportErrorCode.UNKNOWN],
  ])("%o -> %s, without the driver's text", (error, code) => {
    const mapped = mssql.toDbImportError(error);
    expect(mapped.code).toBe(code);
    expect(mapped.message).not.toMatch(/'u'|nope/);
  });

  it("passes a DbImportError through", () => {
    const own = new DbImportError(DbImportErrorCode.ACCESS_DENIED, "x");
    expect(mssql.toDbImportError(own)).toBe(own);
  });
});
