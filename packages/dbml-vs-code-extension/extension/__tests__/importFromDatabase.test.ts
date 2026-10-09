jest.mock("db-to-dbml", () => {
  const actual = jest.requireActual(
    "db-to-dbml",
  ) as typeof import("db-to-dbml");
  return {
    ...actual,
    fetchSchema: jest.fn(),
    schemaToDbml: jest.fn(),
  };
});
jest.mock("../pickImportTargets", () => ({ pickImportTargets: jest.fn() }));
jest.mock("../importDestination", () => ({
  resolveImportDestination: jest.fn(),
}));

import { commands, window, workspace } from "vscode";
import {
  DbImportError,
  DbImportErrorCode,
  fetchSchema,
  schemaToDbml,
} from "db-to-dbml";

import type { SecretStore } from "../connectionStore";
import { importFromDatabase } from "../importFromDatabase";
import { resolveImportDestination } from "../importDestination";
import { pickImportTargets } from "../pickImportTargets";

const CONNECTION = "postgres://u:p@h:5432/entry";

function fakeContext() {
  return { secrets: {} } as Parameters<typeof importFromDatabase>[0];
}

function fakeSecretsContext() {
  const map = new Map<string, string>();
  const secrets: SecretStore = {
    get: async (k) => map.get(k),
    store: async (k, v) => void map.set(k, v),
  };
  return {
    map,
    context: { secrets } as Parameters<typeof importFromDatabase>[0],
  };
}

const uriFor = (name: string): unknown => ({ path: `/tmp/${name}` });

const twoDatabases = [
  { databaseName: "billing", schemaNames: ["public"] },
  { databaseName: "orders", schemaNames: ["public"] },
];

const twoDestinations = (): unknown =>
  new Map([
    ["billing", uriFor("billing.dbml")],
    ["orders", uriFor("orders.dbml")],
  ]);

