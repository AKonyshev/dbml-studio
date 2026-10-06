/* global DBML_FRAME_BUILD, DBML_FRAME_GZIP -- put in by esbuild's `define` (src/globals.d.ts) */
import { readFile } from "node:fs/promises";

import {
  FileSystemAdapter,
  getLanguage,
  MarkdownRenderChild,
  Notice,
  normalizePath,
  Plugin,
  type MarkdownPostProcessorContext,
} from "obsidian";

import { followAppTheme, themeOf } from "./appTheme";
import { renderBlockCode, renderBlockError } from "./blockFallback";
import { parseBlockParams, type FrameTheme } from "./blockParams";
import { ExpandHosts, type ExpandHost } from "./expandHost";
import { ensureFrame, unpackFrame } from "./frameArchive";
import { withLanguage } from "./frameSrc";
import { frameUrl } from "./frameUrl";
import { FrameView } from "./frameView";
import { catalogFor } from "./i18n/language";
import { en } from "./i18n/locales/en";
import { messagesFor, type Messages } from "./messages";
import { moveDiagram } from "./moveDiagram";
import { resolveModelPath } from "./resolveModelPath";

/** One live diagram, and everything needed to send it its model again. */
interface Diagram {
  view: FrameView;
  /** The host of the window the diagram is drawn in. */
  expandHost: ExpandHost;
  path: string;
  tables: string[] | null;
  /** The theme the block pinned, or `null` to follow the application. */
  pinnedTheme: FrameTheme | null;
  /** Takes back the `onWindowMigrated` listener that moves the diagram. */
  stopFollowingWindow: () => void;
}

/**
 * A block's share of the note's lifetime.
 *
 * Obsidian re-runs a block's processor whenever the note is edited and unloads
 * the rendered children when the note is closed. This is added to the context
 * before the model is read, not after: the read is asynchronous, and a block
 * that went away in the meantime has to be able to say so — `gone` is how the
 * rest of `renderBlock` finds out there is nobody left to draw for.
 */
class BlockChild extends MarkdownRenderChild {
  gone = false;
  private cleanup: (() => void) | null = null;

  /** What to undo when the block goes. */
  own(cleanup: () => void): void {
    this.cleanup = cleanup;
  }

  onunload(): void {
    this.gone = true;
    this.cleanup?.();
    this.cleanup = null;
  }
}

export default class DbmlStudioPlugin extends Plugin {
  private readonly diagrams = new Set<Diagram>();

  /**
   * One expanded diagram per window, not per application: an expanded
   * diagram stays inside its own window, and one in a popout is behind nothing
   * in the main window. Each host locks its own document and hears Escape in
   * it — a keydown in a popout never reaches the main window.
   */
  private readonly expandHosts = new ExpandHosts();

  /**
   * Set once the plugin is switched off. A model read already under way when
   * that happens finishes afterwards, and must find nobody to draw for: its
   * diagram would outlive the plugin, with no `onunload` left to take it down.
   */
  private unloaded = false;

  /**
   * Settles once the frame this `main.js` carries is in the plugin folder:
   * with `null`, or with what stopped it being written. Never rejects, so a
   * failure is told in each block rather than lost as an unhandled rejection.
   */
  private frameReady: Promise<unknown> = Promise.resolve(null);

  /**
   * Every sentence a reader sees, in Obsidian's language: Russian when the
   * application is in Russian, English otherwise. Read once, on load — Obsidian
   * restarts to change its language, and a plugin loads afresh with it.
   */
  private text: Messages = messagesFor(en);

