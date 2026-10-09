jest.mock("db-to-dbml", () => {
  const actual = jest.requireActual(
    "db-to-dbml",
  ) as typeof import("db-to-dbml");
  return {
    ...actual,
    listDatabases: jest.fn(),
    listSchemas: jest.fn(),
  };
});

import type { SecretStorage } from "vscode";
import { listDatabases, listSchemas } from "db-to-dbml";

import { ConnectionsTreeProvider } from "../connectionsTreeProvider";

// The provider only ever reads, and `getConnection` reads the one
// `dbml.connections` key — so one `get` double is the whole secret store.
const get = jest.fn();
const secrets = {
  get,
  store: jest.fn(),
  delete: jest.fn(),
  onDidChange: jest.fn(),
} as unknown as SecretStorage;

describe("ConnectionsTreeProvider", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.mocked(listDatabases).mockReset();
    jest.mocked(listSchemas).mockReset();
    get
      .mockReset()
      .mockResolvedValue(JSON.stringify({ prod: "postgres://u:p@h/entry" }));
  });

  afterEach(() => {
    jest.mocked(console.error).mockRestore();
  });

  test("expands a connection into the server's databases", async () => {
    jest.mocked(listDatabases).mockResolvedValue(["billing", "orders"]);

    const children = await new ConnectionsTreeProvider(secrets).getChildren({
      kind: "connection",
      name: "prod",
    });

    expect(children).toEqual([
      { kind: "database", connectionName: "prod", databaseName: "billing" },
      { kind: "database", connectionName: "prod", databaseName: "orders" },
    ]);
  });

  test("expands a database into its schemas, read from that database", async () => {
    jest.mocked(listSchemas).mockResolvedValue(["audit", "public"]);

    const children = await new ConnectionsTreeProvider(secrets).getChildren({
      kind: "database",
      connectionName: "prod",
      databaseName: "orders",
    });

    expect(listSchemas).toHaveBeenCalledWith("postgres://u:p@h/orders");
    expect(children).toEqual([
      {
        kind: "schema",
        connectionName: "prod",
        databaseName: "orders",
        schemaName: "audit",
      },
      {
        kind: "schema",
        connectionName: "prod",
        databaseName: "orders",
        schemaName: "public",
      },
    ]);
  });

  test("shows an error node instead of throwing when a server cannot be read", async () => {
    jest.mocked(listDatabases).mockRejectedValue(new Error("unreachable"));

    const children = await new ConnectionsTreeProvider(secrets).getChildren({
      kind: "connection",
      name: "prod",
    });

    expect(children).toEqual([
      { kind: "error", label: "Could not read the list of databases" },
    ]);
  });

  test("shows an error node when the connection has been deleted meanwhile", async () => {
    get.mockResolvedValue(JSON.stringify({}));

    const children = await new ConnectionsTreeProvider(secrets).getChildren({
      kind: "connection",
      name: "prod",
    });

    expect(children).toEqual([
      { kind: "error", label: "This connection is no longer available" },
    ]);
  });

  test("asks the server once for a node that is expanded twice", async () => {
    jest.mocked(listDatabases).mockResolvedValue(["orders"]);
    const provider = new ConnectionsTreeProvider(secrets);
    const node = { kind: "connection", name: "prod" } as const;

    await provider.getChildren(node);
    await provider.getChildren(node);

    // VS Code re-asks on every refresh, and each answer costs a connection.
    expect(listDatabases).toHaveBeenCalledTimes(1);
  });

  test("asks again after a refresh", async () => {
    jest.mocked(listDatabases).mockResolvedValue(["orders"]);
    const provider = new ConnectionsTreeProvider(secrets);
    const node = { kind: "connection", name: "prod" } as const;

    await provider.getChildren(node);
    provider.refresh();
    await provider.getChildren(node);

    expect(listDatabases).toHaveBeenCalledTimes(2);
  });

  test("does not remember a failure", async () => {
    jest
      .mocked(listDatabases)
      .mockRejectedValueOnce(new Error("unreachable"))
      .mockResolvedValueOnce(["orders"]);
    const provider = new ConnectionsTreeProvider(secrets);
    const node = { kind: "connection", name: "prod" } as const;

    expect(await provider.getChildren(node)).toEqual([
      { kind: "error", label: "Could not read the list of databases" },
    ]);
    // Collapsing and expanding again is how anyone retries a server that was
    // down; ⟳ must not be the only way back.
    expect(await provider.getChildren(node)).toEqual([
      { kind: "database", connectionName: "prod", databaseName: "orders" },
    ]);
  });

  test("never leaves a rejection sitting in the cache", async () => {
    const provider = new ConnectionsTreeProvider(secrets);
    // Reaching past the error-node contract: whatever slips through it, a
    // rejected promise must not become the permanent answer for that node.
    const databaseNodes = jest
      .fn()
      .mockRejectedValueOnce(new Error("slipped through"))
      .mockResolvedValueOnce([
        { kind: "database", connectionName: "prod", databaseName: "orders" },
      ]);
    (provider as unknown as { databaseNodes: unknown }).databaseNodes =
      databaseNodes;
    const node = { kind: "connection", name: "prod" } as const;

    await expect(provider.getChildren(node)).rejects.toThrow("slipped through");
    expect(await provider.getChildren(node)).toEqual([
      { kind: "database", connectionName: "prod", databaseName: "orders" },
    ]);
  });

  test("says so when the secret store itself fails", async () => {
    // A locked or broken keychain rejects rather than answering empty. VS Code
    // renders a rejected getChildren as a silent empty node, so the failure has
    // to come back as a child that says what happened.
    get.mockReset().mockRejectedValue(new Error("keychain is locked"));
    const provider = new ConnectionsTreeProvider(secrets);

    expect(
      await provider.getChildren({ kind: "connection", name: "prod" }),
    ).toEqual([
      { kind: "error", label: "This connection is no longer available" },
    ]);
    expect(
      await provider.getChildren({
        kind: "database",
        connectionName: "prod",
        databaseName: "orders",
      }),
    ).toEqual([
      { kind: "error", label: "This connection is no longer available" },
    ]);
  });

  test("does not remember a secret store that failed", async () => {
    get
      .mockReset()
      .mockRejectedValueOnce(new Error("keychain is locked"))
      .mockResolvedValue(JSON.stringify({ prod: "postgres://u:p@h/entry" }));
    jest.mocked(listDatabases).mockResolvedValue(["orders"]);
    const provider = new ConnectionsTreeProvider(secrets);
    const node = { kind: "connection", name: "prod" } as const;

    await provider.getChildren(node);

    // Unlocking the keychain and expanding again has to be enough.
    expect(await provider.getChildren(node)).toEqual([
      { kind: "database", connectionName: "prod", databaseName: "orders" },
    ]);
  });

  test("keeps each database's schemas apart in the cache", async () => {
    jest
      .mocked(listSchemas)
      .mockResolvedValueOnce(["public"])
      .mockResolvedValueOnce(["audit"]);
    const provider = new ConnectionsTreeProvider(secrets);

    const billing = await provider.getChildren({
      kind: "database",
      connectionName: "prod",
      databaseName: "billing",
    });
    const orders = await provider.getChildren({
      kind: "database",
      connectionName: "prod",
      databaseName: "orders",
    });

    expect(billing).toEqual([
      {
        kind: "schema",
        connectionName: "prod",
        databaseName: "billing",
        schemaName: "public",
      },
    ]);
    expect(orders).toEqual([
      {
        kind: "schema",
        connectionName: "prod",
        databaseName: "orders",
        schemaName: "audit",
      },
    ]);
  });

  test("expands a MySQL connection straight into its databases as schemas", async () => {
    get
      .mockReset()
      .mockResolvedValue(JSON.stringify({ shop: "mysql://u:p@h:3306/entry" }));
    jest.mocked(listDatabases).mockResolvedValue(["library"]);

    const children = await new ConnectionsTreeProvider(secrets).getChildren({
      kind: "connection",
      name: "shop",
    });

    expect(children).toEqual([
      {
        kind: "schema",
        connectionName: "shop",
        databaseName: "library",
        schemaName: "library",
      },
    ]);
  });

  test("shows the dialect beside a connection, never the connection string", async () => {
    get.mockReset().mockResolvedValue(
      JSON.stringify({
        shop: "mysql://u:Secr3t@h:3306/library",
        broken: "not a connection string",
      }),
    );
    const provider = new ConnectionsTreeProvider(secrets);
    await provider.getChildren({ kind: "group", id: "connections", label: "" });

    const shop = provider.getTreeItem({ kind: "connection", name: "shop" });
    const broken = provider.getTreeItem({ kind: "connection", name: "broken" });

    expect(shop.description).toBe("mysql");
    expect(String(shop.description)).not.toContain("Secr3t");
    expect(broken.description).toBeUndefined();
  });

  test("marks the node kinds so the context menus can tell them apart", () => {
    const provider = new ConnectionsTreeProvider(secrets);

    expect(
      provider.getTreeItem({ kind: "connection", name: "prod" }).contextValue,
    ).toBe("dbmlConnection");
    expect(
      provider.getTreeItem({
        kind: "database",
        connectionName: "prod",
        databaseName: "orders",
      }).contextValue,
    ).toBe("dbmlDatabase");
    expect(
      provider.getTreeItem({
        kind: "schema",
        connectionName: "prod",
        databaseName: "orders",
        schemaName: "audit",
      }).contextValue,
    ).toBe("dbmlSchema");
  });
});
