import {
  ExtensionContext,
  ProgressLocation,
  Uri,
  commands,
  l10n,
  window,
  workspace,
  type CancellationToken,
  type Progress,
} from "vscode";
import {
  DbImportError,
  DbImportErrorCode,
  fetchSchema,
  schemaToDbml,
  withDatabase,
} from "db-to-dbml";

import { saveConnection } from "./connectionStore";
import { dbImportErrorMessage } from "./dbImportErrorMessage";
import { resolveImportDestination } from "./importDestination";
import { pickDatabaseConnection } from "./pickDatabaseConnection";
import {
  pickImportTargets,
  type ImportPreselect,
  type ImportTarget,
} from "./pickImportTargets";

// Each database is its own failure domain, and reading it and saving it are two
// of them: a read-only folder is not a database error, and neither is worth
// abandoning the databases that did work.
type ImportOutcome =
  | {
      status: "ok";
      databaseName: string;
      uri: Uri;
      droppedCrossSchemaRefs: number;
    }
  | { status: "read-failed"; databaseName: string; error: DbImportError }
  | { status: "write-failed"; databaseName: string };

const asDbImportError = (error: unknown): DbImportError =>
  error instanceof DbImportError
    ? error
    : new DbImportError(DbImportErrorCode.UNKNOWN, "Unknown error");

// Functions, not constants: l10n.t must not run at module load, before the
// bundle is available.
const importFailed = (): string =>
  l10n.t("Failed to import the schema from the database.");

const saveFailed = (): string =>
  l10n.t("The schema was imported, but saving the DBML file failed.");

async function maybeSaveConnection(
  context: ExtensionContext,
  connectionString: string,
): Promise<void> {
  const save = await window.showQuickPick(["No", "Yes"], {
    placeHolder: l10n.t("Save this connection for next time?"),
  });
  if (save !== "Yes") {
    return;
  }

  const name = await window.showInputBox({
    prompt: l10n.t("Name for this connection"),
    ignoreFocusOut: true,
  });
  if (name != null && name !== "") {
    await saveConnection(context.secrets, name, connectionString);
  }
}

async function importOne(
  connectionString: string,
  target: ImportTarget,
  uri: Uri,
): Promise<ImportOutcome> {
  let dbml: string;
  let droppedCrossSchemaRefs: number;
  try {
    const db = await fetchSchema(
      withDatabase(connectionString, target.databaseName),
    );
    ({ dbml, droppedCrossSchemaRefs } = schemaToDbml(db, target.schemaNames));
  } catch (error) {
    console.error(
      "[dbml] importing a database failed",
      target.databaseName,
      error,
    );
    return {
      status: "read-failed",
      databaseName: target.databaseName,
      error: asDbImportError(error),
    };
  }

  // Written as soon as it is read: nothing accumulates in memory, and a run
  // stopped halfway leaves whole files rather than none.
  try {
    await workspace.fs.writeFile(uri, Buffer.from(dbml, "utf-8"));
  } catch (error) {
    console.error("[dbml] failed to save the imported DBML file", error);
    return { status: "write-failed", databaseName: target.databaseName };
  }

  return {
    status: "ok",
    databaseName: target.databaseName,
    uri,
    droppedCrossSchemaRefs,
  };
}

async function importEach(
  connectionString: string,
  targets: ImportTarget[],
  destinations: Map<string, Uri>,
  progress: Progress<{ message?: string; increment?: number }>,
  token: CancellationToken,
): Promise<{ outcomes: ImportOutcome[]; cancelled: boolean }> {
  const outcomes: ImportOutcome[] = [];
  const share = 100 / targets.length;

  for (const [index, target] of targets.entries()) {
    // A read inside @dbml/connector cannot be interrupted, so cancellation is
    // honoured between databases — and whatever was written stays written.
    if (token.isCancellationRequested) {
      return { outcomes, cancelled: true };
    }

    const uri = destinations.get(target.databaseName);
    if (uri === undefined) {
      continue;
    }

    progress.report({
      message: l10n.t(
        "Reading {0} ({1} of {2})…",
        target.databaseName,
        index + 1,
        targets.length,
      ),
    });

    outcomes.push(await importOne(connectionString, target, uri));

    // Reported once a database is done rather than when the next one starts, so
    // the bar reaches the end of the last one instead of stopping a share short.
    progress.report({ increment: share });
  }

  return { outcomes, cancelled: false };
}

