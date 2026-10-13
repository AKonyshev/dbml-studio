import { getWebviewHtml } from "virtual:vscode";
import { window, type ExtensionContext } from "vscode";
import { DbImportError, DbImportErrorCode, listDatabases } from "db-to-dbml";

import {
  emptyFields,
  type ConnectionFields,
} from "../connectionForm/connectionFields";
import { buildConnection } from "../connectionForm/connectionString";
import {
  closeConnectionForm,
  openConnectionForm,
} from "../connectionForm/connectionFormPanel";
import { formStrings } from "../connectionForm/strings";
import {
  deleteConnection,
  getConnection,
  listConnections,
  saveConnection,
  type SecretStore,
} from "../connectionStore";

jest.mock("db-to-dbml", () => ({
  ...jest.requireActual("db-to-dbml"),
  listDatabases: jest.fn(),
}));

const listDatabasesMock = listDatabases as jest.MockedFunction<
  typeof listDatabases
>;

// Values that are secret in some scenario below. No message to the page may
// contain one of them, nor any URL.
const SECRETS = ["Secr3t", "hunter2", "tok3n", "p@", "://", "Password="];

interface FakePanel {
  webview: {
    html: string;
    postMessage: jest.Mock;
    onDidReceiveMessage: jest.Mock;
  };
  onDidDispose: jest.Mock;
  reveal: jest.Mock;
  dispose: jest.Mock;
  receive: (message: unknown) => void;
}

const panels: FakePanel[] = [];
const posted: unknown[] = [];

function fakePanel(): FakePanel {
  let handler: (message: unknown) => void = () => undefined;
  const onDispose: Array<() => void> = [];
  let disposed = false;
  const panel: FakePanel = {
    webview: {
      html: "",
      postMessage: jest.fn(async (message: unknown) => {
        posted.push(message);
        return true;
      }),
      onDidReceiveMessage: jest.fn((cb: (message: unknown) => void) => {
        handler = cb;
        return { dispose: jest.fn() };
      }),
    },
    onDidDispose: jest.fn((cb: () => void) => {
      onDispose.push(cb);
      return { dispose: jest.fn() };
    }),
    reveal: jest.fn(),
    dispose: jest.fn(() => {
      if (disposed) {
        return;
      }
      disposed = true;
      onDispose.forEach((cb) => {
        cb();
      });
    }),
    receive: (message) => {
      handler(message);
    },
  };
  panels.push(panel);
  return panel;
}

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setImmediate(resolve));
};

const messagesOf = (panel: FakePanel): Array<Record<string, unknown>> =>
  panel.webview.postMessage.mock.calls.map(
    (call) => call[0] as Record<string, unknown>,
  );

const lastOf = (panel: FakePanel, type: string): Record<string, unknown> => {
  const found = messagesOf(panel).filter((m) => m.type === type);
  return found[found.length - 1];
};

function memoryStore(initial: Record<string, string> = {}): SecretStore {
  const data = new Map<string, string>();
  if (Object.keys(initial).length > 0) {
    data.set("dbml.connections", JSON.stringify(initial));
  }
  return {
    get: async (key) => data.get(key),
    store: async (key, value) => {
      data.set(key, value);
    },
  };
}

const SHOP = "Server=h,1433;Database=db;User Id=sa;Password=p";

const setup = (initial: Record<string, string> = {}) => {
  const secrets = memoryStore(initial);
  const refresh = jest.fn();
  const deps = {
    context: {
      secrets,
      extensionUri: { path: "/ext" },
    } as unknown as ExtensionContext,
    refresh,
  };
  return { secrets, refresh, deps };
};

const fieldsOf = (over: Partial<ConnectionFields> = {}): ConnectionFields => ({
  ...emptyFields("postgres"),
  name: "shop",
  host: "h",
  user: "u",
  database: "db",
  ...over,
});

const initFields = (panel: FakePanel): ConnectionFields =>
  (lastOf(panel, "init") as unknown as { fields: ConnectionFields }).fields;

beforeEach(() => {
  panels.length = 0;
  posted.length = 0;
  (window.createWebviewPanel as jest.Mock).mockReset();
  (window.createWebviewPanel as jest.Mock).mockImplementation(fakePanel);
  listDatabasesMock.mockReset();
});

afterEach(async () => {
  // Close what a test left open, and settle any outcome waiting on it.
  panels.forEach((panel) => {
    panel.dispose();
  });
  await flush();
  // The rule behind the whole form: nothing secret is ever posted to the page.
  const json = JSON.stringify(posted);
  for (const secret of SECRETS) {
    expect(json).not.toContain(secret);
  }
});

