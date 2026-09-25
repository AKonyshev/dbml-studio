/** On `<html>`, so the note behind an expanded diagram does not scroll. */
const LOCKED_CLASS = "dbml-diagram-host--locked";

/** Only what this host needs of a diagram. */
export interface Expandable {
  setExpanded: (expanded: boolean) => void;
}

/**
 * At most one diagram expanded in one window at a time.
 *
 * The rule the documentation sites' host keeps (`packages/web/src/embed/host/
 * main.ts`), for the same reason: a note may carry several diagrams, and the
 * reader can reach the toolbar of one that is already behind another.
 *
 * One window, not the application: an expanded diagram stays inside the window
 * it is drawn in (inside its note's pane, in fact — `styles.css`), so a
 * diagram in a popout window is behind nothing in the main one, and the
 * reader did not ask for it to be put back. `ExpandHosts` keeps one of these
 * per window.
 */
export class ExpandHost {
  private expanded: Expandable | null = null;
  private readonly doc: Document;
  private readonly onKeydown: (event: KeyboardEvent) => void;

  /** `root` takes the lock; the keys are heard in the document it belongs to. */
  constructor(private readonly root: HTMLElement) {
    this.doc = root.ownerDocument;

    // The frame handles Escape itself while the focus is inside it; this is
    // for when the reader has clicked outside. Listened for only while a
    // diagram is expanded, so Obsidian's own uses of Escape are left alone
    // otherwise — and in the diagram's own document, because a keydown in a
    // popout window never reaches the main one.
    this.onKeydown = (event) => {
      if (event.key === "Escape" && this.collapse()) {
        event.preventDefault();
      }
    };
  }

  /** What a frame asked for. A frame that is not the expanded one cannot put it back. */
  toggle(view: Expandable, expanded: boolean): void {
    if (!expanded) {
      if (this.expanded === view) {
        this.collapse();
      }

      return;
    }

    if (this.expanded !== null && this.expanded !== view) {
      this.expanded.setExpanded(false);
    }

    this.expanded = view;
    view.setExpanded(true);
    this.root.classList.add(LOCKED_CLASS);
    // Adding the same listener twice is a no-op, so a second expand — of
    // this diagram or another — leaves exactly one.
    this.doc.addEventListener("keydown", this.onKeydown);
  }

  /**
   * A diagram is going away. Only if it is the expanded one does anything
   * change: Obsidian re-renders blocks on edits, and another block going away
   * must not put back the diagram the reader is looking at.
   */
  release(view: Expandable): void {
    if (this.expanded === view) {
      this.collapse();
    }
  }

  /** Put back whatever is expanded; `true` if there was something. */
  collapse(): boolean {
    const view = this.expanded;

    if (view === null) {
      return false;
    }

    this.expanded = null;
    view.setExpanded(false);
    this.root.classList.remove(LOCKED_CLASS);
    this.doc.removeEventListener("keydown", this.onKeydown);

    return true;
  }
}

/**
 * One `ExpandHost` per window, found by the window's document.
 *
 * Weakly held: a popout window that is closed takes its document with it, and
 * nothing here should keep either alive. Nothing needs to be walked at unload
 * either — every diagram is released on its own way out, and the one that is
 * expanded unlocks its window then.
 */
export class ExpandHosts {
  private readonly hosts = new WeakMap<Document, ExpandHost>();

  of(doc: Document): ExpandHost {
    let host = this.hosts.get(doc);

    if (host === undefined) {
      host = new ExpandHost(doc.documentElement);
      this.hosts.set(doc, host);
    }

    return host;
  }
}