const describeFailure = (outcome: ImportOutcome): string =>
  outcome.status === "read-failed"
    ? `${outcome.databaseName}: ${dbImportErrorMessage(
        outcome.error,
        importFailed(),
      )}`
    : `${outcome.databaseName}: ${saveFailed()}`;

async function openImported(uri: Uri): Promise<void> {
  // The file is already on disk, so a failure to open it is its own report.
  try {
    await window.showTextDocument(uri);
    await commands.executeCommand("dbmlStudio.previewDiagrams");
  } catch (error) {
    console.error("[dbml] failed to open the imported DBML file", error);
    void window.showErrorMessage(
      l10n.t("The DBML file was saved, but opening it or the diagram failed."),
    );
  }
}

async function reportOutcomes(
  outcomes: ImportOutcome[],
  planned: number,
  cancelled: boolean,
): Promise<void> {
  const written = outcomes.filter(
    (outcome): outcome is Extract<ImportOutcome, { status: "ok" }> =>
      outcome.status === "ok",
  );
  const failures = outcomes.filter((outcome) => outcome.status !== "ok");

  if (written.length === 0) {
    // An empty result with no failures is a run cancelled before the first
    // database: the user knows, and does not need telling.
    if (failures.length === 0) {
      return;
    }
    if (planned === 1) {
      const only = failures[0];
      void window.showErrorMessage(
        only.status === "read-failed"
          ? dbImportErrorMessage(only.error, importFailed())
          : saveFailed(),
      );
      return;
    }
    void window.showErrorMessage(
      l10n.t(
        "Imported none of the {0} databases. {1}",
        planned,
        failures.map(describeFailure).join(" "),
      ),
    );
    return;
  }

  if (failures.length > 0) {
    void window.showWarningMessage(
      l10n.t(
        "Imported {0} of {1} databases. {2}",
        written.length,
        planned,
        failures.map(describeFailure).join(" "),
      ),
    );
  }

  const dropped = written.reduce(
    (sum, outcome) => sum + outcome.droppedCrossSchemaRefs,
    0,
  );
  if (dropped > 0) {
    void window.showInformationMessage(
      l10n.t("{0} cross-schema reference(s) were omitted.", dropped),
    );
  }

  if (planned === 1 && written.length === 1) {
    await openImported(written[0].uri);
    return;
  }

  // A run stopped halfway wrote real files, but "Imported 2 DBML file(s)" reads
  // like the whole job — say how much of it was left.
  void window.showInformationMessage(
    cancelled
      ? l10n.t(
          "Cancelled after importing {0} of {1} databases.",
          written.length,
          planned,
        )
      : l10n.t("Imported {0} DBML file(s).", written.length),
  );
}

export async function importFromDatabase(
  context: ExtensionContext,
  preselect?: ImportPreselect,
): Promise<void> {
  let connectionString: string;
  let isNew = false;
  if (preselect !== undefined) {
    connectionString = preselect.connectionString;
  } else {
    const picked = await pickDatabaseConnection(context);
    if (picked === undefined) {
      return;
    }
    connectionString = picked.connectionString;
    isNew = picked.isNew;
  }

  let chosen: ImportTarget[] | undefined;
  try {
    chosen = await pickImportTargets({ ...preselect, connectionString });
  } catch (error) {
    // The server could not be read at all: nothing was chosen, nothing written.
    console.error("[dbml] reading the server catalogue failed", error);
    void window.showErrorMessage(
      dbImportErrorMessage(asDbImportError(error), importFailed()),
    );
    return;
  }
  if (chosen === undefined || chosen.length === 0) {
    return;
  }
  const targets = chosen;

  const destinations = await resolveImportDestination(targets);
  if (destinations === undefined) {
    return;
  }

  const { outcomes, cancelled } = await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: l10n.t("Importing database schema…"),
      cancellable: true,
    },
    async (progress, token) =>
      await importEach(
        connectionString,
        targets,
        destinations,
        progress,
        token,
      ),
  );

  await reportOutcomes(outcomes, targets.length, cancelled);

  if (isNew) {
    try {
      await maybeSaveConnection(context, connectionString);
    } catch (error) {
      console.error("[dbml] failed to save the connection", error);
      void window.showErrorMessage(
        l10n.t("The connection could not be saved."),
      );
    }
  }
}
