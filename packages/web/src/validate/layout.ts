import { METAINFO_END, METAINFO_START } from "dbml-to-json-table-schema";

/**
 * What is wrong with the layout a model carries, in the words an author needs.
 *
 * The one check here that the frame itself does not make, and the reason this
 * module exists: `extractMetaInfo` answers `null` for a block that will not
 * parse, and the viewer then arranges the model from scratch. Nothing is shown,
 * nothing is logged, and a diagram somebody arranged by hand is simply gone.
 *
 * The delimiters come from the package that writes them, so this cannot drift
 * from the format.
 */
export const layoutProblems = (
  source: string,
  tableNames: string[],
): string[] => {
  const start = source.indexOf(METAINFO_START);

  if (start === -1) {
    return [];
  }

  const from = start + METAINFO_START.length;
  const end = source.indexOf(METAINFO_END, from);

  if (end === -1) {
    return ["the saved layout is never closed off with `MetaInfo*/`"];
  }

  let entries: unknown;

  try {
    entries = JSON.parse(source.slice(from, end).trim());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    return [
      `the saved layout is not valid JSON, so the whole of it is discarded: ${reason}`,
    ];
  }

  if (!Array.isArray(entries)) {
    return ["the saved layout is not a list of positions"];
  }

  const known = new Set(tableNames);

  return entries
    .filter((entry) => !known.has((entry as { name?: string })?.name ?? ""))
    .map(
      (entry) =>
        `the saved layout holds a position for a table that is not in the model: ${
          (entry as { name?: string })?.name ?? "(unnamed)"
        }`,
    );
};
