import { DbImportError, DbImportErrorCode } from "../errors";
import { mysql } from "../dialects/mysql";

const createConnection = jest.fn();
jest.mock("mysql2/promise", () => ({
  createConnection: (options: unknown) => createConnection(options),
}));
const fetchSchemaJson = jest.fn();
jest.mock("@dbml/connector/dist/connectors/mysqlConnector", () => ({
  fetchSchemaJson: (conn: string) => fetchSchemaJson(conn),
}));

beforeEach(() => {
  createConnection.mockReset();
  fetchSchemaJson.mockReset();
});

const catchError = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe("mysql connection strings", () => {
  it("accepts mysql:// and mariadb://, case-insensitively", () => {
    expect(mysql.accepts("mysql://u:p@h/db")).toBe(true);
    expect(mysql.accepts("MariaDB://u:p@h/db")).toBe(true);
    expect(mysql.accepts("postgres://u:p@h/db")).toBe(false);
  });

  it("hands mariadb:// to the driver as mysql://", () => {
    expect(mysql.normalize("mariadb://u:p@h:3306/library")).toBe(
      "mysql://u:p@h:3306/library",
    );
    expect(mysql.normalize("MariaDB://u:p@h:3306/library")).toBe(
      "mysql://u:p@h:3306/library",
    );
  });

  it("leaves the rest of the string exactly as written", () => {
    const url = "mysql://u:p%23w%3B@h:3306/library?ssl=true&charset=utf8mb4";
    expect(mysql.normalize(url)).toBe(url);
    expect(mysql.normalize("mysql://u:p@h:3306")).toBe("mysql://u:p@h:3306");
  });

  it("switches the database, keeping credentials and options", () => {
    expect(
      mysql.withDatabase("mysql://u:p%23w@h:3306/a?ssl=true", "library"),
    ).toBe("mysql://u:p%23w@h:3306/library?ssl=true");
  });

  it("adds a database to a URL that names none", () => {
    expect(mysql.withDatabase("mysql://u:p@h:3306", "library")).toBe(
      "mysql://u:p@h:3306/library",
    );
  });

  it("writes a mariadb:// URL back as mysql://, with the new database", () => {
    expect(mysql.withDatabase("mariadb://u:p@h/a", "library")).toBe(
      "mysql://u:p@h/library",
    );
  });

  it("reads the database and uses it as the default schema", () => {
    expect(mysql.databaseOf("mysql://u:p@h/library")).toBe("library");
    expect(mysql.databaseOf("mysql://u:p@h")).toBeUndefined();
    expect(mysql.databaseOf("mysql://u:p@h/")).toBeUndefined();
    expect(mysql.databaseOf("mysql://u:p@h/my%20db")).toBe("my db");
    expect(mysql.defaultSchema("mysql://u:p@h/library")).toBe("library");
  });

  it.each([
    ["databaseOf", (c: string) => mysql.databaseOf(c)],
    ["withDatabase", (c: string) => mysql.withDatabase(c, "library")],
    ["normalize", (c: string) => mysql.normalize(c)],
    ["defaultSchema", (c: string) => mysql.defaultSchema(c)],
  ])(
    "%s turns a malformed escape into a fixed refusal, not a URIError",
    (_name, run) => {
      for (const bad of [
        "mysql://u:p@h/%E0%A4%A",
        "mysql://u:Secr%E0%A4%A@h/db",
        "mysql://u:p@h%E0%A4%A/db",
      ]) {
        const error = catchError(() => run(bad));
        expect(error).toBeInstanceOf(DbImportError);
        expect((error as DbImportError).code).toBe(
          DbImportErrorCode.INVALID_CONNECTION_STRING,
        );
        expect((error as DbImportError).message).not.toMatch(/Secr|%E0|h%/);
      }
    },
  );

  it("refuses what the URL parser refuses, without repeating it", () => {
    const error = catchError(() =>
      mysql.normalize("mysql://u:Secr#t@:80:80/db"),
    );
    expect(error).toBeInstanceOf(DbImportError);
    expect((error as DbImportError).message).not.toContain("Secr");
  });
});

