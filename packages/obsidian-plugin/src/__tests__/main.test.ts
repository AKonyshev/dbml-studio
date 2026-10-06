import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DecompressionStream } from "node:stream/web";
import { TextDecoder } from "node:util";
import { gunzipSync } from "node:zlib";

import {
  FileSystemAdapter,
  Notice,
  type MarkdownRenderChild,
  type PluginManifest,
} from "obsidian";

import { FrameView } from "../frameView";
import DbmlStudioPlugin from "../main";
import { frameUnavailableText } from "../messages";

import type * as PathModule from "node:path";
import type * as FsPromisesModule from "node:fs/promises";
import type * as FsModule from "node:fs";

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

    const nodePath = jest.requireActual<typeof PathModule>("node:path");
    const nodeFs = jest.requireActual<typeof FsModule>("node:fs");
    const nodeFsPromises =
      jest.requireActual<typeof FsPromisesModule>("node:fs/promises");

    // The adapter's file calls address the vault folder, which is where the
    // plugin folder lives; this one does it on a real temporary folder.
    // `beforeWrite` lets a test hold a write back, or fail it.
    class FileSystemAdapter {
      static beforeWrite: ((path: string) => Promise<void>) | null = null;

      constructor(private readonly base: string) {}

      getBasePath(): string {
        return this.base;
      }

      private full(path: string): string {
        return nodePath.join(this.base, path);
      }

      async exists(path: string): Promise<boolean> {
        return nodeFs.existsSync(this.full(path));
      }

      async read(path: string): Promise<string> {
        return await nodeFsPromises.readFile(this.full(path), "utf8");
      }

      async write(path: string, data: string): Promise<void> {
        await FileSystemAdapter.beforeWrite?.(path);
        await nodeFsPromises.writeFile(this.full(path), data);
      }

      async mkdir(path: string): Promise<void> {
        await nodeFsPromises.mkdir(this.full(path), { recursive: true });
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

/**
 * What Obsidian adds to every node of a window: `doc` and `win`, the document
 * and window the node belongs to. A window has a `Node` of its own, so each
 * window a test draws in gets them.
 */
const giveNodeHelpers = (win: Window): void => {
  const { Node: WindowNode } = win as Window & typeof globalThis;

  Object.defineProperties(WindowNode.prototype, {
    doc: {
      configurable: true,
      get(this: Node) {
        return this.ownerDocument;
      },
    },
    win: {
      configurable: true,
      get(this: Node) {
        return this.ownerDocument?.defaultView;
      },
    },
  });
};

/** A popout window: a jsdom frame's, which has a document and realm of its own. */
const popout = (): Window => {
  const holder = document.createElement("iframe");

  document.body.append(holder);

  const win = holder.contentWindow;

  if (win === null) {
    throw new Error("jsdom gave the popout no window");
  }

  giveNodeHelpers(win);

  return win;
};

let vault: string;

/** The stand-in adapter's class, with the hook its writes go through. */
const Adapter = FileSystemAdapter as unknown as {
  beforeWrite: ((path: string) => Promise<void>) | null;
};

beforeAll(() => {
  giveNodeHelpers(window);
  // jsdom has neither; Obsidian's Chromium has both. These are Node's own
  // implementations of the same web APIs, not stand-ins.
  Object.assign(globalThis, { DecompressionStream, TextDecoder });
});

beforeEach(async () => {
  vault = await mkdtemp(join(tmpdir(), "dbml-obsidian-"));
  await mkdir(join(vault, "plugin"));
  await writeFile(join(vault, "a.dbml"), "Table a { id int }");
  jest.mocked(Notice).mockClear();
});

afterEach(async () => {
  document.body.innerHTML = "";
  document.body.className = "";
  Adapter.beforeWrite = null;
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
 * Renders `source` the way Obsidian does, into an element of `win`'s document,
 * and records the element's `onWindowMigrated` listeners.
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

/** Lets every promise already settled run its callbacks, and timers fire. */
const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 20));
};

describe("the frame the plugin carries", () => {
  // Installed from the Community plugins directory, the plugin folder holds
  // main.js, manifest.json and styles.css, and nothing else.
  it("is written into the plugin folder of a fresh install", async () => {
    const plugin = loadPlugin();

    await render(plugin, "model: /a.dbml");

    expect(existsSync(join(vault, "plugin/frame/embed.html"))).toBe(true);
    expect(await readFile(join(vault, "plugin/frame/embed.html"), "utf8")).toBe(
      gunzipSync(Buffer.from(DBML_FRAME_GZIP, "base64")).toString("utf8"),
    );
    expect(await readFile(join(vault, "plugin/frame/BUILD"), "utf8")).toBe(
      DBML_FRAME_BUILD,
    );
  });

  it("is in place before a block makes a frame element", async () => {
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    Adapter.beforeWrite = async () => {
      await held;
    };

    const plugin = loadPlugin();
    const rendering = render(plugin, "model: /a.dbml");

    await settle();
    expect(document.querySelector("iframe")).toBeNull();

    release();
    const { element } = await rendering;

    expect(element.querySelector("iframe")).not.toBeNull();
    expect(existsSync(join(vault, "plugin/frame/BUILD"))).toBe(true);
  });

  it("that cannot be written is an error in the block, not an empty frame", async () => {
    const failure = new Error("EROFS: read-only file system");

    Adapter.beforeWrite = async () => {
      throw failure;
    };

    const plugin = loadPlugin();
    const { element } = await render(plugin, "model: /a.dbml");

    expect(element.querySelector("iframe")).toBeNull();
    expect(element.querySelector(".dbml-diagram-error")?.textContent).toBe(
      frameUnavailableText(failure),
    );
  });
});

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

    // Sorted: the two reads finish in whichever order the disk answers.
    const said = jest
      .mocked(Notice)
      .mock.calls.map(([message]) => String(message))
      .sort();

    expect(said).toHaveLength(2);
    expect(said[0]).toContain(join(vault, "a.dbml"));
    expect(said[1]).toContain(join(vault, "b.dbml"));
  });

  it("sends the model it read again to every diagram of it", async () => {
    const plugin = loadPlugin();

    await render(plugin, "model: /a.dbml");
    await render(plugin, "model: /a.dbml\ntables: [a]");

    const sent = jest.spyOn(FrameView.prototype, "setDocument");

    await writeFile(join(vault, "a.dbml"), "Table a { id int }\nTable b {}");
    await runCommand(plugin, "refresh-diagrams");

    expect(sent.mock.calls.map(([next]) => [next.text, next.tables])).toEqual([
      ["Table a { id int }\nTable b {}", null],
      ["Table a { id int }\nTable b {}", ["a"]],
    ]);
  });

  // `css-change` fires before Obsidian moves a popout window's body to the
  // new theme, so the application's theme is read from the main window's body
  // everywhere (`followAppTheme`), refresh included.
  it("sends it in the theme of the main window's body", async () => {
    const plugin = loadPlugin();
    const win = popout();

    win.document.body.className = "theme-light";
    await render(plugin, "model: /a.dbml", win);
    document.body.className = "theme-dark";

    const sent = jest.spyOn(FrameView.prototype, "setDocument");

    await runCommand(plugin, "refresh-diagrams");

    expect(sent).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "dark" }),
    );
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
