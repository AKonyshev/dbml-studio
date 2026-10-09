import * as fs from "fs";
import * as path from "path";

import {
  ACTION_NODES,
  CONNECTION_UNAVAILABLE,
  DATABASES_UNREADABLE,
  GROUP_NODES,
  SCHEMAS_UNREADABLE,
  buildConnectionNodes,
  buildDatabaseNodes,
  buildSchemaNodes,
  errorNode,
  type PanelNode,
} from "../panelNodes";

describe("buildConnectionNodes", () => {
  test("returns one connection node per name", () => {
    expect(buildConnectionNodes(["a", "b"])).toEqual([
      { kind: "connection", name: "a" },
      { kind: "connection", name: "b" },
    ]);
  });

  test("returns a single empty node when there are no connections", () => {
    expect(buildConnectionNodes([])).toEqual([
      { kind: "empty", label: "No saved connections" },
    ]);
  });
});

describe("buildDatabaseNodes", () => {
  test("returns one database node per name, carrying its connection", () => {
    expect(
      buildDatabaseNodes("prod", ["billing", "orders"], "postgres"),
    ).toEqual([
      { kind: "database", connectionName: "prod", databaseName: "billing" },
      { kind: "database", connectionName: "prod", databaseName: "orders" },
    ]);
  });

  test("returns a single empty node when the server has none", () => {
    expect(buildDatabaseNodes("prod", [], "postgres")).toEqual([
      { kind: "empty", label: "No databases" },
    ]);
  });

  test("goes straight to a schema node for MySQL, where a database is a schema", () => {
    expect(buildDatabaseNodes("shop", ["library"], "mysql")).toEqual([
      {
        kind: "schema",
        connectionName: "shop",
        databaseName: "library",
        schemaName: "library",
      },
    ]);
  });

  test("keeps the database level for SQL Server", () => {
    expect(buildDatabaseNodes("shop", ["library"], "mssql")).toEqual([
      { kind: "database", connectionName: "shop", databaseName: "library" },
    ]);
  });
});

describe("buildSchemaNodes", () => {
  test("returns one schema node per name, carrying its database", () => {
    expect(buildSchemaNodes("prod", "orders", ["audit", "public"])).toEqual([
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

  test("returns a single empty node when the database has none", () => {
    expect(buildSchemaNodes("prod", "orders", [])).toEqual([
      { kind: "empty", label: "No user schemas" },
    ]);
  });
});

describe("ACTION_NODES / contributed commands", () => {
  test("every action node command id is a contributed command", () => {
    const pkgPath = path.join(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      contributes: { commands: Array<{ command: string }> };
    };
    const contributed = new Set(pkg.contributes.commands.map((c) => c.command));
    for (const node of ACTION_NODES) {
      if (node.kind === "action") {
        expect(contributed.has(node.commandId)).toBe(true);
      }
    }
  });
});

describe("panel labels / translation bundles", () => {
  // Every static string the panel renders goes through vscode.l10n.t, which
  // keys off the English source string. A label with no bundle entry silently
  // falls back to English, so a half-translated panel ships unnoticed — that is
  // exactly how the labels shipped untranslated once already. Tooling cannot
  // spot a hardcoded English string, but it can check that each one is
  // translated everywhere.
  const panelLabels = (): string[] => {
    const nodes: PanelNode[] = [
      ...GROUP_NODES,
      ...ACTION_NODES,
      ...buildConnectionNodes([]),
      ...buildDatabaseNodes("c", [], "postgres"),
      ...buildSchemaNodes("c", "d", []),
      errorNode(CONNECTION_UNAVAILABLE),
      errorNode(DATABASES_UNREADABLE),
      errorNode(SCHEMAS_UNREADABLE),
    ];
    return nodes.flatMap((node) =>
      node.kind === "connection" ||
      node.kind === "database" ||
      node.kind === "schema"
        ? []
        : [node.label],
    );
  };

  const bundle = (locale: string): Record<string, string> => {
    const bundlePath = path.join(
      __dirname,
      "..",
      "..",
      "l10n",
      `bundle.l10n.${locale}.json`,
    );
    return JSON.parse(fs.readFileSync(bundlePath, "utf8")) as Record<
      string,
      string
    >;
  };

  test.each(["ru", "zh-cn"])(
    "every panel label is translated in %s",
    (locale) => {
      const translations = bundle(locale);
      const untranslated = panelLabels().filter(
        (label) => !(label in translations),
      );

      expect(untranslated).toEqual([]);
    },
  );
});
