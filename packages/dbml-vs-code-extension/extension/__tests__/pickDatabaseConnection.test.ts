import { window } from "vscode";
import {
  deleteConnection,
  saveConnection,
  type SecretStore,
} from "../connectionStore";
import {
  newConnectionLabel,
  pickDatabaseConnection,
} from "../pickDatabaseConnection";

type PickItem = {
  pickKind: "saved" | "new";
  connectionName?: string;
  label: string;
};

function fakeSecrets(): SecretStore {
  const map = new Map<string, string>();
  return {
    get: async (k) => map.get(k),
    store: async (k, v) => void map.set(k, v),
  };
}

function fakeContext(secrets: SecretStore) {
  return { secrets } as Parameters<typeof pickDatabaseConnection>[0];
}

function pickSaved(name: string) {
  return async (items: unknown) => {
    const list = items as PickItem[];
    return list.find(
      (item) => item.pickKind === "saved" && item.connectionName === name,
    );
  };
}

function pickNew() {
  return async (items: unknown) => {
    const list = items as PickItem[];
    return list.find((item) => item.pickKind === "new");
  };
}

describe("pickDatabaseConnection", () => {
  beforeEach(() => {
    jest.mocked(window.showQuickPick).mockReset();
    jest.mocked(window.showInputBox).mockReset();
    jest.mocked(window.showErrorMessage).mockReset();
  });

  test("returns saved connection when user picks one", async () => {
    const secrets = fakeSecrets();
    await saveConnection(secrets, "local", "postgres://u:p@h/db");
    jest
      .mocked(window.showQuickPick)
      .mockImplementation(pickSaved("local") as never);

    await expect(pickDatabaseConnection(fakeContext(secrets))).resolves.toEqual(
      {
        connectionString: "postgres://u:p@h/db",
        isNew: false,
      },
    );
  });

  test("shows an error when a saved connection is no longer available", async () => {
    const secrets = fakeSecrets();
    await saveConnection(secrets, "stale", "postgres://gone");
    jest
      .mocked(window.showQuickPick)
      .mockImplementation(async (items: unknown) => {
        const choice = await pickSaved("stale")(items);
        await deleteConnection(secrets, "stale");
        return choice;
      });

    await expect(
      pickDatabaseConnection(fakeContext(secrets)),
    ).resolves.toBeUndefined();
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'Saved connection "stale" is no longer available.',
    );
  });

  test("loads a saved connection even when its name matches the new-connection label", async () => {
    const secrets = fakeSecrets();
    await saveConnection(
      secrets,
      newConnectionLabel(),
      "postgres://saved-as-new-label",
    );
    jest
      .mocked(window.showQuickPick)
      .mockImplementation(pickSaved(newConnectionLabel()) as never);

    await expect(pickDatabaseConnection(fakeContext(secrets))).resolves.toEqual(
      {
        connectionString: "postgres://saved-as-new-label",
        isNew: false,
      },
    );
    expect(window.showInputBox).not.toHaveBeenCalled();
  });

  test("returns a new connection when user creates one", async () => {
    const secrets = fakeSecrets();
    jest.mocked(window.showQuickPick).mockImplementation(pickNew() as never);
    jest.mocked(window.showInputBox).mockResolvedValue("postgres://u:p@h/new");

    await expect(pickDatabaseConnection(fakeContext(secrets))).resolves.toEqual(
      {
        connectionString: "postgres://u:p@h/new",
        isNew: true,
      },
    );
  });

  test("checks the typed connection string as it is entered", async () => {
    jest.mocked(window.showQuickPick).mockImplementation(pickNew() as never);
    jest.mocked(window.showInputBox).mockResolvedValue("mysql://u:p@h/new");

    await pickDatabaseConnection(fakeContext(fakeSecrets()));

    const options = jest.mocked(window.showInputBox).mock.calls[0][0];
    expect(options?.validateInput?.("mysql://u:p@h/db")).toBeUndefined();
    expect(options?.validateInput?.("oracle://u:p@h/db")).toEqual(
      expect.stringContaining("mysql://"),
    );
  });

  test("keeps a typed SQL Server URL as typed", async () => {
    jest.mocked(window.showQuickPick).mockImplementation(pickNew() as never);
    const typed = "sqlserver://sa:Test_Passw0rd!@h:1433/library";
    jest.mocked(window.showInputBox).mockResolvedValue(typed);

    await expect(
      pickDatabaseConnection(fakeContext(fakeSecrets())),
    ).resolves.toEqual({ connectionString: typed, isNew: true });
  });

  test("returns undefined when the user cancels the quick pick", async () => {
    jest.mocked(window.showQuickPick).mockResolvedValue(undefined);

    await expect(
      pickDatabaseConnection(fakeContext(fakeSecrets())),
    ).resolves.toBeUndefined();
  });
});
