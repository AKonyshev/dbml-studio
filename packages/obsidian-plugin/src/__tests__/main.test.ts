import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FileSystemAdapter,
  Notice,
  type MarkdownRenderChild,
  type PluginManifest,
} from "obsidian";

import DbmlStudioPlugin from "../main";

// The `obsidian` package ships types only; the application provides the module
// at run time. This stands in for the little of it the plugin touches, and
// records what the plugin registers so a test can call it the way Obsidian
// would.
jest.mock(
  "obsidian",
  () => {
    class Plugin {
      readonly processors = new Map<string, unknown>();
      readonly commands: unknown[] = [];

      constructor(
        readonly app: unknown,
        readonly manifest: unknown,
      ) {}

      registerMarkdownCodeBlockProcessor(
        language: string,
        handler: unknown,
      ): void {
        this.processors.set(language, handler);
      }

      registerEvent(): void {}

      addCommand(command: unknown): unknown {
        this.commands.push(command);
        return command;
      }
    }

    class MarkdownRenderChild {
      constructor(readonly containerEl: HTMLElement) {}
    }

    class FileSystemAdapter {
      constructor(private readonly base: string) {}

      getBasePath(): string {
        return this.base;
      }

      getResourcePath(path: string): string {
        return `app://local/${path}?1`;
      }
    }

    return {
      Plugin,
      MarkdownRenderChild,
      FileSystemAdapter,
      Notice: jest.fn(),
      normalizePath: (path: string) => path,
    };
  },
  { virtual: true },
);

type Processor = (
  source: string,
  element: HTMLElement,
  context: {
    sourcePath: string;
    addChild: (child: MarkdownRenderChild) => void;
  },
) => Promise<void>;

/** What the stand-in `Plugin` above records. */
interface Registered {
  processors: Map<string, Processor>;
  commands: Array<{ id: string; callback: () => unknown }>;
}

/** One rendering of a block, as Obsidian hands it to the processor. */
interface Rendered {
  element: HTMLElement;
  /** The listeners the plugin has on `onWindowMigrated` and not taken back. */
  migrationHooks: Set<(win: Window) => unknown>;
}

let vault: string;

beforeEach(async () => {
  vault = await mkdtemp(join(tmpdir(), "dbml-obsidian-"));
  await writeFile(join(vault, "a.dbml"), "Table a { id int }");
  jest.mocked(Notice).mockClear();
});

afterEach(async () => {
  document.body.innerHTML = "";
  jest.restoreAllMocks();
  await rm(vault, { recursive: true, force: true });
});

const loadPlugin = (): DbmlStudioPlugin => {
  const app = {
    vault: {
      adapter: new (FileSystemAdapter as unknown as new (
        base: string,
      ) => FileSystemAdapter)(vault),
    },
    workspace: { on: () => ({}) },
  };
  const manifest: Partial<PluginManifest> = { dir: "plugin" };
  const plugin = new DbmlStudioPlugin(app as never, manifest as PluginManifest);

  plugin.onload();

  return plugin;
};

/**
 * Renders `source` the way Obsidian does, into an element of `win`'s document
 * that carries the helpers Obsidian adds to every element.
 */
const render = async (
  plugin: DbmlStudioPlugin,
  source: string,
  win: Window = window,
): Promise<Rendered> => {
  const processor = (plugin as unknown as Registered).processors.get("dbml");

  if (processor === undefined) {
    throw new Error("the plugin registered no dbml processor");
  }

  const element = win.document.createElement("div");
  const migrationHooks = new Set<(win: Window) => unknown>();

  win.document.body.append(element);
  Object.assign(element, {
    doc: win.document,
    win,
    onWindowMigrated: (listener: (win: Window) => unknown) => {
      migrationHooks.add(listener);

      return () => {
        migrationHooks.delete(listener);
      };
    },
  });

  await processor(source, element, {
    sourcePath: "note.md",
    addChild: () => undefined,
  });

  return { element, migrationHooks };
};

/** Runs a command as the palette does, and waits for what it started. */
const runCommand = async (
  plugin: DbmlStudioPlugin,
  id: string,
): Promise<void> => {
  const command = (plugin as unknown as Registered).commands.find(
    (candidate) => candidate.id === id,
  );

  if (command === undefined) {
    throw new Error(`the plugin registered no ${id} command`);
  }

  await command.callback();
};

describe("refreshing the diagrams", () => {
  // Obsidian renders every block twice while a note is open — in reading view
  // and in the hidden Live Preview editor — and a note may draw one model in
  // several blocks. The reader asked once, and hears once per file.
  it("says once per model file that it cannot be read", async () => {
    const plugin = loadPlugin();

    await writeFile(join(vault, "b.dbml"), "Table b { id int }");

    for (const model of ["/a.dbml", "/a.dbml", "/b.dbml", "/b.dbml"]) {
      await render(plugin, `model: ${model}`);
    }

    await unlink(join(vault, "a.dbml"));
    await unlink(join(vault, "b.dbml"));
    await runCommand(plugin, "refresh-diagrams");

    const said = jest.mocked(Notice).mock.calls.map(([message]) => message);

    expect(said).toHaveLength(2);
    expect(said[0]).toContain(join(vault, "a.dbml"));
    expect(said[1]).toContain(join(vault, "b.dbml"));
  });
});

describe("switching the plugin off", () => {
  // A note whose view Obsidian does not render again keeps its elements, and
  // dragging its tab to another window would otherwise move a diagram that
  // was already taken down.
  it("stops following each diagram's window", async () => {
    const plugin = loadPlugin();
    const { migrationHooks } = await render(plugin, "model: /a.dbml");

    expect(migrationHooks.size).toBe(1);

    plugin.onunload();

    expect(migrationHooks.size).toBe(0);
  });
});
