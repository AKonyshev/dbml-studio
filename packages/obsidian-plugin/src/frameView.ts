import { type FrameTheme } from "./blockParams";
import {
  documentMessage,
  parseFrameMessage,
  readyMessage,
  type HostMessage,
} from "./hostProtocol";

export interface FrameDocument {
  text: string;
  tables: string[] | null;
  theme: FrameTheme;
}

export interface FrameViewOptions {
  container: HTMLElement;
  url: string;
  height: number;
  /** What a screen reader and a broken frame both say: the model's name. */
  title: string;
  /** The window whose `message` events carry the frame's half of the protocol. */
  messageTarget: Window;
}

/**
 * The box every frame sits in — the class the documentation sites' host
 * stylesheet dresses too (`packages/web/src/embed/host/host.css`), so a
 * diagram is the same element wherever it is drawn.
 */
const WRAPPER_CLASS = "dbml-diagram";
const FRAME_CLASS = "dbml-diagram-frame";

/**
 * One diagram in a note: the frame, and the conversation with it.
 *
 * Messages go out with `"*"` rather than an origin. An Obsidian window is
 * `app://obsidian.md` and the frame is served from wherever the application
 * serves plugin files, so there is no origin to name. What replaces the origin
 * check is identity: a message is ours only if it came from the very window
 * this object created, and a document only ever goes to that window — the
 * same rule the frame keeps from its side (`isFromHost` in `frameHost.ts`).
 *
 * Standard DOM only, through the container's own document: nothing here needs
 * Obsidian's element helpers, and without them this runs in a test.
 */
export class FrameView {
  readonly wrapper: HTMLDivElement;
  readonly element: HTMLIFrameElement;

  private readonly messageTarget: Window;
  private readonly onMessage: (event: MessageEvent) => void;
  private pending: FrameDocument | null = null;
  private greeted = false;

  constructor({
    container,
    url,
    height,
    title,
    messageTarget,
  }: FrameViewOptions) {
    const doc = container.ownerDocument;

    this.wrapper = doc.createElement("div");
    this.wrapper.className = WRAPPER_CLASS;

    this.element = doc.createElement("iframe");
    this.element.className = FRAME_CLASS;
    this.element.width = "100%";
    this.element.height = String(height);
    this.element.title = title;
    this.element.src = url;

    this.messageTarget = messageTarget;
    this.onMessage = (event) => {
      this.receive(event);
    };

    // Listening before the frame is in the document: it says hello the
    // moment its script runs.
    messageTarget.addEventListener("message", this.onMessage);

    this.wrapper.append(this.element);
    container.append(this.wrapper);
  }

  /** The model this frame should draw, now or as soon as it says hello. */
  setDocument(next: FrameDocument): void {
    this.pending = next;

    if (this.greeted) {
      this.send(documentMessage(next.text, next.tables, next.theme));
    }
  }

  destroy(): void {
    this.messageTarget.removeEventListener("message", this.onMessage);
    this.wrapper.remove();
  }

  private receive(event: MessageEvent): void {
    if (event.source !== this.element.contentWindow) {
      return;
    }

    const message = parseFrameMessage(event.data);

    if (message?.type === "hello") {
      this.greet();
    }
  }

  /**
   * Every hello, not only the first. A hosted frame greets twice by design —
   * once from `bootstrap` before it has anything to draw, once from
   * `useHostExpand` when the diagram mounts — and a frame that reloads greets
   * again from scratch. Each gets `ready`, and the document the frame should be
   * showing: a re-send of the one already drawn is recognised by the frame and
   * costs it nothing.
   */
  private greet(): void {
    this.greeted = true;
    this.send(readyMessage());

    if (this.pending !== null) {
      this.send(
        documentMessage(
          this.pending.text,
          this.pending.tables,
          this.pending.theme,
        ),
      );
    }
  }

  private send(message: HostMessage): void {
    this.element.contentWindow?.postMessage(message, "*");
  }
}
