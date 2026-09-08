/**
 * One document, one writer at a time.
 *
 * Two paths write to a `.dbml` file: a field edit, which replaces a few ranges,
 * and the debounced position sync, which replaces the whole document.
 * Interleaved, the position sync rewrites the file from a snapshot taken before
 * the field edit and the edit silently disappears — a bug that is rare, depends
 * on timing, and cannot be reproduced on demand. So the two are serialised
 * rather than hoped about.
 */
export class DocumentWriteQueue {
  private readonly tails = new Map<string, Promise<void>>();

  public async run<T>(documentUri: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(documentUri) ?? Promise.resolve();

    // The tail must never reject, or one failed write would poison every write
    // that queued behind it.
    const next = previous.then(task, task);

    this.tails.set(
      documentUri,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );

    return await next;
  }
}
