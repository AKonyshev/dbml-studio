import * as fs from "fs";
import * as path from "path";

import { buildSourceIndex, findTable } from "./sourceIndex";
import { planEdit, readFieldText } from "./planEdit";

import type { EditOperation } from "shared/types/diagramEdit";

/**
 * Every operation, run against a real schema rather than a fixture written to
 * suit the code.
 *
 * `realistic.dbml` is an anonymised copy of a schema this feature was first
 * broken on. Names and note texts are replaced; everything that decides
 * behaviour is kept exactly: eighteen tables whose names are one quoted string
 * carrying the schema (`Table "sch.entity_01"`), quoted column names, eleven
 * named refs written as `"sch.a"."col" < "sch.b"."col"`, index blocks — one of
 * which names a column that is never declared — table-level notes, backtick
 * defaults, and two columns whose note runs across two lines.
 *
 * Two defects survived a green suite, a review and an end-to-end test, and both
 * are here because a hand-written fixture had neither shape: the whole file was
 * uneditable because one index named a missing column, and no ref could be
 * found because every one of them quotes the table name.
 */
const SCHEMA = fs.readFileSync(
  path.join(__dirname, "__fixtures__", "realistic.dbml"),
  "utf8",
);

const TABLE = "sch.entity_01";

const apply = (operation: EditOperation, expected?: string): string => {
  const plan = planEdit(SCHEMA, operation, expected);
  if (!plan.ok) {
    throw new Error(
      `rejected: ${plan.reason.code} ${"message" in plan.reason ? plan.reason.message : ""}`,
    );
  }

  return plan.nextText;
};

/**
 * Where a column stands in its table.
 *
 * An edit names a column by position, and a test that says `at(TABLE,
 * "col_005")` still reads as the column it is about — a bare 4 would not, and
 * would go stale the moment the fixture gains a line.
 */
const at = (table: string, name: string): number => {
  const found = findTable(buildSourceIndex(SCHEMA), table);
  const position = found?.fields.findIndex((field) => field.name === name);
  if (position === undefined || position === -1) {
    throw new Error(`the fixture has no ${table}.${name}`);
  }

  return position;
};

describe("a real schema", () => {
  it("is indexed whole, despite an index naming a column that is not declared", () => {
    const index = buildSourceIndex(SCHEMA);

    expect(index.tables).toHaveLength(18);
    expect(findTable(index, TABLE)?.fields.length).toBeGreaterThan(20);
  });

  it("names its tables the way the diagram does", () => {
    const index = buildSourceIndex(SCHEMA);

    // The whole qualified name is one quoted identifier, so the parser reports
    // no schema of its own and the dot belongs to the name.
    const table = findTable(index, TABLE);
    expect(table?.declaredName).toBe(TABLE);
    expect(table?.schemaName).toBeNull();
    expect(table?.nameRange.quoted).toBe(true);
  });
});

describe("reading a column", () => {
  it("gives back the line as it stands in the file", () => {
    expect(readFieldText(SCHEMA, TABLE, at(TABLE, "col_002"))).toBe(
      `"col_002" uuid [not null, note: 'Description 2']`,
    );
  });

  it("gives back every line of a column whose note wraps", () => {
    const text = readFieldText(
      SCHEMA,
      "sch.entity_12",
      at("sch.entity_12", "col_165"),
    );

    expect(text).toBe(
      `"col_165" numeric [note: 'Description 300, first line\nand its second line']`,
    );
  });
});

describe("editing a column", () => {
  it("replaces one line and leaves the file otherwise identical", () => {
    const next = apply(
      {
        kind: "replaceField",
        table: TABLE,
        at: at(TABLE, "col_005"),
        text: `"col_005" numeric [not null, note: 'Description 5']`,
      },
      `"col_005" numeric [note: 'Description 5']`,
    );

    expect(next).toContain(
      `  "col_005" numeric [not null, note: 'Description 5']`,
    );
    expect(next.split("\n")).toHaveLength(SCHEMA.split("\n").length);
    // Character for character the original, apart from the one line asked for.
    expect(
      next.replace(
        `[not null, note: 'Description 5']`,
        `[note: 'Description 5']`,
      ),
    ).toBe(SCHEMA);
  });

  it("renames a column and reports where it now stands", () => {
    const plan = planEdit(SCHEMA, {
      kind: "replaceField",
      table: TABLE,
      at: at(TABLE, "col_005"),
      text: `"col_005_renamed" numeric`,
    });
    if (!plan.ok) throw new Error(plan.reason.code);

    expect(plan.at).toBe(at(TABLE, "col_005"));
  });

  it("rewrites a column whose note runs across two lines", () => {
    const next = apply({
      kind: "replaceField",
      table: "sch.entity_12",
      at: at("sch.entity_12", "col_165"),
      text: `"col_165" numeric [note: 'One line now']`,
    });

    expect(next).toContain(`  "col_165" numeric [note: 'One line now']`);
    // The two lines it occupied are gone, and nothing else moved.
    expect(next.split("\n")).toHaveLength(SCHEMA.split("\n").length - 1);
  });

  it("refuses text that does not parse, naming what is wrong", () => {
    const plan = planEdit(SCHEMA, {
      kind: "replaceField",
      table: TABLE,
      at: at(TABLE, "col_005"),
      text: `"col_005" numeric [[[`,
    });

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason.code).toBe("parseError");
  });

  it("refuses an edit aimed at text that has since changed", () => {
    expect(
      planEdit(
        SCHEMA,
        {
          kind: "replaceField",
          table: TABLE,
          at: at(TABLE, "col_005"),
          text: `"col_005" text`,
        },
        `"col_005" numeric [note: 'something else']`,
      ),
    ).toEqual({ ok: false, reason: { code: "staleText" } });
  });
});

