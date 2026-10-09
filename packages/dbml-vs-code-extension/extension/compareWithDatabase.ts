import {
  ExtensionContext,
  ProgressLocation,
  ViewColumn,
  l10n,
  window,
  workspace,
} from "vscode";
import {
  type DatabaseSchema,
  DbImportError,
  DbImportErrorCode,
  defaultSchema,
  dialectOf,
  fetchSchema,
  listDatabases,
  listSchemaNames,
  withDatabase,
} from "db-to-dbml";
import {
  DbmlParseError,
  databaseSchemaToModel,
  diffSchemas,
  parseDbmlToModel,
  renderDiffMarkdown,
} from "schema-diff";

import { dbImportErrorMessage } from "./dbImportErrorMessage";
import { pickDatabaseConnection } from "./pickDatabaseConnection";
import type { ImportPreselect } from "./pickImportTargets";

const asDbImportError = (error: unknown): DbImportError =>
  error instanceof DbImportError
    ? error
    : new DbImportError(DbImportErrorCode.UNKNOWN, "Unknown error");

export async function compareWithDatabase(
  context: ExtensionContext,
  preselect?: ImportPreselect,
): Promise<void> {
  const editor = window.activeTextEditor;
  if (editor == null || editor.document.languageId !== "dbml") {
    void window.showWarningMessage(
      l10n.t("Open a .dbml file to compare it with a database."),
    );
    return;
  }
  const dbmlText = editor.document.getText();

  let connectionString: string;
  if (preselect !== undefined) {
    connectionString = preselect.connectionString;
  } else {
    const picked = await pickDatabaseConnection(context);
    if (picked === undefined) {
      return;
    }
    connectionString = picked.connectionString;
  }

  // A connection names a server; which of its databases to compare against is a
  // question of its own — unless the node the command came from answered it.
  let databaseName = preselect?.databaseName;
  if (databaseName === undefined) {
    let databases: string[];
    try {
      databases = await listDatabases(connectionString);
    } catch (error) {
      console.error("[dbml] listing databases failed", error);
      void window.showErrorMessage(
        dbImportErrorMessage(
          asDbImportError(error),
          l10n.t("Failed to read the database schema."),
        ),
      );
      return;
    }

    if (databases.length === 0) {
      void window.showWarningMessage(
        l10n.t("No databases found on this server."),
      );
      return;
    }
    if (databases.length === 1) {
      databaseName = databases[0];
    } else {
      databaseName = await window.showQuickPick(databases, {
        placeHolder: l10n.t("Select the database to compare against"),
      });
      if (databaseName === undefined) {
        return;
      }
    }
  }
  const database = databaseName;

  let db: DatabaseSchema;
  try {
    db = await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: l10n.t("Reading database schema…"),
      },
      async () => await fetchSchema(withDatabase(connectionString, database)),
    );
  } catch (error) {
    console.error("[dbml] reading the database schema failed", error);
    void window.showErrorMessage(
      dbImportErrorMessage(
        asDbImportError(error),
        l10n.t("Failed to read the database schema."),
      ),
    );
    return;
  }

  // MySQL has no schema level: the database is the schema, and the connector
  // reports its tables under the database's name. Nothing to ask, and an empty
  // database is still a database to compare against.
  const dialect = dialectOf(connectionString);
  let schemaName = database;
  if (dialect !== "mysql") {
    const schemas = listSchemaNames(db);
    if (schemas.length === 0) {
      void window.showWarningMessage(
        l10n.t("No user schemas found in this database."),
      );
      return;
    }
    // The schema a database puts a table in unless told otherwise is almost
    // always the one wanted, so it comes first: Enter takes it.
    const preferred = defaultSchema(withDatabase(connectionString, database));
    const ordered = [
      ...schemas.filter((name) => name === preferred),
      ...schemas.filter((name) => name !== preferred),
    ];
    schemaName = ordered[0];
    if (ordered.length > 1) {
      const picked = await window.showQuickPick(ordered, {
        placeHolder: l10n.t("Select the database schema to compare against"),
      });
      if (picked === undefined) {
        return;
      }
      schemaName = picked;
    }
  }

  try {
    const model = parseDbmlToModel(dbmlText);
    // Not `database`: that name is taken above by the database this compares
    // against, and this is the model read out of it.
    const databaseModel = databaseSchemaToModel(db, schemaName);
    const diff = diffSchemas(model, databaseModel, { dialect });
    const markdown = renderDiffMarkdown(diff, l10n.t);

    const doc = await workspace.openTextDocument({
      language: "markdown",
      content: markdown,
    });
    await window.showTextDocument(doc, ViewColumn.Beside);
  } catch (error) {
    if (error instanceof DbmlParseError) {
      void window.showErrorMessage(
        l10n.t(
          "DBML parse error at line {0}:{1} — {2}",
          error.line,
          error.column,
          error.message,
        ),
      );
      return;
    }
    // The UI string stays generic, but keep the cause in the Extension Host
    // log — otherwise a diff failure is undiagnosable from a bug report.
    console.error("[dbml] compare with database failed", error);
    void window.showErrorMessage(
      l10n.t("Failed to compare the DBML file with the database."),
    );
  }
}
