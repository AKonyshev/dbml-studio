jest.mock("db-to-dbml", () => {
  const actual = jest.requireActual(
    "db-to-dbml",
  ) as typeof import("db-to-dbml");
  return {
    ...actual,
    fetchSchema: jest.fn(),
    listDatabases: jest.fn(),
    listSchemaNames: jest.fn(),
  };
});

jest.mock("schema-diff", () => {
  const actual = jest.requireActual(
    "schema-diff",
  ) as typeof import("schema-diff");
  return {
    ...actual,
    parseDbmlToModel: jest.fn(),
    databaseSchemaToModel: jest.fn(),
    diffSchemas: jest.fn(),
    renderDiffMarkdown: jest.fn(),
  };
});

import { window, workspace } from "vscode";
import {
  DbImportError,
  DbImportErrorCode,
  fetchSchema,
  listDatabases,
  listSchemaNames,
} from "db-to-dbml";
import {
  databaseSchemaToModel,
  diffSchemas,
  parseDbmlToModel,
  renderDiffMarkdown,
} from "schema-diff";

import { compareWithDatabase } from "../compareWithDatabase";

type WindowMock = {
  activeTextEditor:
    { document: { languageId: string; getText: () => string } } | undefined;
};

const windowMock = window as unknown as WindowMock;

function fakeContext() {
  return { secrets: {} } as Parameters<typeof compareWithDatabase>[0];
}

function openDbmlEditor(text = "Table users { id int }"): void {
  windowMock.activeTextEditor = {
    document: {
      languageId: "dbml",
      getText: () => text,
    },
  };
}

