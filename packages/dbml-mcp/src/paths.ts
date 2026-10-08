import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { ToolError } from "./errors";

const isInside = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};

// The deepest part of the path that exists is resolved through realpath, so a
// symlink anywhere along it is followed before the containment check; the part
// that does not exist yet cannot be a symlink.
async function realpathOfDeepestExisting(target: string): Promise<string> {
  const missing: string[] = [];
  let current = target;
  for (;;) {
    try {
      return path.join(await realpath(current), ...missing.reverse());
    } catch {
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
  const realRoot = await realpath(root);
  const resolved = await realpathOfDeepestExisting(
    path.resolve(realRoot, relative),
  );
  if (!isInside(realRoot, resolved)) {
    throw new ToolError(
      "PATH_OUTSIDE_ROOT",
      `${relative} is outside the working folder.`,
    );
  }
  return resolved;
}

export async function readSource(
  root: string | undefined,
  input: { text?: string; path?: string },
): Promise<string> {
  if (input.text !== undefined && input.path !== undefined) {
    throw new ToolError(
      "INVALID_INPUT",
      "Give exactly one of `text` and `path`.",
    );
  }
  if (input.text !== undefined) {
    return input.text;
  }
  if (input.path === undefined) {
    throw new ToolError(
      "INVALID_INPUT",
      "Give exactly one of `text` and `path`.",
    );
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
