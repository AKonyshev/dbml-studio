// `virtual:vscode` exists only inside the extension build, which generates
// `getWebviewHtml` from the built webview. The suites only need its return
// value to be a page; it records the page it was asked for (`inputName`) so a
// suite can tell which webview an html assignment belongs to.
export const getWebviewHtml = jest.fn(
  (options?: { inputName?: string }): string =>
    `<html data-input="${options?.inputName ?? "index"}"></html>`,
);

export default getWebviewHtml;
