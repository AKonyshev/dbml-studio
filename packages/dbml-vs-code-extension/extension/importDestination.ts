import { Uri, l10n, window, workspace } from "vscode";

import type { ImportTarget } from "./pickImportTargets";

// What a filesystem refuses, plus the separators: PostgreSQL quotes any
// identifier, so `../secrets` is a legal database name, and `Uri.joinPath`
// resolves the `..` away rather than keeping it — an unsanitized name writes
// outside the folder the user chose. Everything else survives, because a
// name outside ASCII is a perfectly good file name.
// eslint-disable-next-line no-control-regex -- control characters are what this range is for
const REFUSED = /[/\\:*?"<>|\u0000-\u001f]/g;
// Names Windows still reserves for devices, with or without an extension.
const DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function fileStem(name: string): string {
  const cleaned = name
    .replace(REFUSED, "_")
    // Leading dots hide the file; trailing dots and spaces are dropped by
    // Windows, which would silently merge two names into one.
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "")
    .slice(0, 64);
  if (cleaned === "") {
    return "database";
  }
  return DEVICE.test(cleaned) ? `${cleaned}_` : cleaned;
}

// A single file is named after what is in it — which, for one schema, is the
// schema, the name this command has always produced. Several files are named
// after their databases: two databases each holding a lone `public` would
// otherwise write the same file twice.
export function importFileName(
  target: ImportTarget,
  isOnlyTarget: boolean,
): string {
  const name =
    isOnlyTarget && target.schemaNames.length === 1
      ? target.schemaNames[0]
      : target.databaseName;
  return `${fileStem(name)}.dbml`;
}

// Sanitizing collapses names that were distinct — `a/b` and `a_b` both become
// `a_b` — and a case-insensitive filesystem collapses more. Two databases must
// never write the same file, so the later one is numbered.
function distinctFileNames(targets: ImportTarget[]): string[] {
  const taken = new Set<string>();
  return targets.map((target) => {
    const base = importFileName(target, false);
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n += 1) {
      name = base.replace(/\.dbml$/, `-${n}.dbml`);
    }
    taken.add(name.toLowerCase());
    return name;
  });
}

async function exists(uri: Uri): Promise<boolean> {
  try {
    await workspace.fs.stat(uri);
    return true;
  } catch {
    // `stat` throws FileNotFound for the ordinary case, which is not an error
    // here — it is the answer.
    return false;
  }
}

export async function resolveImportDestination(
  targets: ImportTarget[],
): Promise<Map<string, Uri> | undefined> {
  const folder = workspace.workspaceFolders?.[0]?.uri;

  if (targets.length === 1) {
    const name = importFileName(targets[0], true);
    const target = await window.showSaveDialog({
      defaultUri: folder != null ? Uri.joinPath(folder, name) : undefined,
      filters: { DBML: ["dbml"] },
      saveLabel: l10n.t("Save DBML"),
    });
    // The save dialog does its own overwrite confirmation.
    return target === undefined
      ? undefined
      : new Map([[targets[0].databaseName, target]]);
  }

  const picked = await window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    defaultUri: folder,
    openLabel: l10n.t("Select folder"),
  });
  const directory = picked?.[0];
  if (directory === undefined) {
    return undefined;
  }

  const fileNames = distinctFileNames(targets);
  const planned = targets.map((target, index) => {
    const fileName = fileNames[index];
    return {
      databaseName: target.databaseName,
      fileName,
      uri: Uri.joinPath(directory, fileName),
    };
  });

  const present = (
    await Promise.all(
      planned.map(async (file) =>
        (await exists(file.uri)) ? file.fileName : undefined,
      ),
    )
  ).filter((name): name is string => name !== undefined);

  if (present.length > 0) {
    // One binding for the button label and the comparison: localizing only the
    // label would make the confirmation never match.
    const overwrite = l10n.t("Overwrite");
    const confirm = await window.showWarningMessage(
      l10n.t(
        "These files already exist and will be replaced: {0}",
        present.join(", "),
      ),
      { modal: true },
      overwrite,
    );
    if (confirm !== overwrite) {
      return undefined;
    }
  }

  return new Map(planned.map((file) => [file.databaseName, file.uri]));
}
