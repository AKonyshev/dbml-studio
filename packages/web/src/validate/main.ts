/**
 * The validator as a program: standard input in, standard output out, and
 * nothing else.
 *
 * Thin on purpose. Everything worth getting wrong is in `runValidation`, which
 * is a pure function under this package's own test suite; this file exists
 * because the documentation plugin is written in Python and cannot call it.
 */
import { runValidation, type ValidationJob } from "./runValidation";

const read = async (): Promise<string> => {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
};

const main = async (): Promise<void> => {
  const job = JSON.parse(await read()) as ValidationJob;

  process.stdout.write(JSON.stringify(runValidation(job)));
};

// A validator that cannot run says so on standard error and exits non-zero: the
// caller reports "the models were not checked", which is a different thing from
// "the models are fine".
main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
