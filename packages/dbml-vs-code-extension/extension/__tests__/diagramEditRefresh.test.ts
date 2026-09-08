import { workspace } from "vscode";
import {
  WebviewCommand,
  type ApplyDiagramEditMessage,
} from "extension-shared/extension/types/webviewCommand";
import { WebviewHelper } from "extension-shared/extension/views/helper";

const SOURCE = [
  "Table users {",
  "  id uuid [pk]",
  "  email varchar",
  "}",
  "",
].join("\n");

const request: ApplyDiagramEditMessage = {
  command: WebviewCommand.APPLY_DIAGRAM_EDIT,
  documentUri: "file:///a.dbml",
  requestId: "r1",
  operation: {
    kind: "replaceField",
    table: "users",
    field: "email",
    text: "email varchar [unique]",
  },
};

describe("a field edit and the diagram's own write-back", () => {
  beforeEach(() => {
    (workspace.openTextDocument as jest.Mock).mockResolvedValue({
      uri: { toString: () => "file:///a.dbml" },
      getText: () => SOURCE,
      isUntitled: false,
      isClosed: false,
      languageId: "dbml",
      positionAt: (offset: number) => offset,
    });
    (workspace.applyEdit as jest.Mock).mockResolvedValue(true);
  });

  // The flag exists to stop the diagram redrawing from its own position
  // write-back. Raising it for a field edit too left the reader looking at the
  // old name until they saved the file.
  test("does not claim the edit as the diagram's own", async () => {
    const onApplyingDbmlEdit = jest.fn();

    await WebviewHelper.handleWebviewMessage(request as never, {} as never, {
      fileExt: "dbml",
      supportsDbmlFileSync: true,
      onApplyingDbmlEdit,
      postToWebview: jest.fn(),
    });

    expect(workspace.applyEdit).toHaveBeenCalled();
    expect(onApplyingDbmlEdit).not.toHaveBeenCalled();
  });

  test("still claims the position write-back as its own", async () => {
    const onApplyingDbmlEdit = jest.fn();

    await WebviewHelper.handleWebviewMessage(
      {
        command: WebviewCommand.UPDATE_DBML_CONTENT,
        content: SOURCE,
        documentUri: "file:///a.dbml",
      } as never,
      {} as never,
      {
        fileExt: "dbml",
        supportsDbmlFileSync: true,
        onApplyingDbmlEdit,
      },
    );

    expect(onApplyingDbmlEdit).toHaveBeenCalledWith(true);
  });
});
