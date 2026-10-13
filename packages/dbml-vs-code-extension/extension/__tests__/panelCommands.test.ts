jest.mock("../connectionForm/connectionFormPanel", () => ({
  openConnectionForm: jest.fn(),
  closeConnectionForm: jest.fn(),
}));

import { window } from "vscode";

import {
  closeConnectionForm,
  openConnectionForm,
} from "../connectionForm/connectionFormPanel";
import { saveConnection, type SecretStore } from "../connectionStore";
import type { ConnectionsTreeProvider } from "../connectionsTreeProvider";
import {
  addConnection,
  deleteConnectionCommand,
  editConnectionCommand,
} from "../panelCommands";

function fakeSecrets(): SecretStore {
  const map = new Map<string, string>();
  return {
    get: async (k) => map.get(k),
    store: async (k, v) => void map.set(k, v),
  };
}

const fakeContext = (secrets: SecretStore) =>
  ({ secrets }) as Parameters<typeof addConnection>[0];

const fakeProvider = () => {
  const refresh = jest.fn();
  return {
    refresh,
    provider: { refresh } as unknown as ConnectionsTreeProvider,
  };
};

describe("panelCommands", () => {
  beforeEach(() => {
    jest.mocked(openConnectionForm).mockReset().mockResolvedValue(undefined);
    jest.mocked(closeConnectionForm).mockReset();
    jest.mocked(window.showQuickPick).mockReset();
    jest.mocked(window.showInputBox).mockReset();
    jest.mocked(window.showWarningMessage).mockReset();
    jest.mocked(window.showInformationMessage).mockReset();
  });

  describe("addConnection", () => {
    test("opens the form for a new connection, wired to the tree", async () => {
      const context = fakeContext(fakeSecrets());
      const { provider, refresh } = fakeProvider();

      await addConnection(context, provider);

      expect(openConnectionForm).toHaveBeenCalledTimes(1);
      const deps = jest.mocked(openConnectionForm).mock.calls[0];
      expect(deps[0].context).toBe(context);
      expect(deps[1]).toBeUndefined();
      deps[0].refresh();
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    test("asks for no name or string in input boxes any more", async () => {
      await addConnection(fakeContext(fakeSecrets()), fakeProvider().provider);

      expect(window.showInputBox).not.toHaveBeenCalled();
    });
  });

  describe("editConnectionCommand", () => {
    test("opens the form for the connection node it was invoked on", async () => {
      const context = fakeContext(fakeSecrets());

      await editConnectionCommand(context, fakeProvider().provider, {
        kind: "connection",
        name: "shop",
      });

      expect(openConnectionForm).toHaveBeenCalledWith(
        expect.objectContaining({ context }),
        "shop",
      );
      expect(window.showQuickPick).not.toHaveBeenCalled();
    });

    test("without a node offers the saved connections and edits the chosen one", async () => {
      const secrets = fakeSecrets();
      await saveConnection(secrets, "shop", "postgres://u:p@h/db");
      await saveConnection(secrets, "blog", "mysql://u:p@h/db");
      jest
        .mocked(window.showQuickPick)
        .mockImplementation((async (items: unknown) =>
          (items as string[]).find((name) => name === "blog")) as never);

      await editConnectionCommand(
        fakeContext(secrets),
        fakeProvider().provider,
      );

      expect(jest.mocked(window.showQuickPick).mock.calls[0][0]).toEqual([
        "blog",
        "shop",
      ]);
      expect(openConnectionForm).toHaveBeenCalledWith(
        expect.anything(),
        "blog",
      );
    });

    test("does nothing when the pick is dismissed", async () => {
      const secrets = fakeSecrets();
      await saveConnection(secrets, "shop", "postgres://u:p@h/db");
      jest.mocked(window.showQuickPick).mockResolvedValue(undefined);

      await editConnectionCommand(
        fakeContext(secrets),
        fakeProvider().provider,
      );

      expect(openConnectionForm).not.toHaveBeenCalled();
      expect(window.showInformationMessage).not.toHaveBeenCalled();
    });

    test("says so when there is nothing to edit", async () => {
      await editConnectionCommand(
        fakeContext(fakeSecrets()),
        fakeProvider().provider,
      );

      expect(window.showInformationMessage).toHaveBeenCalledWith(
        "No saved connections",
      );
      expect(window.showQuickPick).not.toHaveBeenCalled();
      expect(openConnectionForm).not.toHaveBeenCalled();
    });

    test("ignores a node that is not a connection", async () => {
      await editConnectionCommand(
        fakeContext(fakeSecrets()),
        fakeProvider().provider,
        { kind: "empty", label: "No saved connections" },
      );

      expect(openConnectionForm).not.toHaveBeenCalled();
    });
  });

  describe("deleteConnectionCommand", () => {
    test("deletes the connection, refreshes, and closes its edit tab", async () => {
      const secrets = fakeSecrets();
      await saveConnection(secrets, "shop", "postgres://u:p@h/db");
      jest
        .mocked(window.showWarningMessage)
        .mockResolvedValue("Delete" as never);
      const { provider, refresh } = fakeProvider();

      await deleteConnectionCommand(fakeContext(secrets), provider, {
        kind: "connection",
        name: "shop",
      });

      expect(await secrets.get("dbml.connections")).toBe("{}");
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(closeConnectionForm).toHaveBeenCalledWith("shop");
    });

    test("leaves the edit tab alone when the user declines", async () => {
      const secrets = fakeSecrets();
      await saveConnection(secrets, "shop", "postgres://u:p@h/db");
      jest.mocked(window.showWarningMessage).mockResolvedValue(undefined);

      await deleteConnectionCommand(
        fakeContext(secrets),
        fakeProvider().provider,
        {
          kind: "connection",
          name: "shop",
        },
      );

      expect(closeConnectionForm).not.toHaveBeenCalled();
    });
  });
});
