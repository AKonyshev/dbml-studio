import { embedErrorText } from "../embed/embedError";
import { filterSchema } from "../embed/filterSchema";
import { parseDbmlText } from "../document/parseDbmlText";

import { layoutProblems } from "./layout";

/** One `dbml` block, as the documentation plugin found it. */
export interface ValidationBlock {
  /** Whatever the plugin wants printed with the finding; not read here. */
  id: string;
  /** The model as the page named it, for the report only. */
  model: string;
  text: string;
  tables: string[] | null;
}

export interface ValidationJob {
  blocks: ValidationBlock[];
}

export interface Finding {
  id: string;
  model: string;
  problem: string;
}

export interface ValidationReport {
  findings: Finding[];
}

/**
 * What the frame would make of every block on a site, at build time.
 *
 * Every rule but one is a rule the frame already applies, and applies through
 * this same code: `parseDbmlText` for the model, `filterSchema` for the names a
 * page asked for, and their own words for the answer. That is the point — a
 * build that passes and a page that then shows a message instead of a diagram
 * is the failure this exists to prevent, and two implementations of the same
 * rule would produce it.
 *
 * The exception is `layoutProblems`, which reports what the frame accepts in
 * silence.
 */
export const runValidation = (job: ValidationJob): ValidationReport => {
  const findings: Finding[] = [];

  const say = (block: ValidationBlock, problem: string): void => {
    findings.push({ id: block.id, model: block.model, problem });
  };

  for (const block of job.blocks) {
    const parsed = parseDbmlText(block.text);

    if (parsed.schema === null) {
      say(block, parsed.errorMessage ?? "the model could not be parsed");
      continue;
    }

    const filtered = filterSchema(parsed.schema, block.tables);

    if (!filtered.ok) {
      say(block, embedErrorText(filtered.error));
      continue;
    }

    for (const problem of layoutProblems(
      block.text,
      parsed.schema.tables.map((table) => table.name),
    )) {
      say(block, problem);
    }
  }

  return { findings };
};
