/**
 * One model, addressed by URL rather than through the catalogue.
 *
 * `loadSchemaText`'s sibling, and separate from it on purpose: that one owns the
 * `/schemas/` prefix and the per-segment encoding of a catalogue path, and this
 * one is handed a URL that `resolveModelUrl` has already built and proved to be
 * on this origin. Sharing them would mean one function with a flag deciding
 * which half of its own body to run.
 */
export const loadModelText = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url, { cache: "no-store" });

    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
};
