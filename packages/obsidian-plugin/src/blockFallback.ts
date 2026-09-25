/** The class the stylesheet dresses, and the hook the tests look for. */
const ERROR_CLASS = "dbml-diagram-error";

/**
 * One message where the diagram would have been.
 *
 * `replaceChildren` rather than an append: Obsidian re-runs a block's
 * processor on edits, and an error appended to the last one would stack up a
 * column of stale complaints.
 */
export const renderBlockError = (
  container: HTMLElement,
  message: string,
): void => {
  const box = container.ownerDocument.createElement("div");

  box.className = ERROR_CLASS;
  box.textContent = message;
  container.replaceChildren(box);
};

/**
 * A ```dbml block that is not a diagram, shown as the code it is.
 *
 * Registering a processor for `dbml` takes every such block away from
 * Obsidian's own renderer, so a note about the language itself would otherwise
 * be left with a hole. `textContent`, never markup: the block is the author's
 * text, `<` and all.
 */
export const renderBlockCode = (
  container: HTMLElement,
  source: string,
): void => {
  const doc = container.ownerDocument;
  const pre = doc.createElement("pre");
  const code = doc.createElement("code");

  pre.className = "language-dbml";
  code.className = "language-dbml";
  code.textContent = source;
  pre.append(code);
  container.replaceChildren(pre);
};
