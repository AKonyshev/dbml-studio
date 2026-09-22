/**
 * The absolute URL of a model addressed relative to the frame document, or
 * `null` when it is not on this origin.
 *
 * This is the whole of the checking done on `?model=`, and it is deliberately
 * not the checking `?src=` gets. A catalogue path may not hold `..`, because it
 * is joined to one folder and must stay inside it. A model URL is joined to the
 * frame document, and climbing out of the frame's own directory is the ordinary
 * case — the model sits in the site, not under the frame. What must not happen
 * is leaving the site, so that is what is refused.
 *
 * `blob:` and `data:` fall out of the same rule: their origin is not ours.
 *
 * The protocol is checked alongside the origin, not only the origin: the URL
 * Standard resolves a `blob:` URL's `.origin` from the URL it wraps, so
 * `blob:https://docs.example/…` reports this very origin even though nothing
 * here served it. Requiring the scheme to match too is what actually refuses
 * it, and it costs nothing for an ordinary `http(s)` model, whose scheme was
 * always part of its origin.
 */
export const resolveModelUrl = (
  value: string,
  documentUrl: string,
): string | null => {
  if (value === "") {
    return null;
  }

  try {
    const resolved = new URL(value, documentUrl);
    const document = new URL(documentUrl);

    return resolved.protocol === document.protocol &&
      resolved.origin === document.origin
      ? resolved.href
      : null;
  } catch {
    return null;
  }
};
