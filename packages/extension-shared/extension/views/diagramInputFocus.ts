import { commands } from "vscode";

/**
 * The context key that says a field inside the diagram holds the keyboard.
 *
 * The diagram's shortcuts are bare letters bound on the workbench, and a
 * webview forwards every keystroke to it with no word about what the keystroke
 * landed in: `key`, `code` and the modifiers, and nothing else. `inputFocus`
 * covers the workbench's own boxes and cannot see in here. So the page says so
 * itself, and every one of those keybindings is guarded by `!<this key>`.
 *
 * Namespaced by the host's config session, because the `when` clauses that read
 * it live in that host's manifest.
 */
export const diagramInputFocusKey = (session: string): string =>
  `${session}.diagramInputFocus`;

/**
 * Publishes the key, and does it only when the answer changes.
 *
 * One instance per diagram, but the key is global — which is sound because only
 * one editor is active at a time, and because every path that takes the
 * keyboard away from a diagram (losing focus, closing) resets it. A key left
 * true would silently disable every shortcut for the rest of the session.
 */
export class DiagramInputFocus {
  private typing = false;

  constructor(private readonly session: string) {}

  public set(typing: boolean): void {
    if (typing === this.typing) {
      return;
    }

    this.typing = typing;
    void commands.executeCommand(
      "setContext",
      diagramInputFocusKey(this.session),
      typing,
    );
  }

  public clear(): void {
    this.set(false);
  }
}