describe("importFromDatabase", () => {
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
    jest
      .mocked(fetchSchema)
      .mockReset()
      .mockResolvedValue({} as never);
    jest.mocked(schemaToDbml).mockReset().mockReturnValue({
      dbml: "Table users { id int }",
      droppedCrossSchemaRefs: 0,
    });
    jest.mocked(pickImportTargets).mockReset();
    jest.mocked(resolveImportDestination).mockReset();
    jest.mocked(window.showErrorMessage).mockReset();
    jest.mocked(window.showWarningMessage).mockReset();
    jest.mocked(window.showInformationMessage).mockReset();
    jest.mocked(window.showTextDocument).mockReset();
    jest.mocked(window.showQuickPick).mockReset();
    jest.mocked(window.showInputBox).mockReset();
    jest.mocked(workspace.fs.writeFile).mockReset();
    jest.mocked(commands.executeCommand).mockReset();
  });

  test("writes one file and opens it when one database was chosen", async () => {
    jest
      .mocked(pickImportTargets)
      .mockResolvedValue([{ databaseName: "orders", schemaNames: ["public"] }]);
    jest
      .mocked(resolveImportDestination)
      .mockResolvedValue(new Map([["orders", uriFor("public.dbml")]]) as never);

    await importFromDatabase(fakeContext(), { connectionString: CONNECTION });

    expect(workspace.fs.writeFile).toHaveBeenCalledTimes(1);
    expect(window.showTextDocument).toHaveBeenCalledWith(uriFor("public.dbml"));
    expect(commands.executeCommand).toHaveBeenCalledWith(
      "dbmlStudio.previewDiagrams",
    );
  });

  test("reads each chosen database in its own connection", async () => {
    jest.mocked(pickImportTargets).mockResolvedValue(twoDatabases);
    jest
      .mocked(resolveImportDestination)
      .mockResolvedValue(twoDestinations() as never);

    await importFromDatabase(fakeContext(), { connectionString: CONNECTION });

    expect(fetchSchema).toHaveBeenNthCalledWith(
      1,
      "postgres://u:p@h:5432/billing",
    );
    expect(fetchSchema).toHaveBeenNthCalledWith(
      2,
      "postgres://u:p@h:5432/orders",
    );
  });

  test("writes one file per database and opens none of them", async () => {
    jest.mocked(pickImportTargets).mockResolvedValue([
      { databaseName: "billing", schemaNames: ["public"] },
      { databaseName: "orders", schemaNames: ["audit", "public"] },
    ]);
    jest
      .mocked(resolveImportDestination)
      .mockResolvedValue(twoDestinations() as never);

    await importFromDatabase(fakeContext(), { connectionString: CONNECTION });

    expect(workspace.fs.writeFile).toHaveBeenCalledTimes(2);
    expect(window.showTextDocument).not.toHaveBeenCalled();
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      "Imported 2 DBML file(s).",
    );
  });

  test("keeps the databases it could read when one of them fails", async () => {
    jest.mocked(pickImportTargets).mockResolvedValue(twoDatabases);
    jest
      .mocked(resolveImportDestination)
      .mockResolvedValue(twoDestinations() as never);
    jest
      .mocked(fetchSchema)
      .mockRejectedValueOnce(
        new DbImportError(DbImportErrorCode.ACCESS_DENIED, "denied"),
      )
      .mockResolvedValueOnce({} as never);

    await importFromDatabase(fakeContext(), { connectionString: CONNECTION });

    expect(workspace.fs.writeFile).toHaveBeenCalledTimes(1);
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      "Imported 1 of 2 databases. billing: Access to this database is denied.",
    );
  });

  test("stops between databases when the user cancels", async () => {
    jest.mocked(pickImportTargets).mockResolvedValue(twoDatabases);
    jest
      .mocked(resolveImportDestination)
      .mockResolvedValue(twoDestinations() as never);
    jest.mocked(window.withProgress).mockImplementationOnce((async (
      _options: unknown,
      task: (progress: unknown, token: unknown) => Promise<unknown>,
    ) => {
      let checks = 0;
      // False on the first database, true from the second on.
      const token = {
        get isCancellationRequested() {
          return checks++ > 0;
        },
        onCancellationRequested: jest.fn(),
      };
      return await task({ report: jest.fn() }, token);
    }) as never);

    await importFromDatabase(fakeContext(), { connectionString: CONNECTION });

    expect(workspace.fs.writeFile).toHaveBeenCalledTimes(1);
    // "Imported 1 DBML file(s)" would read like the whole job was done.
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      "Cancelled after importing 1 of 2 databases.",
    );
  });

  test("fills the progress bar to the end of the last database", async () => {
    jest.mocked(pickImportTargets).mockResolvedValue(twoDatabases);
    jest
      .mocked(resolveImportDestination)
      .mockResolvedValue(twoDestinations() as never);
    const report = jest.fn();
    jest.mocked(window.withProgress).mockImplementationOnce(
      (async (
        _options: unknown,
        task: (progress: unknown, token: unknown) => Promise<unknown>,
      ) =>
        await task(
          { report },
          {
            isCancellationRequested: false,
            onCancellationRequested: jest.fn(),
          },
        )) as never,
    );

    await importFromDatabase(fakeContext(), { connectionString: CONNECTION });

    const steps = report.mock.calls as Array<[{ increment?: number }]>;
    const total = steps.reduce((sum, [step]) => sum + (step.increment ?? 0), 0);
    expect(total).toBeCloseTo(100);
  });

  test("sums the omitted cross-schema references across files", async () => {
    jest.mocked(pickImportTargets).mockResolvedValue(twoDatabases);
    jest
      .mocked(resolveImportDestination)
      .mockResolvedValue(twoDestinations() as never);
    jest
      .mocked(schemaToDbml)
      .mockReturnValueOnce({ dbml: "a", droppedCrossSchemaRefs: 2 })
      .mockReturnValueOnce({ dbml: "b", droppedCrossSchemaRefs: 3 });

    await importFromDatabase(fakeContext(), { connectionString: CONNECTION });

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      "5 cross-schema reference(s) were omitted.",
    );
  });

  test("reports a server it could not read at all", async () => {
    jest
      .mocked(pickImportTargets)
      .mockRejectedValue(
        new DbImportError(DbImportErrorCode.AUTH_FAILED, "auth"),
      );

    await importFromDatabase(fakeContext(), { connectionString: CONNECTION });

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      "Authentication failed. Check the username and password.",
    );
    expect(workspace.fs.writeFile).not.toHaveBeenCalled();
  });

  test("reports the database error itself when the only database fails", async () => {
    jest
      .mocked(pickImportTargets)
      .mockResolvedValue([{ databaseName: "orders", schemaNames: ["public"] }]);
    jest
      .mocked(resolveImportDestination)
      .mockResolvedValue(new Map([["orders", uriFor("public.dbml")]]) as never);
    jest
      .mocked(fetchSchema)
      .mockRejectedValue(
        new DbImportError(DbImportErrorCode.UNREACHABLE, "down"),
      );

    await importFromDatabase(fakeContext(), { connectionString: CONNECTION });

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      "Could not reach the database host.",
    );
  });

  test("still offers to save a connection entered by hand", async () => {
    const { map, context } = fakeSecretsContext();
    jest
      .mocked(pickImportTargets)
      .mockResolvedValue([{ databaseName: "orders", schemaNames: ["public"] }]);
    jest
      .mocked(resolveImportDestination)
      .mockResolvedValue(new Map([["orders", uriFor("public.dbml")]]) as never);
    // First quick pick is the connection chooser, the second is the save prompt.
    jest.mocked(window.showQuickPick).mockImplementation((async (
      items: unknown,
    ) => {
      const list = items as Array<{ pickKind?: string }>;
      return list.find((item) => item?.pickKind === "new") ?? "Yes";
    }) as never);
    jest
      .mocked(window.showInputBox)
      .mockResolvedValueOnce(CONNECTION)
      .mockResolvedValueOnce("saved-local");

    await importFromDatabase(context);

    expect(map.get("dbml.connections")).toBe(
      JSON.stringify({ "saved-local": CONNECTION }),
    );
  });

  test("writes a MySQL database's tables without its name in front", async () => {
    // The real generator behind the mock, fed the shape a MySQL read has: every
    // object is in a schema named after the database.
    const actual = jest.requireActual(
      "db-to-dbml",
    ) as typeof import("db-to-dbml");
    jest.mocked(schemaToDbml).mockImplementation(actual.schemaToDbml);
    jest.mocked(fetchSchema).mockResolvedValue({
      tables: [
        { name: "member", schemaName: "library" },
        { name: "book", schemaName: "library" },
      ],
      enums: [
        {
          name: "book_status_enum",
          schemaName: "library",
          values: [{ name: "available" }, { name: "lost" }],
        },
      ],
      refs: [],
      fields: {
        "library.member": [
          { name: "id", type: { type_name: "int" }, not_null: true },
        ],
        "library.book": [
          { name: "id", type: { type_name: "int" }, not_null: true },
          {
            name: "status",
            type: { type_name: "book_status_enum", schemaName: "library" },
          },
        ],
      },
      tableConstraints: {},
      indexes: {},
      checks: {},
    } as never);
    jest
      .mocked(pickImportTargets)
      .mockResolvedValue([
        { databaseName: "library", schemaNames: ["library"] },
      ]);
    jest
      .mocked(resolveImportDestination)
      .mockResolvedValue(
        new Map([["library", uriFor("library.dbml")]]) as never,
      );

    await importFromDatabase(fakeContext(), {
      connectionString: "mysql://u:p@h:3306/entry",
    });

    const written = jest.mocked(workspace.fs.writeFile).mock.calls[0][1];
    const dbml = Buffer.from(written).toString("utf-8");
    expect(dbml).toContain('Table "book" {');
    expect(dbml).not.toContain('"library".');
  });
});
