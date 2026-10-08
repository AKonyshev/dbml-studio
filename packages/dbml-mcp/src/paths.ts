import {
  lstat,
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { ToolError } from "./errors";

const isInside = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(".." + path.sep) &&
      !path.isAbsolute(relative))
  );
};

// The deepest part of the path that exists is resolved through realpath, so a
// symlink anywhere along it is followed before the containment check; the part
// that does not exist yet cannot be a symlink. Dangling symlinks, loops, and
// other unresolvable paths are caught here and rejected before the containment check.
async function realpathOfDeepestExisting(
  target: string,
  relative: string,
): Promise<string> {
  const missing: string[] = [];
  let current = target;
  for (;;) {
    try {
      const resolved = await realpath(current);
      const result = path.join(resolved, ...missing.reverse());
      return result;
    } catch (_realpathErr) {
      // realpath failed. Check if the entry exists but cannot be resolved.
      let entryIsUnresolvable = false;
      try {
        await lstat(current);
        // lstat succeeded: entry exists but cannot be resolved (dangling link, loop, etc.)
        entryIsUnresolvable = true;
      } catch (lstatError) {
        // lstat failed. Check if it's ENOENT (entry truly doesn't exist).
        const err = lstatError as NodeJS.ErrnoException;
        if (err?.code !== "ENOENT") {
          // Some other error, treat as unresolvable (fail closed)
          entryIsUnresolvable = true;
        }
        // If code is ENOENT, entry doesn't exist, continue climbing
      }

      if (entryIsUnresolvable) {
        // Entry exists but cannot be resolved (dangling link, loop, etc.)
        throw new ToolError(
          "PATH_OUTSIDE_ROOT",
          `${relative} is outside the working folder.`,
        );
      }

      // Entry doesn't exist, climb to parent
      const parent = path.dirname(current);
      if (parent === current) return target;
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

export async function resolveInsideRoot(
  root: string | undefined,
  relative: string,
): Promise<string> {
  if (root === undefined) {
    throw new ToolError(
      "NO_ROOT",
      "This server has no working folder, so it cannot read or write files; pass the content as text.",
    );
  }
  let realRoot: string;
  try {
    realRoot = await realpath(root);
  } catch {
    throw new ToolError(
      "NO_ROOT",
      "The working folder does not exist or cannot be read; pass the content as text.",
    );
  }
  const resolved = await realpathOfDeepestExisting(
    path.resolve(realRoot, relative),
    relative,
  );
  if (!isInside(realRoot, resolved)) {
    throw new ToolError(
      "PATH_OUTSIDE_ROOT",
      `${relative} is outside the working folder.`,
    );
  }
  return resolved;
}

const invalidInputError = new ToolError(
  "INVALID_INPUT",
  "Give exactly one of `text` and `path`.",
);

export async function readSource(
  root: string | undefined,
  input: { text?: string; path?: string },
): Promise<string> {
  if (input.text !== undefined && input.path !== undefined) {
    throw invalidInputError;
  }
  if (input.text !== undefined) {
    return input.text;
  }
  if (input.path === undefined) {
    throw invalidInputError;
  }
  const file = await resolveInsideRoot(root, input.path);
  try {
    return await readFile(file, "utf8");
  } catch {
    throw new ToolError(
      "FILE_NOT_FOUND",
      `${input.path} does not exist or cannot be read.`,
    );
  }
}

export async function writeOutput(
  root: string | undefined,
  outputPath: string,
  content: string,
  overwrite: boolean,
): Promise<string> {
  const file = await resolveInsideRoot(root, outputPath);
  const exists = await stat(file).then(
    () => true,
    () => false,
  );
  if (exists && !overwrite) {
    throw new ToolError(
      "FILE_EXISTS",
      `${outputPath} exists; pass overwrite: true to replace it.`,
    );
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
  return file;
}
