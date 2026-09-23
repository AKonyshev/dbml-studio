import { runValidation } from "../runValidation";

const ACL = `
Table "acl"."analysis" {
  id integer [pk]
}

Table "acl"."analysis_liquid" {
  id integer [pk]
  analysis_id integer
}

Ref: "acl"."analysis"."id" < "acl"."analysis_liquid"."analysis_id"
`;

// Two schemas holding a table of the same name: the short form cannot answer
// for it, and the frame refuses rather than guessing.
const TWO_SCHEMAS = `
Table "a"."thing" {
  id integer [pk]
}

Table "b"."thing" {
  id integer [pk]
}
`;

describe("runValidation", () => {
  it("finds nothing wrong with a model a page can draw", () => {
    expect(
      runValidation({
        blocks: [
          {
            id: "docs/a.md:1",
            model: "acl.dbml",
            text: ACL,
            tables: ["analysis"],
          },
          { id: "docs/a.md:9", model: "acl.dbml", text: ACL, tables: null },
        ],
      }),
    ).toEqual({ findings: [] });
  });

  it("names a table the model does not hold, and the block that asked", () => {
    expect(
      runValidation({
        blocks: [
          {
            id: "docs/a.md:4",
            model: "acl.dbml",
            text: ACL,
            tables: ["analisys"],
          },
        ],
      }),
    ).toEqual({
      findings: [
        {
          id: "docs/a.md:4",
          model: "acl.dbml",
          problem: "Table not found: analisys",
        },
      ],
    });
  });

  it("names a short name two schemas answer to", () => {
    const { findings } = runValidation({
      blocks: [
        {
          id: "docs/a.md:4",
          model: "two.dbml",
          text: TWO_SCHEMAS,
          tables: ["thing"],
        },
      ],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].problem).toContain("thing");
  });

  it("reports a model that will not parse", () => {
    const { findings } = runValidation({
      blocks: [
        {
          id: "docs/a.md:4",
          model: "broken.dbml",
          text: "Table {",
          tables: null,
        },
      ],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe("docs/a.md:4");
  });

  it("reports a broken layout even when the diagram would draw", () => {
    const { findings } = runValidation({
      blocks: [
        {
          id: "docs/a.md:4",
          model: "acl.dbml",
          text: `${ACL}\n/*MetaInfo\n[oops]\nMetaInfo*/\n`,
          tables: null,
        },
      ],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].problem).toContain("layout");
  });

  // A block that will not parse must not leave anything behind for the block
  // that runs after it: each call to `parseDbmlText` gets its own DBML parser
  // state, but a validator that shared a single instance across blocks could
  // easily fail this one instead.
  it("does not let a broken block spoil the one after it", () => {
    const { findings } = runValidation({
      blocks: [
        {
          id: "docs/a.md:1",
          model: "broken.dbml",
          text: "Table {",
          tables: null,
        },
        { id: "docs/a.md:2", model: "acl.dbml", text: ACL, tables: null },
      ],
    });

    expect(findings).toEqual([expect.objectContaining({ id: "docs/a.md:1" })]);
  });

  // One block per finding, and a page full of frames reporting all of them: an
  // author fixing one at a time would run the build once per mistake.
  it("reports every block, not the first one that failed", () => {
    const { findings } = runValidation({
      blocks: [
        { id: "docs/a.md:1", model: "acl.dbml", text: ACL, tables: ["nope"] },
        {
          id: "docs/b.md:1",
          model: "acl.dbml",
          text: ACL,
          tables: ["also_nope"],
        },
      ],
    });

    expect(findings.map((finding) => finding.id)).toEqual([
      "docs/a.md:1",
      "docs/b.md:1",
    ]);
  });
});
