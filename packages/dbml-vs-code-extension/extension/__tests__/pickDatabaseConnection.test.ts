jest.mock("../connectionForm/connectionFormPanel", () => ({
  openConnectionForm: jest.fn(),
  closeConnectionForm: jest.fn(),
}));

import { window } from "vscode";

import { openConnectionForm } from "../connectionForm/connectionFormPanel";
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
    jest.mocked(openConnectionForm).mockReset();
  });

  test("returns saved connection when user picks one", async () => {
    const secrets = fakeSecrets();
    await saveConnection(secrets, "local", "postgres://u:p@h/db");
    jest
      .mocked(window.showQuickPick)
      .mockImplementation(pickSaved("local") as never);

    await expect(pickDatabaseConnection(fakeContext(secrets))).resolves.toEqual(
      { connectionString: "postgres://u:p@h/db" },
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
      { connectionString: "postgres://saved-as-new-label" },
    );
    expect(window.showInputBox).not.toHaveBeenCalled();
  });

  test("opens the form for a new connection and returns what it saved", async () => {
    const secrets = fakeSecrets();
    const context = fakeContext(secrets);
    jest.mocked(window.showQuickPick).mockImplementation(pickNew() as never);
    jest.mocked(openConnectionForm).mockResolvedValue({
      name: "fresh",
      connectionString: "postgres://u:p@h/new",
    });

    await expect(pickDatabaseConnection(context)).resolves.toEqual({
      connectionString: "postgres://u:p@h/new",
    });
    expect(openConnectionForm).toHaveBeenCalledTimes(1);
    expect(jest.mocked(openConnectionForm).mock.calls[0][0].context).toBe(
      context,
    );
    expect(jest.mocked(openConnectionForm).mock.calls[0][1]).toBeUndefined();
    expect(window.showInputBox).not.toHaveBeenCalled();
  });

  test("returns undefined when the form is closed without saving", async () => {
    jest.mocked(window.showQuickPick).mockImplementation(pickNew() as never);
    jest.mocked(openConnectionForm).mockResolvedValue(undefined);

    await expect(
      pickDatabaseConnection(fakeContext(fakeSecrets())),
    ).resolves.toBeUndefined();
  });

  test("returns undefined when the user cancels the quick pick", async () => {
    jest.mocked(window.showQuickPick).mockResolvedValue(undefined);

    await expect(
      pickDatabaseConnection(fakeContext(fakeSecrets())),
    ).resolves.toBeUndefined();
  });
});