  onload(): void {
    this.text = messagesFor(catalogFor(getLanguage()));

    this.frameReady = ensureFrame(this.app.vault.adapter, this.frameFolder(), {
      build: DBML_FRAME_BUILD,
      html: async () => await unpackFrame(DBML_FRAME_GZIP),
    }).then(
      () => null,
      (error: unknown) => error ?? new Error("unknown"),
    );

    this.registerMarkdownCodeBlockProcessor(
      "dbml",
      async (source, element, context) => {
        await this.renderBlock(source, element, context);
      },
    );

    // `css-change` is what Obsidian fires when the theme is switched — and for
    // any other stylesheet change, which is why each diagram compares before
    // it says anything (`FrameView.setTheme`).
    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        this.followAppTheme();
      }),
    );

    this.addCommand({
      id: "refresh-diagrams",
      name: this.text.refreshCommandName,
      // Returned, not awaited: Obsidian ignores it, and a test can wait on it.
      callback: async () => {
        await this.refreshAll();
      },
    });
  }

  /**
   * `frame/` in the plugin's own folder, addressed from the vault root as the
   * adapter addresses everything. Obsidian always gives a plugin its `dir`;
   * the fallback is where it would be.
   */
  private frameFolder(): string {
    const dir =
      this.manifest.dir ??
      `${this.app.vault.configDir}/plugins/${this.manifest.id}`;

    return normalizePath(`${dir}/frame`);
  }

  onunload(): void {
    this.unloaded = true;

    for (const diagram of this.diagrams) {
      this.drop(diagram);
    }
  }

  /**
   * Take a diagram down. Released first: if it is the expanded one, its window
   * is unlocked and stops listening for Escape; if it is any other, the
   * expanded one stays where the reader put it.
   *
   * It stops following its window here too, not only when its block goes: a
   * plugin switched off leaves the elements of a note Obsidian does not render
   * again, and a tab dragged elsewhere afterwards would move a dead diagram,
   * listening in the new window and keeping the plugin alive.
   */
  private drop(diagram: Diagram): void {
    diagram.stopFollowingWindow();
    diagram.expandHost.release(diagram.view);
    diagram.view.destroy();
    this.diagrams.delete(diagram);
  }

  /**
   * Read the theme once, from the main window's body (the plugin's own
   * `document`), for every diagram, popouts included. `css-change` fires
   * before Obsidian updates a popout's body classes, so a popout's own body
   * still names the old theme at this moment (`followAppTheme` in
   * `appTheme.ts`).
   */
  private followAppTheme(): void {
    followAppTheme(this.diagrams, document.body);
  }

  /**
   * Re-read every live diagram's model and push it out again.
   *
   * The frames keep their document key across this, so the tables stay where
   * the reader put them and only new ones are laid out — which is the point of
   * re-sending rather than rebuilding the frames. There is no watching of the
   * file: this command is how a model edited elsewhere reaches the note.
   *
   * By model file, not by diagram. Obsidian renders every block twice while
   * a note is open (reading view and the hidden Live Preview editor), and
   * several blocks may draw one model: each file is read once, and a file
   * that cannot be read is one toast, not one per rendered copy.
   */
  private async refreshAll(): Promise<void> {
    const byPath = new Map<string, Diagram[]>();

    for (const diagram of this.diagrams) {
      byPath.set(diagram.path, [...(byPath.get(diagram.path) ?? []), diagram]);
    }

    await Promise.all(
      [...byPath].map(async ([path, copies]) => {
        await this.refresh(path, copies);
      }),
    );
  }

  /** Reads `path` once, for every diagram of it that is still drawn. */
  private async refresh(path: string, copies: Diagram[]): Promise<void> {
    // The block may have been removed (note edited or closed) while the read
    // was in flight, or the plugin switched off — the same guard `renderBlock`
    // uses, expressed through set membership instead of `gone`.
    const live = (): Diagram[] =>
      this.unloaded
        ? []
        : copies.filter((diagram) => this.diagrams.has(diagram));

    let text: string;

    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      // Unlike the first render, there is no block element left to write an
      // error into — the diagram is already on screen. A command the reader
      // just invoked gets a toast instead, in the same words.
      if (live().length > 0) {
        void new Notice(
          this.text.modelUnreadableText(
            path,
            this.text.readFailureReason(error),
          ),
        );
      }

      return;
    }

    // The application's theme from the main window's body, as theme switching
    // and moving between windows read it (`followAppTheme`), not from the
    // diagram's own body. A popout's body lags the theme while `css-change`
    // is being handled; the main one never does, so there is one reading of
    // "the application's theme" and no window whose body can be caught out.
    const appTheme = themeOf(document.body);

    for (const diagram of live()) {
      diagram.view.setDocument({
        text,
        tables: diagram.tables,
        theme: diagram.pinnedTheme ?? appTheme,
      });
    }
  }

  private async renderBlock(
    source: string,
    element: HTMLElement,
    context: MarkdownPostProcessorContext,
  ): Promise<void> {
    const parsed = parseBlockParams(source);

    // Not a diagram: DBML itself, which ```dbml has always meant.
    if (parsed === null) {
      renderBlockCode(element, source);
      return;
    }

    if (!parsed.ok) {
      renderBlockError(element, this.text.blockErrorText(parsed.error));
      return;
    }

    const adapter = this.app.vault.adapter;

    if (!(adapter instanceof FileSystemAdapter)) {
      renderBlockError(element, this.text.vaultNotOnDiskText());
      return;
    }

    const { model, tables, height, theme: pinnedTheme } = parsed.params;
    const path = resolveModelPath(
      model,
      adapter.getBasePath(),
      context.sourcePath,
    );
    const child = new BlockChild(element);

    context.addChild(child);

    let text: string;

    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if (!child.gone && !this.unloaded) {
        renderBlockError(
          element,
          this.text.modelUnreadableText(
            path,
            this.text.readFailureReason(error),
          ),
        );
      }

      return;
    }

    if (child.gone || this.unloaded) {
      return;
    }

    // A frame element made before its document is written would load an
    // error page, and only a reload would bring it back.
    const frameFailure = await this.frameReady;

    if (child.gone || this.unloaded) {
      return;
    }

    if (frameFailure !== null) {
      renderBlockError(element, this.text.frameUnavailableText(frameFailure));
      return;
    }

    // The block's own window and document, not the globals: a note opened in
    // a popout window renders there, its frame says hello to that window, and
    // a listener on the main one would never hear it. Read after the model,
    // when the block is in the note it belongs to.
    const theme = pinnedTheme ?? themeOf(element.doc.body);
    const expandHost = this.expandHosts.of(element.doc);

    // The frame's message listener is FrameView's own, added here and removed
    // by `destroy` — which the child runs when Obsidian drops this rendering
    // of the block (an edit re-renders it, closing the note unloads it). No
    // listener is registered per render on the plugin.
    const view = new FrameView({
      container: element,
      // The theme rides in the query as well as in the document: the frame
      // paints before the handshake, and a light frame in a dark note reads as
      // a second thing having gone wrong. FrameView puts it in the URL when
      // the frame actually loads, in whichever theme is current by then.
      // The language rides there too, so that the frame's toolbar and errors
      // speak Obsidian's language rather than the system's.
      url: withLanguage(frameUrl(this, "frame/embed.html"), getLanguage()),
      theme,
      height,
      title: model,
      messageTarget: element.win,
      // `diagram` is read when the frame asks, long after this constructor has
      // returned, and its host changes if the diagram moves to another window.
      onExpand: (expanded) => {
        diagram.expandHost.toggle(view, expanded);
      },
    });

    const diagram: Diagram = {
      view,
      expandHost,
      path,
      tables,
      pinnedTheme,
      // Dragging the note's tab into another window moves these elements
      // there without rendering the block again; the frame reloads there.
      stopFollowingWindow: element.onWindowMigrated((win) => {
        moveDiagram(
          diagram,
          win as Window & typeof globalThis,
          this.expandHosts,
          document.body,
        );
      }),
    };

    this.diagrams.add(diagram);
    child.own(() => {
      this.drop(diagram);
    });

    view.setDocument({ text, tables, theme });
  }
}