describe("compareWithDatabase", () => {
  // These tests drive failure paths on purpose, and the production code logs
  // the cause to the Extension Host log. Silencing it here keeps the suite's
  // output pristine — a wall of expected stack traces makes a passing run look
  // broken. Scoped to this suite, so an unexpected error elsewhere still shows.
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.mocked(console.error).mockRestore();
  });

  beforeEach(() => {
    windowMock.activeTextEditor = undefined;
    jest.mocked(fetchSchema).mockReset();
    // The server behind the tests holds one database, so the new database step
    // resolves itself and the cases below stay about what they were about.
    jest.mocked(listDatabases).mockReset().mockResolvedValue(["db"]);
    jest.mocked(listSchemaNames).mockReset();
    jest.mocked(parseDbmlToModel).mockReset();
    jest.mocked(databaseSchemaToModel).mockReset();
    jest.mocked(diffSchemas).mockReset();
    jest.mocked(renderDiffMarkdown).mockReset();
    jest.mocked(window.showErrorMessage).mockReset();
    jest.mocked(window.showWarningMessage).mockReset();
    jest.mocked(window.showTextDocument).mockReset();
    jest.mocked(workspace.openTextDocument).mockReset();
  });

  test("reports a database read error when fetching the schema fails", async () => {
    openDbmlEditor();
    jest
      .mocked(fetchSchema)
      .mockRejectedValue(
        new DbImportError(DbImportErrorCode.UNREACHABLE, "down"),
      );

    await compareWithDatabase(fakeContext(), {
      connectionString: "postgres://u:p@h/db",
    });

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      "Could not reach the database host.",
    );
  });

  test("reports a compare error when diffing fails after a successful fetch", async () => {
    openDbmlEditor();
    jest.mocked(fetchSchema).mockResolvedValue({ tables: [] } as never);
    jest.mocked(listSchemaNames).mockReturnValue(["public"]);
    jest.mocked(parseDbmlToModel).mockReturnValue({} as never);
    jest.mocked(databaseSchemaToModel).mockReturnValue({} as never);
    jest.mocked(diffSchemas).mockImplementation(() => {
      throw new Error("diff blew up");
    });

    await compareWithDatabase(fakeContext(), {
      connectionString: "postgres://u:p@h/db",
    });

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      "Failed to compare the DBML file with the database.",
    );
  });

  test("asks which database to compare against when the server has several", async () => {
    openDbmlEditor();
    jest.mocked(listDatabases).mockResolvedValue(["billing", "orders"]);
    jest.mocked(window.showQuickPick).mockResolvedValueOnce("orders" as never);
    jest.mocked(fetchSchema).mockResolvedValue({} as never);
    jest.mocked(listSchemaNames).mockReturnValue(["public"]);

    await compareWithDatabase(fakeContext(), {
      connectionString: "postgres://u:p@h:5432/entry",
    });

    expect(fetchSchema).toHaveBeenCalledWith("postgres://u:p@h:5432/orders");
  });

  test("asks nothing when the node already named the database", async () => {
    openDbmlEditor();
    jest.mocked(fetchSchema).mockResolvedValue({} as never);
    jest.mocked(listSchemaNames).mockReturnValue(["public"]);

    await compareWithDatabase(fakeContext(), {
      connectionString: "postgres://u:p@h:5432/entry",
      databaseName: "billing",
    });

    expect(listDatabases).not.toHaveBeenCalled();
    expect(fetchSchema).toHaveBeenCalledWith("postgres://u:p@h:5432/billing");
  });

  test("skips the schema pick for MySQL and compares the database itself", async () => {
    openDbmlEditor();
    jest.mocked(fetchSchema).mockResolvedValue({
      tables: [{ schemaName: "library", name: "book" }],
    } as never);
    jest.mocked(parseDbmlToModel).mockReturnValue({} as never);
    jest.mocked(databaseSchemaToModel).mockReturnValue({} as never);
    jest.mocked(diffSchemas).mockReturnValue({} as never);
    jest.mocked(renderDiffMarkdown).mockReturnValue("identical");
    jest.mocked(window.showQuickPick).mockReset();

    await compareWithDatabase(fakeContext(), {
      connectionString: "mysql://u:p@h:3306/entry",
      databaseName: "library",
    });

    expect(window.showQuickPick).not.toHaveBeenCalled();
    expect(databaseSchemaToModel).toHaveBeenCalledWith(
      expect.anything(),
      "library",
    );
  });

  test("tells the diff which database it is reading", async () => {
    openDbmlEditor();
    jest.mocked(fetchSchema).mockResolvedValue({} as never);
    jest.mocked(parseDbmlToModel).mockReturnValue({} as never);
    jest.mocked(databaseSchemaToModel).mockReturnValue({} as never);
    jest.mocked(diffSchemas).mockReturnValue({} as never);
    jest.mocked(renderDiffMarkdown).mockReturnValue("identical");

    await compareWithDatabase(fakeContext(), {
      connectionString: "mysql://u:p@h:3306/entry",
      databaseName: "library",
    });

    expect(diffSchemas).toHaveBeenCalledWith({}, {}, { dialect: "mysql" });
  });

  test("calls a MySQL enum named differently from the model's identical", async () => {
    // The real diff behind the mock, fed the shapes a MySQL read produces: the
    // connector names an inline enum after its table and column, and without the
    // dialect that reads as an enum missing on both sides.
    const actual = jest.requireActual(
      "schema-diff",
    ) as typeof import("schema-diff");
    const column = (type: string) => ({
      name: "status",
      type,
      nullable: false,
      pk: false,
    });
    const schema = (type: string, enumName: string) => ({
      tables: new Map([
        [
          "member",
          {
            schema: "library",
            name: "member",
            columns: new Map([["status", column(type)]]),
            indexes: [],
          },
        ],
      ]),
      enums: new Map([
        [enumName, { name: enumName, values: ["active", "lapsed"] }],
      ]),
      refs: [],
    });
    openDbmlEditor();
    jest.mocked(fetchSchema).mockResolvedValue({} as never);
    jest
      .mocked(parseDbmlToModel)
      .mockReturnValue(schema("membership_status", "membership_status"));
    jest
      .mocked(databaseSchemaToModel)
      .mockReturnValue(schema("member_status_enum", "member_status_enum"));
    jest.mocked(diffSchemas).mockImplementation(actual.diffSchemas);
    jest.mocked(renderDiffMarkdown).mockReturnValue("identical");

    await compareWithDatabase(fakeContext(), {
      connectionString: "mysql://u:p@h:3306/entry",
      databaseName: "library",
    });

    expect(jest.mocked(renderDiffMarkdown).mock.calls[0][0]).toEqual(
      expect.objectContaining({ identical: true }),
    );
  });

  test.each([
    ["postgres://u:p@h:5432/entry", "public"],
    ["sqlserver://u:p@h:1433/entry", "dbo"],
  ])(
    "offers the default schema of %s first in the schema pick",
    async (connection, expected) => {
      openDbmlEditor();
      jest.mocked(fetchSchema).mockResolvedValue({} as never);
      // Listed alphabetically, as the catalogue gives them.
      jest.mocked(listSchemaNames).mockReturnValue(["audit", expected].sort());
      jest
        .mocked(window.showQuickPick)
        .mockReset()
        .mockResolvedValue(undefined);

      await compareWithDatabase(fakeContext(), {
        connectionString: connection,
        databaseName: "library",
      });

      const [items] = jest.mocked(window.showQuickPick).mock.calls[0];
      expect(items).toEqual([expected, "audit"]);
    },
  );
});
