import { spawnSync } from "node:child_process";

/** One block as drawn, remembered for the check after every page is done. */
export interface CollectedBlock {
  /** `<page id>#<index>`; the validator hands it back untouched. */
  id: string;
  page: string;
  /** 1-based, in the page's order. */
  index: number;
  /** The model's path inside the models folder, for the report. */
  model: string;
  text: string;
  tables: string[] | null;
}

export interface Finding {
  id: string;
  model: string;
  problem: string;
}

const isFinding = (value: unknown): value is Finding =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Finding).id === "string" &&
  typeof (value as Finding).model === "string" &&
  typeof (value as Finding).problem === "string";

/**
 * Runs `validate.mjs` (packages/web/README.md, "The validator's contract")
 * with the Node that runs Antora. A non-zero exit or an answer in another
 * shape throws: the models were not checked, which is not the same as fine.
 */
export const runValidator = (
  validatorPath: string,
  blocks: CollectedBlock[],
): Finding[] => {
  const job = {
    blocks: blocks.map(({ id, model, text, tables }) => ({
      id,
      model,
      text,
      tables,
    })),
  };
  const result = spawnSync(process.execPath, [validatorPath], {
    input: JSON.stringify(job),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error !== undefined || result.status !== 0) {
    // stderr is null when the spawn itself failed.
    const said =
      result.error === undefined ? (result.stderr?.trim() ?? "") : "";
    const reason =
      result.error?.message ??
      (said === "" ? `exit code ${String(result.status)}` : said);
    throw new Error(
      `antora-dbml: the model validator could not run: ${reason}`,
    );
  }

  let answer: unknown;
  try {
    answer = JSON.parse(result.stdout);
  } catch {
    answer = null;
  }
  const findings = (answer as { findings?: unknown } | null)?.findings;
  if (!Array.isArray(findings) || !findings.every(isFinding)) {
    throw new Error(
      "antora-dbml: the model validator answered in a shape it does not use",
    );
  }
  return findings;
};

export const findingMessage = (
  block: CollectedBlock,
  finding: Finding,
): string => `${block.page}, block ${block.index}: ${finding.problem}`;