describe("adding and removing columns", () => {
  it("adds a column below another, at the file's indentation", () => {
    const next = apply({
      kind: "insertFieldAfter",
      table: TABLE,
      at: at(TABLE, "col_005"),
      text: `"col_new" numeric [note: 'Added']`,
    });

    expect(next).toContain(
      `  "col_005" numeric [note: 'Description 5']\n  "col_new" numeric [note: 'Added']\n`,
    );
    expect(next.split("\n")).toHaveLength(SCHEMA.split("\n").length + 1);
  });

  it("deletes a column and leaves no blank line behind", () => {
    const next = apply({
      kind: "deleteField",
      table: TABLE,
      at: at(TABLE, "col_005"),
    });

    expect(next).not.toContain(`"col_005"`);
    expect(next).toContain(
      `  "col_004" timestamp [not null, note: 'Description 4']\n  "col_006"`,
    );
    expect(next.split("\n")).toHaveLength(SCHEMA.split("\n").length - 1);
  });

  it("refuses to delete a column a relation depends on", () => {
    const plan = planEdit(SCHEMA, {
      kind: "deleteField",
      table: TABLE,
      at: at(TABLE, "col_001"),
    });

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason.code).toBe("parseError");
  });

  it("moves a column past its neighbour, both ways", () => {
    const up = apply({
      kind: "moveField",
      table: TABLE,
      at: at(TABLE, "col_006"),
      direction: "up",
    });

    expect(up).toContain(
      `  "col_006" numeric [note: 'Description 6']\n  "col_005" numeric [note: 'Description 5']\n`,
    );

    const down = apply({
      kind: "moveField",
      table: TABLE,
      at: at(TABLE, "col_005"),
      direction: "down",
    });

    expect(down).toBe(up);
  });
});

describe("renaming a table", () => {
  // The table the eleven refs point at, so the cascade is exercised rather
  // than assumed.
  const REFERENCED = "sch.entity_11";

  it("finds every ref that names it, quotes and all", () => {
    const table = findTable(buildSourceIndex(SCHEMA), REFERENCED);

    expect(table?.refNameRanges.length).toBeGreaterThan(0);
    for (const occurrence of table?.refNameRanges ?? []) {
      expect(occurrence.quoted).toBe(true);
      expect(SCHEMA.slice(occurrence.start, occurrence.end)).toBe(
        `"${REFERENCED}"`,
      );
    }
  });

  it("renames the header and every ref, keeping the quoting", () => {
    const plan = planEdit(SCHEMA, {
      kind: "renameTable",
      table: REFERENCED,
      newName: "sch.renamed_entity",
    });
    if (!plan.ok) throw new Error(plan.reason.code);

    expect(plan.table).toBe("sch.renamed_entity");
    expect(plan.nextText).toContain(`Table "sch.renamed_entity" {`);
    expect(plan.nextText).not.toContain(`"${REFERENCED}"`);
    expect(plan.nextText).toContain(`"sch.renamed_entity"."col_`);
  });

  it("leaves the renamed file parsing", () => {
    const plan = planEdit(SCHEMA, {
      kind: "renameTable",
      table: REFERENCED,
      newName: "sch.renamed_entity",
    });

    // `planEdit` only answers `ok` for a candidate it has parsed, so this is
    // the assertion: a rename that missed a ref would be refused here.
    expect(plan.ok).toBe(true);
  });

  it("refuses a name another table already uses", () => {
    expect(
      planEdit(SCHEMA, {
        kind: "renameTable",
        table: REFERENCED,
        newName: TABLE,
      }),
    ).toEqual({ ok: false, reason: { code: "nameTaken", name: TABLE } });
  });
});
