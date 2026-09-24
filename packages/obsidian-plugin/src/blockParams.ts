/** Which of the two the diagram is drawn in. */
export type FrameTheme = "light" | "dark";

export interface BlockParams {
  model: string;
  /** Names to keep, or `null` for the whole model. Never an empty array. */
  tables: string[] | null;
  height: number;
  /** `null`: follow the application's theme, and keep following it. */
  theme: FrameTheme | null;
}

/**
 * The first thing wrong with a block that is ours, by the same rules the
 * MkDocs plugin's YAML load enforces (`packages/mkdocs-dbml/src/mkdocs_dbml/block.py`):
 * - `modelMissing` — no `model:` value, or a blank one.
 * - `modelNotAPath` — `model:` given a list or a mapping instead of a path.
 * - `unknownKey` — a key that is not `model`, `tables`, `height` or `theme`
 *   (lower-case only, as YAML reads keys).
 * - `duplicateKey` — the same key given twice; nobody can say which was meant.
 * - `malformedLine` — a line that is not `key: value`.
 * - `heightInvalid` — not a whole number of pixels above zero.
 * - `themeInvalid` — not `light` or `dark`.
 * - `tablesInvalid` — a mapping, a list opened but never closed, or a name
 *   YAML would read as a number rather than text.
 */
export type BlockError =
  | { kind: "modelMissing" }
  | { kind: "modelNotAPath"; value: string }
  | { kind: "unknownKey"; key: string }
  | { kind: "duplicateKey"; key: string }
  | { kind: "malformedLine"; line: string }
  | { kind: "heightInvalid"; value: string }
  | { kind: "themeInvalid"; value: string }
  | { kind: "tablesInvalid"; value: string };

export type BlockParamsResult =
  | { ok: true; params: BlockParams }
  | { ok: false; error: BlockError };

/** The same default Antora and the MkDocs plugin use, so a page and a note agree. */
const DEFAULT_HEIGHT = 500;

const BLOCK_KEYS = ["model", "tables", "height", "theme"] as const;

type BlockKey = (typeof BLOCK_KEYS)[number];

const isBlockKey = (key: string): key is BlockKey =>
  (BLOCK_KEYS as readonly string[]).includes(key);

const isFrameTheme = (value: string): value is FrameTheme =>
  value === "light" || value === "dark";

/**
 * Which ```dbml blocks are diagrams, by the rule the MkDocs plugin keeps
 * (`packages/mkdocs-dbml/src/mkdocs_dbml/block.py`): a line that starts with
 * `model:`, and a block that opens — past blank lines and `#` comments — with
 * one of the four keys. DBML has no such top-level line, so a block of DBML
 * code stays code, even when a multi-line note inside it has a line that
 * starts with `model:`. One rule for both hosts, or the same block is a diagram
 * in a note and code on a page.
 */
const MODEL_LINE = /^model\s*:/m;
const OPENS_WITH_KEY = new RegExp(`^(?:${BLOCK_KEYS.join("|")})\\s*:`);

/** A blank line or a `#` comment: lines the block's reader steps over. */
const isSkipped = (line: string): boolean =>
  line === "" || line.startsWith("#");

/** Trimmed, which also takes the `\r` of a note saved with Windows line endings. */
const linesOf = (source: string): string[] =>
  source.split("\n").map((line) => line.trim());

const isOurs = (source: string): boolean => {
  if (!MODEL_LINE.test(source)) {
    return false;
  }

  const first = linesOf(source).find((line) => !isSkipped(line));

  return first !== undefined && OPENS_WITH_KEY.test(first);
};

/** Pixels, and nothing a hand might mean as something else: no fraction, no sign. */
const WHOLE_NUMBER = /^\d+$/;

/** What YAML would read back as a number, not text — `1`, `-2`, `1.5`. */
const BARE_NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * `undefined` marks a value the MkDocs plugin's YAML load also refuses: a
 * mapping (`{a: b}`), a list opened but never closed (`[x`), or a name YAML
 * would read as a number rather than text (`[1, 2]`).
 */
const parseTables = (value: string): string[] | null | undefined => {
  if (value.startsWith("{")) {
    return undefined;
  }

  // `[a, b]` is what a hand used to YAML writes, and the MkDocs plugin takes it.
  const isList = value.startsWith("[");

  if (isList && !value.endsWith("]")) {
    return undefined;
  }

  const list = isList ? value.slice(1, -1) : value;
  const names = list
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");

  if (names.some((name) => BARE_NUMBER.test(name))) {
    return undefined;
  }

  return names.length === 0 ? null : names;
};

/**
 * A block's body, read: `null` when the block is not a diagram at all, and
 * otherwise its parameters or the first thing wrong with them.
 */
export const parseBlockParams = (source: string): BlockParamsResult | null => {
  if (!isOurs(source)) {
    return null;
  }

  const values = new Map<BlockKey, string>();

  for (const line of linesOf(source)) {
    if (isSkipped(line)) {
      continue;
    }

    const separator = line.indexOf(":");

    if (separator === -1) {
      return { ok: false, error: { kind: "malformedLine", line } };
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();

    if (!isBlockKey(key)) {
      return { ok: false, error: { kind: "unknownKey", key } };
    }

    if (values.has(key)) {
      return { ok: false, error: { kind: "duplicateKey", key } };
    }

    values.set(key, value);
  }

  const model = values.get("model") ?? "";

  if (model === "") {
    return { ok: false, error: { kind: "modelMissing" } };
  }

  if (model.startsWith("[") || model.startsWith("{")) {
    return { ok: false, error: { kind: "modelNotAPath", value: model } };
  }

  const rawHeight = values.get("height");
  let height = DEFAULT_HEIGHT;

  if (rawHeight !== undefined) {
    if (!WHOLE_NUMBER.test(rawHeight) || Number(rawHeight) === 0) {
      return { ok: false, error: { kind: "heightInvalid", value: rawHeight } };
    }

    height = Number(rawHeight);
  }

  const rawTheme = values.get("theme");
  let theme: FrameTheme | null = null;

  if (rawTheme !== undefined) {
    if (!isFrameTheme(rawTheme)) {
      return { ok: false, error: { kind: "themeInvalid", value: rawTheme } };
    }

    theme = rawTheme;
  }

  const rawTables = values.get("tables");
  let tables: string[] | null = null;

  if (rawTables !== undefined) {
    const parsed = parseTables(rawTables);

    if (parsed === undefined) {
      return { ok: false, error: { kind: "tablesInvalid", value: rawTables } };
    }

    tables = parsed;
  }

  return {
    ok: true,
    params: {
      model,
      tables,
      height,
      theme,
    },
  };
};
