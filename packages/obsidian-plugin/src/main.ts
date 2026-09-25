import { readFile } from "node:fs/promises";

import {
  FileSystemAdapter,
  MarkdownRenderChild,
  Plugin,
  type MarkdownPostProcessorContext,
} from "obsidian";

import { themeOf } from "./appTheme";
import { renderBlockCode, renderBlockError } from "./blockFallback";
import { parseBlockParams, type FrameTheme } from "./blockParams";
import { withTheme } from "./frameSrc";
import { frameUrl } from "./frameUrl";
import { FrameView } from "./frameView";
import {
  blockErrorText,
  modelUnreadableText,
  readFailureReason,
  vaultNotOnDiskText,
} from "./messages";
import { resolveModelPath } from "./resolveModelPath";

/** One live diagram, and everything needed to send it its model again. */
interface Diagram {
  view: FrameView;
  path: string;
  tables: string[] | null;
  /** The theme the block pinned, or `null` to follow the application. */
  pinnedTheme: FrameTheme | null;
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
   * Set once the plugin is switched off. A model read already under way when
   * that happens finishes afterwards, and must find nobody to draw for: its
   * diagram would outlive the plugin, with no `onunload` left to take it down.
   */
  private unloaded = false;

  onload(): void {
    this.registerMarkdownCodeBlockProcessor(
      "dbml",
      async (source, element, context) => {
        await this.renderBlock(source, element, context);
      },
    );
  }

  onunload(): void {
    this.unloaded = true;

    for (const diagram of this.diagrams) {
      diagram.view.destroy();
    }

    this.diagrams.clear();
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
      renderBlockError(element, blockErrorText(parsed.error));
      return;
    }

    const adapter = this.app.vault.adapter;

    if (!(adapter instanceof FileSystemAdapter)) {
      renderBlockError(element, vaultNotOnDiskText());
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
          modelUnreadableText(path, readFailureReason(error)),
        );
      }

      return;
    }

    if (child.gone || this.unloaded) {
      return;
    }

    // The block's own window and document, not the globals: a note opened in
    // a popout window renders there, its frame says hello to that window, and
    // a listener on the main one would never hear it. Read after the model,
    // when the block is in the note it belongs to.
    const theme = pinnedTheme ?? themeOf(element.doc.body);

    // The frame's message listener is FrameView's own, added here and removed
    // by `destroy` — which the child runs when Obsidian drops this rendering
    // of the block (an edit re-renders it, closing the note unloads it). No
    // listener is registered per render on the plugin.
    const view = new FrameView({
      container: element,
      // The theme rides in the query as well as in the document: the frame
      // paints before the handshake, and a light frame in a dark note reads as
      // a second thing having gone wrong.
      url: withTheme(frameUrl(this, "frame/embed.html"), theme),
      height,
      title: model,
      messageTarget: element.win,
    });

    const diagram: Diagram = { view, path, tables, pinnedTheme };

    this.diagrams.add(diagram);
    child.own(() => {
      view.destroy();
      this.diagrams.delete(diagram);
    });

    view.setDocument({ text, tables, theme });
  }
}