describe("mysql catalogue", () => {
  const client = (
    rows: unknown[],
  ): { query: jest.Mock; end: jest.Mock; destroy: jest.Mock } => ({
    query: jest.fn().mockResolvedValue([rows]),
    end: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn(),
  });

  it("lists user databases, system ones left out, with bounded timeouts", async () => {
    const c = client([
      { name: "information_schema" },
      { name: "library" },
      { name: "mysql" },
      { name: "performance_schema" },
      { name: "sys" },
      { name: "archive" },
    ]);
    createConnection.mockResolvedValue(c);
    expect(await mysql.listDatabases("mysql://u:p@h:3306")).toEqual([
      "archive",
      "library",
    ]);
    expect(createConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: "mysql://u:p@h:3306",
        connectTimeout: 10_000,
      }),
    );
    expect(c.query).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 15_000 }),
    );
    expect(c.end).toHaveBeenCalled();
  });

  it("reads SHOW DATABASES rows whatever their column is called", async () => {
    createConnection.mockResolvedValue(
      client([{ Database: "library" }, { Database: "SYS" }]),
    );
    expect(await mysql.listDatabases("mysql://u:p@h")).toEqual(["library"]);
  });

  it("connects with mysql:// when given mariadb://", async () => {
    createConnection.mockResolvedValue(client([]));
    await mysql.listDatabases("mariadb://u:p@h:3306/library");
    expect(createConnection).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "mysql://u:p@h:3306/library" }),
    );
  });

  it("drops the connection when the query fails, without waiting for it to end", async () => {
    // After a timeout the query is still running and `end` queues behind it, so
    // it would not settle for as long as the query takes.
    const c = {
      query: jest
        .fn()
        .mockRejectedValue({ code: "ER_ACCESS_DENIED_ERROR", errno: 1045 }),
      end: jest.fn().mockReturnValue(new Promise(() => undefined)),
      destroy: jest.fn(),
    };
    createConnection.mockResolvedValue(c);
    await expect(mysql.listDatabases("mysql://u:p@h")).rejects.toMatchObject({
      code: DbImportErrorCode.AUTH_FAILED,
    });
    expect(c.destroy).toHaveBeenCalled();
    expect(c.end).not.toHaveBeenCalled();
  });

  it("ends, and does not destroy, a connection whose query succeeded", async () => {
    const c = client([{ Database: "library" }]);
    createConnection.mockResolvedValue(c);
    await mysql.listDatabases("mysql://u:p@h");
    expect(c.end).toHaveBeenCalled();
    expect(c.destroy).not.toHaveBeenCalled();
  });

  it("maps a connect that throws before it returns a promise", async () => {
    createConnection.mockImplementation(() => {
      throw new URIError("URI malformed");
    });
    await expect(mysql.listDatabases("mysql://u:p@h")).rejects.toMatchObject({
      code: DbImportErrorCode.UNKNOWN,
      message: expect.not.stringContaining("malformed"),
    });
  });

  it("refuses a malformed escape in the host before connecting", async () => {
    const bad = "mysql://u:Secr3t@h%E0%A4%A/db";
    for (const run of [
      async () => await mysql.listDatabases(bad),
      async () => await mysql.fetchSchema(bad),
      async () => await Promise.resolve(mysql.withDatabase(bad, "library")),
    ]) {
      const error = (await run().catch((e: unknown) => e)) as DbImportError;
      expect(error).toBeInstanceOf(DbImportError);
      expect(error.code).toBe(DbImportErrorCode.INVALID_CONNECTION_STRING);
      expect(error.message).not.toMatch(/Secr3t|%E0|h%/);
    }
    expect(createConnection).not.toHaveBeenCalled();
    expect(fetchSchemaJson).not.toHaveBeenCalled();
  });

  it("maps a failed connect", async () => {
    createConnection.mockRejectedValue({ code: "ECONNREFUSED" });
    await expect(mysql.listDatabases("mysql://u:p@h")).rejects.toMatchObject({
      code: DbImportErrorCode.UNREACHABLE,
    });
  });

  it("refuses a malformed string before connecting", async () => {
    await expect(mysql.listDatabases("postgres://u:p@h")).rejects.toMatchObject(
      { code: DbImportErrorCode.INVALID_CONNECTION_STRING },
    );
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("lists the database itself as its one schema, without connecting", async () => {
    expect(await mysql.listSchemas("mysql://u:p@h/library")).toEqual([
      "library",
    ]);
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("lists no schema when the URL names no database", async () => {
    expect(await mysql.listSchemas("mysql://u:p@h:3306")).toEqual([]);
  });
});

describe("mysql fetchSchema", () => {
  it("refuses a URL without a database, saying so", async () => {
    await expect(mysql.fetchSchema("mysql://u:p@h:3306")).rejects.toMatchObject(
      {
        code: DbImportErrorCode.INVALID_CONNECTION_STRING,
        message: expect.stringMatching(/name a database/i),
      },
    );
    expect(fetchSchemaJson).not.toHaveBeenCalled();
  });

  it("calls the mysql connector with a mysql:// URL", async () => {
    fetchSchemaJson.mockResolvedValue({ tables: [] });
    await mysql.fetchSchema("mariadb://u:p@h/library");
    expect(fetchSchemaJson).toHaveBeenCalledWith("mysql://u:p@h/library");
  });

  it("maps a connector failure without the driver's text", async () => {
    fetchSchemaJson.mockRejectedValue(
      new Error(
        "MySQL connection error: Access denied for user 'u'@'h' (using password: YES)",
      ),
    );
    const error = (await mysql
      .fetchSchema("mysql://u:p@h/library")
      .catch((e: unknown) => e)) as DbImportError;
    expect(error.code).toBe(DbImportErrorCode.AUTH_FAILED);
    expect(error.message).not.toContain("'u'@'h'");
  });

  // The connector reads a MySQL database as one unnamed namespace: tables,
  // enums, reference ends and the keys of `fields`, `indexes` and
  // `tableConstraints` carry no schema. Everything downstream — the filter, the
  // DBML export, the diff — addresses a table as `schema.table`, and a MySQL
  // schema is its database.
  it("names the database as the schema of everything the connector returns", async () => {
    fetchSchemaJson.mockResolvedValue({
      tables: [{ name: "book", note: { value: "" } }],
      enums: [{ name: "book_kind_enum", values: [{ name: "novel" }] }],
      refs: [
        {
          name: "book_ibfk_1",
          endpoints: [
            { tableName: "book", fieldNames: ["author_id"], relation: "*" },
            { tableName: "author", fieldNames: ["id"], relation: "1" },
          ],
        },
      ],
      fields: {
        book: [
          { name: "id", type: { type_name: "int", schemaName: null } },
          {
            name: "kind",
            type: { type_name: "book_kind_enum", schemaName: null },
          },
        ],
      },
      indexes: { book: [{ name: "by_title", columns: [] }] },
      tableConstraints: { book: { id: { pk: true } } },
    });

    const db = await mysql.fetchSchema("mysql://u:p@h/library");

    expect(db.tables).toEqual([
      { name: "book", note: { value: "" }, schemaName: "library" },
    ]);
    expect(db.enums?.[0]).toMatchObject({
      name: "book_kind_enum",
      schemaName: "library",
    });
    expect(db.refs?.[0].endpoints.map((e) => e.schemaName)).toEqual([
      "library",
      "library",
    ]);
    expect(Object.keys(db.fields ?? {})).toEqual(["library.book"]);
    expect(Object.keys(db.indexes ?? {})).toEqual(["library.book"]);
    expect(Object.keys(db.tableConstraints ?? {})).toEqual(["library.book"]);
    const fields = (db.fields as Record<string, Array<{ type: unknown }>>)[
      "library.book"
    ];
    // Only a column typed by an enum of this database points at that schema.
    expect(fields[0].type).toEqual({ type_name: "int", schemaName: null });
    expect(fields[1].type).toEqual({
      type_name: "book_kind_enum",
      schemaName: "library",
    });
  });

  it("copes with a connector result that omits whole sections", async () => {
    fetchSchemaJson.mockResolvedValue({ tables: [] });
    const db = await mysql.fetchSchema("mysql://u:p@h/library");
    expect(db.tables).toEqual([]);
    expect(db.refs ?? []).toEqual([]);
    expect(db.fields ?? {}).toEqual({});
  });
});

describe("mysql errors", () => {
  it.each([
    [
      { code: "ER_ACCESS_DENIED_ERROR", errno: 1045 },
      DbImportErrorCode.AUTH_FAILED,
    ],
    [
      { code: "ER_BAD_DB_ERROR", errno: 1049 },
      DbImportErrorCode.DATABASE_NOT_FOUND,
    ],
    [
      { code: "ER_DBACCESS_DENIED_ERROR", errno: 1044 },
      DbImportErrorCode.ACCESS_DENIED,
    ],
    [{ code: "ECONNREFUSED" }, DbImportErrorCode.UNREACHABLE],
    [
      new Error(
        "MySQL connection error: Error: Access denied for user 'u'@'h' (using password: YES)",
      ),
      DbImportErrorCode.AUTH_FAILED,
    ],
    [
      new Error("MySQL connection error: Error: Unknown database 'nope'"),
      DbImportErrorCode.DATABASE_NOT_FOUND,
    ],
    [
      new Error("Access denied for user 'u'@'h' to database 'nope'"),
      DbImportErrorCode.ACCESS_DENIED,
    ],
    [new Error("something else, with 'u'@'h'"), DbImportErrorCode.UNKNOWN],
  ])("%o -> %s, without the driver's text", (error, code) => {
    const mapped = mysql.toDbImportError(error);
    expect(mapped.code).toBe(code);
    expect(mapped.message).not.toMatch(/'u'@'h'|nope/);
  });

  it("passes a DbImportError through", () => {
    const own = new DbImportError(DbImportErrorCode.ACCESS_DENIED, "x");
    expect(mysql.toDbImportError(own)).toBe(own);
  });
});