describe("openConnectionForm", () => {
  it("opens a webview tab, scripts on, hidden state kept, for the form page", () => {
    const { deps } = setup();
    void openConnectionForm(deps);
    const [type, title, column, options] = (
      window.createWebviewPanel as jest.Mock
    ).mock.calls[0] as [string, string, unknown, Record<string, unknown>];
    expect(type).toBe("dbmlStudio.connectionForm");
    expect(title).toBe("New connection");
    expect(column).toBeDefined();
    expect(options).toMatchObject({
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    expect(options.localResourceRoots).toHaveLength(1);
    expect(getWebviewHtml).toHaveBeenLastCalledWith(
      expect.objectContaining({ inputName: "connection-form" }),
    );
    expect(panels[0].webview.html).toContain("connection-form");
  });

  it("adds a connection: init, then Save stores the built string and resolves", async () => {
    const { deps, secrets, refresh } = setup({ legacy: SHOP });
    const outcome = openConnectionForm(deps);
    const panel = panels[0];
    panel.receive({ type: "ready" });
    await flush();

    expect(lastOf(panel, "init")).toMatchObject({
      type: "init",
      mode: "new",
      fields: emptyFields(),
      savedNames: ["legacy"],
      strings: formStrings(),
      hasPassword: false,
    });

    panel.receive({
      type: "save",
      fields: fieldsOf({ name: "  shop  " }),
      password: "hunter2",
    });
    await flush();

    const expected = buildConnection(fieldsOf(), "hunter2");
    await expect(outcome).resolves.toEqual({
      name: "shop",
      connectionString: expected,
    });
    expect(await getConnection(secrets, "shop")).toBe(expected);
    expect(refresh).toHaveBeenCalled();
    expect(panel.dispose).toHaveBeenCalled();
  });

  it("refuses to save an invalid form, without writing", async () => {
    const { deps, secrets } = setup({ legacy: SHOP });
    const outcome = openConnectionForm(deps);
    const panel = panels[0];
    panel.receive({ type: "ready" });
    panel.receive({ type: "save", fields: fieldsOf({ name: "Legacy" }) });
    await flush();
    expect(lastOf(panel, "saveError")).toEqual({
      type: "saveError",
      message: "A connection with this name already exists.",
    });
    expect(await listConnections(secrets)).toEqual(["legacy"]);
    panel.receive({ type: "cancel" });
    await expect(outcome).resolves.toBeUndefined();
  });

  it("saves once, however many times Save arrives", async () => {
    const { deps, secrets, refresh } = setup();
    const outcome = openConnectionForm(deps);
    const panel = panels[0];
    const save = { type: "save", fields: fieldsOf(), password: "hunter2" };
    panel.receive(save);
    panel.receive(save);
    await flush();
    await outcome;
    expect(await listConnections(secrets)).toEqual(["shop"]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores a message that is not shaped like the form's", async () => {
    const { deps, secrets } = setup();
    const outcome = openConnectionForm(deps);
    const panel = panels[0];
    panel.receive({ type: "save", fields: { name: 5 } });
    panel.receive({ type: "test", fields: { ...fieldsOf(), dialect: "x" } });
    panel.receive({ type: "nope" });
    panel.receive(null);
    await flush();
    expect(await listConnections(secrets)).toEqual([]);
    expect(listDatabasesMock).not.toHaveBeenCalled();
    panel.receive({ type: "cancel" });
    await expect(outcome).resolves.toBeUndefined();
  });

  describe("editing", () => {
    it("saves the stored string byte for byte when nothing changed", async () => {
      const { deps, secrets } = setup({ shop: SHOP });
      const outcome = openConnectionForm(deps, "shop");
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();

      const init = lastOf(panel, "init") as unknown as {
        mode: string;
        editing: string;
      };
      const fields = initFields(panel);
      expect(init.mode).toBe("edit");
      expect(init.editing).toBe("shop");
      expect(fields).toMatchObject({
        name: "shop",
        host: "h",
        port: "1433",
        user: "sa",
        database: "db",
        dialect: "mssql",
      });
      expect(window.createWebviewPanel).toHaveBeenCalledWith(
        expect.anything(),
        "Edit connection: shop",
        expect.anything(),
        expect.anything(),
      );

      // Spelled differently, but the same connection.
      panel.receive({ type: "save", fields: { ...fields, host: " h " } });
      await flush();
      await expect(outcome).resolves.toEqual({
        name: "shop",
        connectionString: SHOP,
      });
      expect(await getConnection(secrets, "shop")).toBe(SHOP);
    });

    it("keeps the stored password when a field changes and none is typed", async () => {
      const { deps, secrets } = setup({ shop: SHOP });
      const outcome = openConnectionForm(deps, "shop");
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();
      const fields = initFields(panel);
      panel.receive({
        type: "save",
        fields: { ...fields, host: "other" },
        password: "",
      });
      await flush();
      await outcome;
      expect(await getConnection(secrets, "shop")).toBe(
        buildConnection({ ...fields, host: "other" }, "p"),
      );
    });

    it("uses a newly typed password over the stored one", async () => {
      const { deps, secrets } = setup({ shop: SHOP });
      const outcome = openConnectionForm(deps, "shop");
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();
      const fields = initFields(panel);
      panel.receive({ type: "save", fields, password: "hunter2" });
      await flush();
      await outcome;
      expect(await getConnection(secrets, "shop")).toBe(
        buildConnection(fields, "hunter2"),
      );
    });

    it("renames, case-only included: the new key is saved and the old one is gone", async () => {
      const { deps, secrets } = setup({ shop: SHOP });
      const outcome = openConnectionForm(deps, "shop");
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();
      const fields = initFields(panel);
      panel.receive({ type: "save", fields: { ...fields, name: "Shop" } });
      await flush();
      await expect(outcome).resolves.toMatchObject({ name: "Shop" });
      expect(await listConnections(secrets)).toEqual(["Shop"]);
      expect(await getConnection(secrets, "Shop")).toBe(SHOP);
    });

    it("refuses a rename onto another saved name, changing nothing", async () => {
      const { deps, secrets } = setup({ shop: SHOP, legacy: SHOP });
      const outcome = openConnectionForm(deps, "shop");
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();
      const fields = initFields(panel);
      panel.receive({ type: "save", fields: { ...fields, name: "legacy" } });
      await flush();
      expect(lastOf(panel, "saveError")).toMatchObject({
        message: "A connection with this name already exists.",
      });
      expect(await listConnections(secrets)).toEqual(["legacy", "shop"]);
      panel.receive({ type: "cancel" });
      await expect(outcome).resolves.toBeUndefined();
    });

    it("starts from empty fields, no host, and a fixed sentence when the stored string cannot be read", async () => {
      const { deps } = setup({ shop: "nonsense Secr3t" });
      void openConnectionForm(deps, "shop");
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();
      expect(lastOf(panel, "init")).toMatchObject({
        mode: "edit",
        fields: { ...emptyFields(), name: "shop", host: "" },
      });
      expect(lastOf(panel, "pasteError")).toEqual({
        type: "pasteError",
        message: "The connection string is not one DBML Studio can read.",
      });
    });

    it("refuses to save the untouched form of an unreadable stored string, leaving it as it was", async () => {
      const { deps, secrets, refresh } = setup({ shop: "nonsense Secr3t" });
      const outcome = openConnectionForm(deps, "shop");
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();
      panel.receive({ type: "save", fields: initFields(panel) });
      await flush();
      expect(lastOf(panel, "saveError")).toMatchObject({
        message: "Enter a host.",
      });
      expect(await getConnection(secrets, "shop")).toBe("nonsense Secr3t");
      expect(refresh).not.toHaveBeenCalled();
      expect(panel.dispose).not.toHaveBeenCalled();
      panel.receive({ type: "cancel" });
      await expect(outcome).resolves.toBeUndefined();
    });

    it("keeps the stored hidden parameters when the fields change", async () => {
      const stored =
        "sqlserver://sa:hunter2@h:1433/db?encrypt=true&clientSecret=tok3n";
      const { deps, secrets } = setup({ shop: stored });
      const outcome = openConnectionForm(deps, "shop");
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();
      const fields = initFields(panel);
      expect(fields.options).toBe("");
      panel.receive({ type: "save", fields: { ...fields, host: "other" } });
      await flush();
      await outcome;
      expect(await getConnection(secrets, "shop")).toBe(
        buildConnection(
          { ...fields, host: "other" },
          "hunter2",
          "clientSecret=tok3n",
        ),
      );
    });
  });

  describe("reuse", () => {
    it("opens one tab for a new connection and hands back its promise", async () => {
      const { deps } = setup();
      const first = openConnectionForm(deps);
      const second = openConnectionForm(deps);
      expect(window.createWebviewPanel).toHaveBeenCalledTimes(1);
      expect(panels[0].reveal).toHaveBeenCalled();
      expect(second).toBe(first);
      panels[0].receive({ type: "cancel" });
      await expect(first).resolves.toBeUndefined();
      // Once closed, the next open is a fresh tab.
      void openConnectionForm(deps);
      expect(window.createWebviewPanel).toHaveBeenCalledTimes(2);
    });

    it("opens one tab per edited name, told apart by its exact spelling", () => {
      const { deps } = setup({ shop: SHOP, SHOP: SHOP, other: SHOP });
      const first = openConnectionForm(deps, "shop");
      const again = openConnectionForm(deps, "shop");
      expect(again).toBe(first);
      expect(window.createWebviewPanel).toHaveBeenCalledTimes(1);
      const upper = openConnectionForm(deps, "SHOP");
      expect(upper).not.toBe(first);
      void openConnectionForm(deps, "other");
      void openConnectionForm(deps);
      expect(window.createWebviewPanel).toHaveBeenCalledTimes(4);
    });
  });

  describe("test", () => {
    const start = async () => {
      const ctx = setup();
      const outcome = openConnectionForm(ctx.deps);
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();
      return { ...ctx, outcome, panel };
    };

    it("reports the databases it could list", async () => {
      const { panel } = await start();
      listDatabasesMock.mockResolvedValue(["a", "b"]);
      panel.receive({
        type: "test",
        fields: fieldsOf(),
        password: "hunter2",
      });
      await flush();
      const types = messagesOf(panel)
        .map((m) => m.type)
        .filter((type) => type !== "init");
      expect(types).toEqual(["testing", "testResult"]);
      expect(lastOf(panel, "testResult")).toEqual({
        type: "testResult",
        ok: true,
        databases: ["a", "b"],
      });
      expect(listDatabasesMock).toHaveBeenCalledWith(
        buildConnection(fieldsOf(), "hunter2"),
      );
    });

    it.each([
      [
        DbImportErrorCode.AUTH_FAILED,
        "The server refused the user name or password.",
      ],
      [DbImportErrorCode.UNREACHABLE, "Could not reach the server."],
      [DbImportErrorCode.ACCESS_DENIED, "The user may not open that database."],
      [DbImportErrorCode.DATABASE_NOT_FOUND, "There is no such database."],
      [
        DbImportErrorCode.INVALID_CONNECTION_STRING,
        "The connection string is not one DBML Studio can read.",
      ],
      [DbImportErrorCode.UNKNOWN, "Could not connect."],
    ])("answers %s with a fixed sentence", async (code, sentence) => {
      const { panel } = await start();
      listDatabasesMock.mockRejectedValue(
        new DbImportError(code, "driver says Secr3t"),
      );
      panel.receive({ type: "test", fields: fieldsOf() });
      await flush();
      expect(lastOf(panel, "testResult")).toEqual({
        type: "testResult",
        ok: false,
        message: sentence,
      });
    });

    it("adds the certificate hint to an unreachable SQL Server only", async () => {
      const { panel } = await start();
      listDatabasesMock.mockRejectedValue(
        new DbImportError(DbImportErrorCode.UNREACHABLE, "x"),
      );
      panel.receive({
        type: "test",
        fields: fieldsOf({ dialect: "mssql", port: "1433" }),
      });
      await flush();
      expect((lastOf(panel, "testResult") as { message: string }).message).toBe(
        "Could not reach the server. If the server uses a self-signed certificate, tick Trust server certificate.",
      );
      panel.receive({ type: "test", fields: fieldsOf() });
      await flush();
      expect((lastOf(panel, "testResult") as { message: string }).message).toBe(
        "Could not reach the server.",
      );
    });

    it("never repeats an error it does not know", async () => {
      const { panel } = await start();
      listDatabasesMock.mockRejectedValue(
        new Error("connect failed for tok3n"),
      );
      panel.receive({ type: "test", fields: fieldsOf() });
      await flush();
      expect(lastOf(panel, "testResult")).toEqual({
        type: "testResult",
        ok: false,
        message: "Could not connect.",
      });
    });

    it("does not call the driver for a host or port that is not usable", async () => {
      const { panel } = await start();
      panel.receive({ type: "test", fields: fieldsOf({ host: "h@evil" }) });
      await flush();
      expect(listDatabasesMock).not.toHaveBeenCalled();
      expect(lastOf(panel, "testResult")).toMatchObject({ ok: false });
    });

    it("resolves undefined when the tab is closed mid-test, and posts nothing after", async () => {
      const { panel, outcome } = await start();
      let settle: (names: string[]) => void = () => undefined;
      listDatabasesMock.mockReturnValue(
        new Promise<string[]>((resolve) => {
          settle = resolve;
        }),
      );
      panel.receive({ type: "test", fields: fieldsOf() });
      await flush();
      const before = panel.webview.postMessage.mock.calls.length;
      panel.dispose();
      await expect(outcome).resolves.toBeUndefined();
      settle(["a"]);
      await flush();
      expect(panel.webview.postMessage).toHaveBeenCalledTimes(before);
    });

    it("posts nothing after a failure that arrives once the tab is gone", async () => {
      const { panel, outcome } = await start();
      let fail: (error: Error) => void = () => undefined;
      listDatabasesMock.mockReturnValue(
        new Promise<string[]>((_resolve, reject) => {
          fail = reject;
        }),
      );
      panel.receive({ type: "test", fields: fieldsOf() });
      await flush();
      const before = panel.webview.postMessage.mock.calls.length;
      panel.dispose();
      await outcome;
      fail(new Error("late"));
      await flush();
      expect(panel.webview.postMessage).toHaveBeenCalledTimes(before);
    });

    it("answers only the latest of two overlapping tests", async () => {
      const { panel } = await start();
      const settlers: Array<(names: string[]) => void> = [];
      listDatabasesMock.mockImplementation(
        async () =>
          await new Promise<string[]>((resolve) => {
            settlers.push(resolve);
          }),
      );
      panel.receive({ type: "test", fields: fieldsOf() });
      panel.receive({ type: "test", fields: fieldsOf({ host: "h2" }) });
      await flush();
      settlers[1](["second"]);
      await flush();
      settlers[0](["first"]);
      await flush();
      const results = messagesOf(panel).filter((m) => m.type === "testResult");
      expect(results).toEqual([
        { type: "testResult", ok: true, databases: ["second"] },
      ]);
    });
  });

  describe("paste", () => {
    const PG = "postgresql://u:p@h/db?sslmode=require";

    it("fills the fields from a pasted string and saves it untouched, byte for byte", async () => {
      const { deps, secrets } = setup();
      const outcome = openConnectionForm(deps);
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();
      panel.receive({ type: "paste", text: PG });
      await flush();
      const pasted = lastOf(panel, "pasted") as unknown as {
        fields: Omit<ConnectionFields, "name">;
      };
      expect(pasted.fields).toMatchObject({
        dialect: "postgres",
        host: "h",
        user: "u",
        database: "db",
        options: "sslmode=require",
      });
      expect("password" in pasted.fields).toBe(false);

      panel.receive({
        type: "save",
        fields: { ...pasted.fields, name: "pg" },
      });
      await flush();
      await outcome;
      expect(await getConnection(secrets, "pg")).toBe(PG);
    });

    it("answers an unreadable paste with the fixed sentence", async () => {
      const { deps } = setup();
      void openConnectionForm(deps);
      const panel = panels[0];
      panel.receive({ type: "paste", text: "snowflake://u:Secr3t@a/db" });
      await flush();
      expect(lastOf(panel, "pasteError")).toEqual({
        type: "pasteError",
        message: "The connection string is not one DBML Studio can read.",
      });
    });

    it("keeps the pasted password and its hidden parameters when the fields change", async () => {
      const { deps, secrets } = setup();
      const outcome = openConnectionForm(deps);
      const panel = panels[0];
      panel.receive({
        type: "paste",
        text: "sqlserver://sa:hunter2@h:1433/db?encrypt=true&clientSecret=tok3n",
      });
      await flush();
      const { fields } = lastOf(panel, "pasted") as unknown as {
        fields: Omit<ConnectionFields, "name">;
      };
      expect(fields.options).toBe("");
      panel.receive({
        type: "save",
        fields: { ...fields, name: "ms", host: "other" },
      });
      await flush();
      await outcome;
      expect(await getConnection(secrets, "ms")).toBe(
        buildConnection(
          { ...fields, name: "ms", host: "other" },
          "hunter2",
          "clientSecret=tok3n",
        ),
      );
    });

    it("tests the pasted string as it stands", async () => {
      const { deps } = setup();
      void openConnectionForm(deps);
      const panel = panels[0];
      panel.receive({ type: "paste", text: PG });
      await flush();
      const { fields } = lastOf(panel, "pasted") as unknown as {
        fields: Omit<ConnectionFields, "name">;
      };
      listDatabasesMock.mockResolvedValue(["db"]);
      panel.receive({ type: "test", fields: { ...fields, name: "" } });
      await flush();
      expect(listDatabasesMock).toHaveBeenCalledWith(PG);
    });

    it("lets a paste replace the stored string as the original", async () => {
      const { deps, secrets } = setup({ shop: SHOP });
      const outcome = openConnectionForm(deps, "shop");
      const panel = panels[0];
      // A password unlike the stored one, so a dropped paste cannot pass.
      const pasted = "postgresql://u:other@h/db?sslmode=require";
      panel.receive({ type: "ready" });
      await flush();
      panel.receive({ type: "paste", text: pasted });
      await flush();
      const { fields } = lastOf(panel, "pasted") as unknown as {
        fields: Omit<ConnectionFields, "name">;
      };
      panel.receive({ type: "save", fields: { ...fields, name: "shop" } });
      await flush();
      await outcome;
      expect(await getConnection(secrets, "shop")).toBe(pasted);
    });
  });

  describe("names that differ only in case or padding", () => {
    const PG = "postgresql://u:p@h/db?sslmode=require";

    it("lists every other name as taken, and refuses a rename onto a variant", async () => {
      const { deps, secrets } = setup({ shop: SHOP, SHOP: PG });
      const outcome = openConnectionForm(deps, "shop");
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();
      expect(lastOf(panel, "init")).toMatchObject({ savedNames: ["SHOP"] });
      panel.receive({
        type: "save",
        fields: { ...initFields(panel), name: "SHOP" },
      });
      await flush();
      expect(lastOf(panel, "saveError")).toMatchObject({
        message: "A connection with this name already exists.",
      });
      expect(await getConnection(secrets, "SHOP")).toBe(PG);
      expect(await getConnection(secrets, "shop")).toBe(SHOP);
      panel.receive({ type: "cancel" });
      await expect(outcome).resolves.toBeUndefined();
    });

    it("does not erase a neighbour when a padded name is saved unchanged", async () => {
      const { deps, secrets } = setup({ "shop ": SHOP, shop: PG });
      const outcome = openConnectionForm(deps, "shop ");
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();
      panel.receive({ type: "save", fields: initFields(panel) });
      await flush();
      expect(lastOf(panel, "saveError")).toBeDefined();
      expect(await getConnection(secrets, "shop")).toBe(PG);
      expect(await getConnection(secrets, "shop ")).toBe(SHOP);
      panel.receive({ type: "cancel" });
      await outcome;
    });
  });

  describe("what the host holds after init", () => {
    const PG = "postgresql://u:pg_pw@h/db?sslmode=require";

    it("tells the page whether a password is held, never what it is", async () => {
      const { deps } = setup({ shop: SHOP, bare: "postgresql://u@h/db" });
      void openConnectionForm(deps, "shop");
      void openConnectionForm(deps, "bare");
      void openConnectionForm(deps);
      for (const panel of panels) {
        panel.receive({ type: "ready" });
      }
      await flush();
      expect(lastOf(panels[0], "init")).toMatchObject({ hasPassword: true });
      expect(lastOf(panels[1], "init")).toMatchObject({ hasPassword: false });
      expect(lastOf(panels[2], "init")).toMatchObject({ hasPassword: false });
      panels[2].receive({ type: "paste", text: PG });
      await flush();
      expect(lastOf(panels[2], "pasted")).toMatchObject({ hasPassword: true });
      panels[2].receive({ type: "paste", text: "postgresql://u@h/db" });
      await flush();
      expect(lastOf(panels[2], "pasted")).toMatchObject({
        hasPassword: false,
      });
    });

    it("forgets a paste that came before init, so the page and host agree", async () => {
      const { deps, secrets } = setup({ shop: SHOP });
      const outcome = openConnectionForm(deps, "shop");
      const panel = panels[0];
      panel.receive({ type: "paste", text: PG });
      await flush();
      panel.receive({ type: "ready" });
      await flush();
      panel.receive({ type: "save", fields: initFields(panel) });
      await flush();
      await outcome;
      expect(await getConnection(secrets, "shop")).toBe(SHOP);
    });

    it("holds nothing from a paste when the stored string cannot be read", async () => {
      const { deps, secrets } = setup({ shop: "nonsense" });
      const outcome = openConnectionForm(deps, "shop");
      const panel = panels[0];
      panel.receive({ type: "paste", text: PG });
      await flush();
      panel.receive({ type: "ready" });
      await flush();
      expect(lastOf(panel, "init")).toMatchObject({ hasPassword: false });
      panel.receive({ type: "save", fields: fieldsOf() });
      await flush();
      await outcome;
      expect(await getConnection(secrets, "shop")).toBe(
        buildConnection(fieldsOf(), ""),
      );
    });

    it("returns to the stored connection on a second ready", async () => {
      const { deps, secrets } = setup({ shop: SHOP });
      const outcome = openConnectionForm(deps, "shop");
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();
      panel.receive({ type: "paste", text: PG });
      await flush();
      panel.receive({ type: "ready" });
      await flush();
      panel.receive({ type: "save", fields: initFields(panel) });
      await flush();
      await outcome;
      expect(await getConnection(secrets, "shop")).toBe(SHOP);
    });

    it("stores the pasted string, trimmed, when the fields are edited and put back", async () => {
      const { deps, secrets } = setup({ shop: SHOP });
      const outcome = openConnectionForm(deps, "shop");
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();
      panel.receive({ type: "paste", text: `  ${PG}\n` });
      await flush();
      const { fields } = lastOf(panel, "pasted") as unknown as {
        fields: Omit<ConnectionFields, "name">;
      };
      // A save of other fields would rebuild; the same fields give the original.
      const edited = { ...fields, name: "shop", host: "elsewhere" };
      listDatabasesMock.mockResolvedValue([]);
      panel.receive({ type: "test", fields: edited });
      await flush();
      expect(listDatabasesMock).toHaveBeenLastCalledWith(
        expect.stringContaining("elsewhere"),
      );
      panel.receive({ type: "save", fields: { ...edited, host: fields.host } });
      await flush();
      await expect(outcome).resolves.toEqual({
        name: "shop",
        connectionString: PG,
      });
      expect(await getConnection(secrets, "shop")).toBe(PG);
    });

    it("trims a stored string it keeps, and tests the trimmed original", async () => {
      const { deps, secrets } = setup({ shop: `  ${SHOP}\n` });
      const outcome = openConnectionForm(deps, "shop");
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();
      listDatabasesMock.mockResolvedValue(["db"]);
      panel.receive({ type: "test", fields: initFields(panel) });
      await flush();
      expect(listDatabasesMock).toHaveBeenCalledWith(SHOP);
      panel.receive({ type: "save", fields: initFields(panel) });
      await flush();
      await outcome;
      expect(await getConnection(secrets, "shop")).toBe(SHOP);
    });

    it("stores a padded paste trimmed, in the store and in the outcome", async () => {
      const { deps, secrets } = setup();
      const outcome = openConnectionForm(deps);
      const panel = panels[0];
      panel.receive({ type: "paste", text: `  ${PG}\n` });
      await flush();
      const { fields } = lastOf(panel, "pasted") as unknown as {
        fields: Omit<ConnectionFields, "name">;
      };
      panel.receive({ type: "save", fields: { ...fields, name: "pg" } });
      await flush();
      await expect(outcome).resolves.toEqual({
        name: "pg",
        connectionString: PG,
      });
      expect(await getConnection(secrets, "pg")).toBe(PG);
    });
  });

  describe("a save under way", () => {
    // A store whose writes wait until the test lets them through.
    function gatedStore(initial: Record<string, string>) {
      const inner = memoryStore(initial);
      const gate = { open: false, fail: false, release: (): void => undefined };
      let waiting: Array<() => void> = [];
      gate.release = () => {
        gate.open = true;
        waiting.forEach((resume) => {
          resume();
        });
        waiting = [];
      };
      const secrets: SecretStore = {
        get: inner.get.bind(inner),
        store: async (key, value) => {
          if (!gate.open) {
            await new Promise<void>((resolve) => {
              waiting.push(resolve);
            });
          }
          if (gate.fail) {
            throw new Error("disk full");
          }
          await inner.store(key, value);
        },
      };
      return { secrets, gate };
    }

    const gatedDeps = (secrets: SecretStore) => ({
      context: {
        secrets,
        extensionUri: { path: "/ext" },
      } as unknown as ExtensionContext,
      refresh: jest.fn(),
    });

    it("still resolves the saved connection when the tab is closed mid-write", async () => {
      const { secrets, gate } = gatedStore({});
      const deps = gatedDeps(secrets);
      const outcome = openConnectionForm(deps);
      const panel = panels[0];
      panel.receive({ type: "save", fields: fieldsOf(), password: "hunter2" });
      await flush();
      const before = panel.webview.postMessage.mock.calls.length;
      panel.dispose();
      gate.release();
      const expected = buildConnection(fieldsOf(), "hunter2");
      await expect(outcome).resolves.toEqual({
        name: "shop",
        connectionString: expected,
      });
      expect(await getConnection(secrets, "shop")).toBe(expected);
      expect(deps.refresh).toHaveBeenCalled();
      expect(panel.webview.postMessage).toHaveBeenCalledTimes(before);
    });

    it("keeps the save when Cancel arrives during the write", async () => {
      const { secrets, gate } = gatedStore({});
      const outcome = openConnectionForm(gatedDeps(secrets));
      const panel = panels[0];
      panel.receive({ type: "save", fields: fieldsOf(), password: "hunter2" });
      await flush();
      panel.receive({ type: "cancel" });
      gate.release();
      await expect(outcome).resolves.toMatchObject({ name: "shop" });
    });

    it("resolves undefined when the tab is closed and the write fails", async () => {
      const { secrets, gate } = gatedStore({});
      gate.fail = true;
      const deps = gatedDeps(secrets);
      const outcome = openConnectionForm(deps);
      const panel = panels[0];
      panel.receive({ type: "save", fields: fieldsOf(), password: "hunter2" });
      await flush();
      panel.dispose();
      gate.release();
      await expect(outcome).resolves.toBeUndefined();
      expect(deps.refresh).not.toHaveBeenCalled();
    });

    it("lets the form be used again after a failed write", async () => {
      const { secrets, gate } = gatedStore({});
      gate.fail = true;
      gate.open = true;
      const outcome = openConnectionForm(gatedDeps(secrets));
      const panel = panels[0];
      panel.receive({ type: "save", fields: fieldsOf(), password: "hunter2" });
      await flush();
      expect(lastOf(panel, "saveError")).toEqual({
        type: "saveError",
        message: "Could not save the connection.",
      });
      gate.fail = false;
      panel.receive({ type: "save", fields: fieldsOf(), password: "hunter2" });
      await flush();
      await expect(outcome).resolves.toMatchObject({ name: "shop" });
    });

    it("renames with a single write", async () => {
      const { deps, secrets } = setup({ shop: SHOP });
      const store = jest.spyOn(secrets, "store");
      const outcome = openConnectionForm(deps, "shop");
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();
      panel.receive({
        type: "save",
        fields: { ...initFields(panel), name: "renamed" },
      });
      await flush();
      await outcome;
      expect(store).toHaveBeenCalledTimes(1);
      expect(await listConnections(secrets)).toEqual(["renamed"]);
    });

    it("does not call a stored connection failed because the tree refresh threw", async () => {
      const { deps, secrets, refresh } = setup();
      refresh.mockImplementation(() => {
        throw new Error("tree");
      });
      const outcome = openConnectionForm(deps);
      panels[0].receive({ type: "save", fields: fieldsOf() });
      await flush();
      await expect(outcome).resolves.toMatchObject({ name: "shop" });
      expect(await listConnections(secrets)).toEqual(["shop"]);
    });
  });

  describe("closing and stale tabs", () => {
    it("writes nothing when the edited connection is deleted between the check and the write", async () => {
      const { deps, secrets } = setup({ shop: SHOP });
      const outcome = openConnectionForm(deps, "shop");
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();
      const realGet = secrets.get.bind(secrets);
      const realStore = secrets.store.bind(secrets);
      const store = jest.spyOn(secrets, "store");
      let reads = 0;
      jest.spyOn(secrets, "get").mockImplementation(async (key) => {
        reads += 1;
        // The save's own read-modify-write is its second read.
        if (reads === 2) {
          await deleteConnection({ get: realGet, store: realStore }, "shop");
        }
        return await realGet(key);
      });
      store.mockClear();
      panel.receive({ type: "save", fields: initFields(panel) });
      await flush();
      expect(lastOf(panel, "saveError")).toEqual({
        type: "saveError",
        message: "The connection no longer exists.",
      });
      // The delete went through the unspied store: any call is the panel's.
      expect(store).not.toHaveBeenCalled();
      expect(await listConnections({ get: realGet, store: realStore })).toEqual(
        [],
      );
      panel.receive({ type: "cancel" });
      await expect(outcome).resolves.toBeUndefined();
    });

    it("saves an edit that keeps its name through the same guarded write", async () => {
      const { deps, secrets } = setup({ shop: SHOP });
      const outcome = openConnectionForm(deps, "shop");
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();
      panel.receive({
        type: "save",
        fields: { ...initFields(panel), host: "other" },
      });
      await flush();
      await expect(outcome).resolves.toMatchObject({ name: "shop" });
      expect(await listConnections(secrets)).toEqual(["shop"]);
    });

    it("closeConnectionForm disposes the edit tab of that exact name only", async () => {
      const { deps } = setup({ shop: SHOP, SHOP: SHOP });
      const lower = openConnectionForm(deps, "shop");
      const upper = openConnectionForm(deps, "SHOP");
      closeConnectionForm("shop");
      await expect(lower).resolves.toBeUndefined();
      expect(panels[0].dispose).toHaveBeenCalled();
      expect(panels[1].dispose).not.toHaveBeenCalled();
      closeConnectionForm("nothing open");
      closeConnectionForm("shop");
      panels[1].receive({ type: "cancel" });
      await expect(upper).resolves.toBeUndefined();
    });

    it("refuses to save an edit whose connection has been deleted, writing nothing", async () => {
      const { deps, secrets } = setup({ shop: SHOP });
      const outcome = openConnectionForm(deps, "shop");
      const panel = panels[0];
      panel.receive({ type: "ready" });
      await flush();
      await deleteConnection(secrets, "shop");
      // Someone else took the name since.
      await saveConnection(secrets, "orders", "postgresql://o@h/db");
      panel.receive({ type: "save", fields: initFields(panel) });
      await flush();
      expect(lastOf(panel, "saveError")).toEqual({
        type: "saveError",
        message: "The connection no longer exists.",
      });
      expect(await listConnections(secrets)).toEqual(["orders"]);
      panel.receive({ type: "cancel" });
      await expect(outcome).resolves.toBeUndefined();
    });
  });
});
