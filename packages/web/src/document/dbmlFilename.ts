export const DBML_EXTENSION = ".dbml";

// What a document is called when it has never been named — a first visit, or a
// title the reader has blanked. One constant rather than a literal at the call
// site, so the answer to "what will this download be called?" has one home.
const DEFAULT_BASE = "schema";

// The union of what the three major filesystems reject, which in practice means
// Windows' list: it is the strictest, so satisfying it satisfies macOS and Linux
// too. The control range is in there because a newline pasted into a title would
// otherwise reach the `download` attribute intact.
//
// The suppression is the point rather than an escape from it: `no-control-regex`
// exists to catch a control character nobody meant to type, and this range is
// written out deliberately, in escapes, with a test at each end of it.
// eslint-disable-next-line no-control-regex -- control characters are what this range is for
const ILLEGAL_IN_FILENAME = /[<>:"/\\|?*\u0000-\u001F]/g;

// Not dropped. Dropping would map `a/b` and `ab` onto one filename, and a
// download that silently overwrites an earlier one is a worse outcome than a
// name with a dash in it.
const REPLACEMENT = "-";

// Leading and trailing dots and spaces: a name beginning with a dot is hidden on
// Unix, and Windows silently strips a trailing one, so a file saved as `orders.`
// comes back as `orders` and no longer matches what the site thinks it is called.
const DECORATIVE_EDGES = /^[.\s]+|[.\s]+$/g;

const withoutExtension = (title: string): string =>
  title.toLowerCase().endsWith(DBML_EXTENSION)
    ? title.slice(0, -DBML_EXTENSION.length)
    : title;

/**
 * The filename a download gets, derived from what the document is called.
 *
 * Pure on purpose: this is the one piece of the open/save path that can be
 * tested without a browser, and it is also the piece most likely to be wrong,
 * since every rule in it comes from a filesystem rather than from the schema.
 */
export const toDbmlFilename = (title: string): string => {
  const base = withoutExtension(title.trim())
    .replace(ILLEGAL_IN_FILENAME, REPLACEMENT)
    .replace(DECORATIVE_EDGES, "");

  return `${base === "" ? DEFAULT_BASE : base}${DBML_EXTENSION}`;
};
