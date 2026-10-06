import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  findingMessage,
  runValidator,
  type CollectedBlock,
} from "../validation";

let dir = "";

const validator = (source: string): string => {
  const file = path.join(dir, "validate.mjs");
  writeFileSync(file, source);
  return file;
};

const BLOCK: CollectedBlock = {
  id: "docs:ROOT:a.adoc#1",
  page: "docs:ROOT:a.adoc",
  index: 1,
  model: "acl.dbml",
  text: "Table a { id int }",
  tables: ["a"],
};

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "antora-dbml-validate-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("runValidator", () => {
  it("sends the blocks by the contract and returns the findings", () => {
    // Echoes back what it was sent, so the test sees the job as it left.
    const file = validator(`
      let input = "";
      process.stdin.on("data", (c) => (input += c));
      process.stdin.on("end", () => {
        const { blocks } = JSON.parse(input);
        process.stdout.write(JSON.stringify({
          findings: blocks.map((b) => ({ id: b.id, model: b.model, problem: JSON.stringify(b) })),
        }));
      });
    `);

    const [finding] = runValidator(file, [BLOCK]);

    expect(finding.id).toBe(BLOCK.id);
    expect(JSON.parse(finding.problem)).toEqual({
      id: BLOCK.id,
      model: "acl.dbml",
      text: BLOCK.text,
      tables: ["a"],
    });
  });

  it("returns no findings when every block checks out", () => {
    const file = validator(
      `process.stdin.resume(); process.stdin.on("end", () => process.stdout.write('{"findings":[]}'));`,
    );

    expect(runValidator(file, [BLOCK])).toEqual([]);
  });

  // A validator that did not run is not a validator that found nothing.
  it("throws when the validator exits non-zero, with what it said", () => {
    const file = validator(`console.error("boom"); process.exit(3);`);

    expect(() => runValidator(file, [BLOCK])).toThrow(/boom/);
  });

  it("throws on an answer in another shape", () => {
    const file = validator(
      `process.stdin.resume(); process.stdin.on("end", () => process.stdout.write("ok"));`,
    );

    expect(() => runValidator(file, [BLOCK])).toThrow(/validator/);
  });
});

describe("findingMessage", () => {
  it("names the page and the block", () => {
    expect(
      findingMessage(BLOCK, {
        id: BLOCK.id,
        model: "acl.dbml",
        problem: "no table x",
      }),
    ).toBe("docs:ROOT:a.adoc, block 1: no table x");
  });
});
