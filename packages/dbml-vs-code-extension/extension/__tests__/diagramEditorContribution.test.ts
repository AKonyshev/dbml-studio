import * as fs from "fs";
import * as path from "path";

import { WEB_VIEW_NAME } from "../constants";
import { DIAGRAM_ACTION_IDS } from "json-table-schema-visualizer/src/stores/diagramActions";

import { DIAGRAM_ACTION_COMMANDS } from "../diagramActionCommands";

interface Manifest {
  contributes: {
    commands: Array<{ command: string; title: string }>;
    keybindings?: Array<{ command: string; key: string; when?: string }>;
    customEditors?: Array<{
      viewType: string;
      displayName: string;
      priority: string;
      selector: Array<{ filenamePattern: string }>;
    }>;
    menus: Record<
      string,
      Array<{ command: string; when?: string; alt?: string }>
    >;
  };
}

const readJson = <T>(...segments: string[]): T =>
  JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", ...segments), "utf8"),
  ) as T;

const manifest = (): Manifest => readJson<Manifest>("package.json");

describe("custom editor contribution", () => {
  test("the declared viewType is the one the code registers", () => {
    const editors = manifest().contributes.customEditors ?? [];

    expect(editors).toHaveLength(1);
    expect(editors[0].viewType).toBe(WEB_VIEW_NAME);
    expect(editors[0].priority).toBe("option");
    expect(editors[0].selector).toEqual([{ filenamePattern: "*.dbml" }]);
  });

  test("the preview and source buttons are mutually exclusive", () => {
    const titleMenu = manifest().contributes.menus["editor/title"];
    const preview = titleMenu.find(
      (item) => item.command === "dbmlStudio.previewDiagrams",
    );
    const source = titleMenu.find(
      (item) => item.command === "dbmlStudio.showSource",
    );

    // Without the negation both would show at once: resourceLangId stays `dbml`
    // while the diagram is the active editor.
    expect(preview?.when).toBe(
      `resourceLangId == dbml && activeCustomEditorId != '${WEB_VIEW_NAME}'`,
    );
    expect(source?.when).toBe(`activeCustomEditorId == '${WEB_VIEW_NAME}'`);
    expect(preview?.alt).toBe("dbmlStudio.previewDiagramsInPlace");
  });

  test("every diagram action is a command bound to the diagram alone", () => {
    // The keys are the reader's to change, so each has to arrive as a command;
    // the `when` clause is what keeps a bare letter from firing while they are
    // typing anywhere else in the workbench.
    const { commands, keybindings = [] } = manifest().contributes;
    const declared = new Set(commands.map((command) => command.command));

    for (const [command] of DIAGRAM_ACTION_COMMANDS) {
      expect(declared.has(command)).toBe(true);

      const binding = keybindings.find((item) => item.command === command);
      expect(binding?.when).toBe(`activeCustomEditorId == '${WEB_VIEW_NAME}'`);
      expect(binding?.key).toBeTruthy();
    }
  });

  test("every action the diagram answers to has a command", () => {
    // The two lists are written apart — one in the visualizer, one here — and
    // nothing at runtime would notice them drifting: the webview keeps no
    // keyboard of its own inside VS Code, so an action with no command is
    // simply unreachable, silently. This is the check that notices.
    const relayed = new Set(
      DIAGRAM_ACTION_COMMANDS.map(([, action]) => action),
    );

    expect([...relayed].sort()).toEqual([...DIAGRAM_ACTION_IDS].sort());
  });

  test("no two diagram actions want the same key", () => {
    const keys = (manifest().contributes.keybindings ?? []).map(
      (binding) => binding.key,
    );

    expect(new Set(keys).size).toBe(keys.length);
  });

  // It acts on the table under the pointer, and opening the palette takes both
  // the focus and the pointer away from the diagram — so from there it would
  // always find nothing to act on. The key still reaches it, and so does a key
  // the reader rebinds, which is what the command exists for.
  const HIDDEN_FROM_PALETTE = new Set(["dbmlStudio.toggleTableRelations"]);

  test("the diagram actions reach the palette only with a diagram open", () => {
    const palette = manifest().contributes.menus.commandPalette;

    for (const [command] of DIAGRAM_ACTION_COMMANDS) {
      if (HIDDEN_FROM_PALETTE.has(command)) {
        continue;
      }

      const item = palette.find((entry) => entry.command === command);
      expect(item?.when).toBe(`activeCustomEditorId == '${WEB_VIEW_NAME}'`);
    }
  });

  test("an action the palette cannot serve is kept out of it", () => {
    const palette = manifest().contributes.menus.commandPalette;

    for (const command of HIDDEN_FROM_PALETTE) {
      const item = palette.find((entry) => entry.command === command);
      expect(item?.when).toBe("false");
    }
  });

  test("every menu command is a contributed command", () => {
    const { commands, menus } = manifest().contributes;
    const declared = new Set(commands.map((command) => command.command));

    for (const items of Object.values(menus)) {
      for (const item of items) {
        expect(declared.has(item.command)).toBe(true);
        if (item.alt !== undefined) {
          expect(declared.has(item.alt)).toBe(true);
        }
      }
    }
  });
});

describe("manifest translations", () => {
  // A missing key falls back to English silently, which is how the panel
  // shipped half-translated once already.
  const collectNlsKeys = (value: unknown): string[] => {
    if (typeof value === "string") {
      const match = /^%(.+)%$/.exec(value);
      return match === null ? [] : [match[1]];
    }
    if (Array.isArray(value)) {
      return value.flatMap(collectNlsKeys);
    }
    if (value !== null && typeof value === "object") {
      return Object.values(value).flatMap(collectNlsKeys);
    }
    return [];
  };

  test.each([
    "package.nls.json",
    "package.nls.ru.json",
    "package.nls.zh-cn.json",
  ])("%s defines every key the manifest references", (file) => {
    const used = new Set(collectNlsKeys(manifest()));
    const defined = readJson<Record<string, string>>(file);
    const missing = [...used].filter((key) => !(key in defined));

    expect(missing).toEqual([]);
  });
});
