/**
 * What both integration suites need, in one place.
 *
 * Not a `__tests__` file and not compiled by jest: `tsconfig.tests.json` builds
 * this directory to `out/extension/test`, and `.vscode-test.mjs` runs only the
 * `*.test.js` in there. A helper module beside them is loaded by the suites
 * that import it and by nothing else.
 */
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import * as vscode from "vscode";

export const EXTENSION_ID = "konyshevav.dbml-studio";
export const DIAGRAM_VIEW_TYPE = "dbml-studio-diagram";

/**
 * The port `.vscode-test.mjs` opens for debugging and `hostRelay.test.ts`
 * attaches to. Written twice because a launch config cannot import from the
 * build output; changing one without the other fails as `ECONNREFUSED`, which
 * names neither file.
 */
export const DEBUG_PORT = 9333;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const openTabs = (): readonly vscode.Tab[] =>
  vscode.window.tabGroups.all.flatMap((group) => group.tabs);

/**
 * Wait for something to become true, and say what was open when it did not.
 *
 * The commands kick their work off without awaiting it, so the assertions have
 * to wait for the workbench to settle rather than for the command to return.
 * The predicate may be async: some of what is waited for lives in the page and
 * has to be asked for over the debugging port.
 */
export const waitFor = async (
  describe: string,
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 15000,
): Promise<void> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await sleep(100);
  }

  const seen = openTabs().map((tab) => {
    const input = tab.input as { viewType?: string } | undefined;
    return `${tab.label}${input?.viewType ? ` (${input.viewType})` : " (text)"}`;
  });
  assert.fail(
    `timed out waiting for ${describe}; tabs: ${JSON.stringify(seen)}`,
  );
};

/** A `.dbml` of its own, in a directory of its own, per suite. */
export const writeFixture = (prefix: string, dbml: string): vscode.Uri => {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), prefix)),
    "schema.dbml",
  );
  fs.writeFileSync(file, dbml, "utf8");

  return vscode.Uri.file(file);
};

export const diagramTabIsOpen = (): boolean =>
  openTabs().some(
    (tab) =>
      (tab.input as { viewType?: string } | undefined)?.viewType ===
      DIAGRAM_VIEW_TYPE,
  );
