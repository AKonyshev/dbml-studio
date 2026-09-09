import { window } from "vscode";

import { WebviewHelper } from "extension-shared/extension/views/helper";
import { WebviewCommand } from "extension-shared/extension/types/webviewCommand";

import type { ExtensionConfig } from "extension-shared/extension/helper/extensionConfigs";
import type { WebviewPostMessage } from "extension-shared/extension/types/webviewCommand";

const config = {} as unknown as ExtensionConfig;

const send = async (message: Partial<WebviewPostMessage>): Promise<void> => {
  await WebviewHelper.handleWebviewMessage(
    message as WebviewPostMessage,
    config,
    { fileExt: "dbml", supportsDbmlFileSync: true },
  );
};

beforeEach(() => {
  jest.mocked(window.showInformationMessage).mockReset();
});

/**
 * The diagram has nowhere of its own to say anything, and the one case that
 * needs saying — a column added to a table whose rows are not all drawn — is
 * exactly the case where its editing box has just closed.
 */
describe("a line the diagram asks the workbench to show", () => {
  test("reaches the reader", async () => {
    await send({
      command: WebviewCommand.SHOW_MESSAGE,
      message: "The column was added to the file.",
    });

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      "The column was added to the file.",
    );
  });

  test("is not shown when there is nothing to say", async () => {
    await send({ command: WebviewCommand.SHOW_MESSAGE, message: "" });
    await send({ command: WebviewCommand.SHOW_MESSAGE });

    expect(window.showInformationMessage).not.toHaveBeenCalled();
  });
});
