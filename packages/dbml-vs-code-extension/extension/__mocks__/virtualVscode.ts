// `virtual:vscode` exists only inside the extension build, which generates
// `getWebviewHtml` from the built webview. The suites only need its return
// value to be a page.
export const getWebviewHtml = (): string => "<html></html>";

export default getWebviewHtml;
