import { realpathSync } from "node:fs";
import path from "node:path";

const realOrResolved = (p: string): string => {
  try {
    return realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
};

// The working folder is every file a tool may read or write, so it comes only
// from a choice: `--root <dir>`, or the folder the client started the server
// in. Clients that have no project to start in use the filesystem root or the
// home folder, and neither is a choice anybody made — the server then has no
// working folder and refuses path arguments (NO_ROOT). `--no-root` says so
// outright, and wins over `--root`; a `--root` without a folder after it fails
// the same way rather than falling back to the start folder.
export function rootFromArgs(
  argv: string[],
  cwd: string,
  home: string,
  real: (p: string) => string = realOrResolved,
): string | undefined {
  if (argv.includes("--no-root")) return undefined;
  const at = argv.indexOf("--root");
  if (at >= 0) {
    const value = argv[at + 1];
    if (value === undefined || value.trim() === "" || value.startsWith("--")) {
      return undefined;
    }
    return path.resolve(cwd, value);
  }
  const start = real(cwd);
  if (path.parse(start).root === start || start === real(home)) {
    return undefined;
  }
  return cwd;
}
