import { l10n } from "vscode";
import { DbImportError, DbImportErrorCode } from "db-to-dbml";

// A switch over the enum rather than a Record: l10n.t must not run at module
// load, before the bundle is available. Exhaustiveness is preserved — the
// `string | null` return type over every enum member makes a newly added code a
// compile error rather than a silent fall-through to the caller's fallback.
// Never include error.message here — it may carry connection details (see
// each dialect's toDbImportError in db-to-dbml).
const uiMessage = (code: DbImportErrorCode): string | null => {
  switch (code) {
    case DbImportErrorCode.AUTH_FAILED:
      return l10n.t("Authentication failed. Check the username and password.");
    case DbImportErrorCode.INVALID_CONNECTION_STRING:
      return l10n.t(
        "Invalid connection string. Check its format, and that it names a database.",
      );
    case DbImportErrorCode.UNREACHABLE:
      return l10n.t("Could not reach the database host.");
    case DbImportErrorCode.DATABASE_NOT_FOUND:
      return l10n.t("The specified database does not exist.");
    case DbImportErrorCode.ACCESS_DENIED:
      return l10n.t("Access to this database is denied.");
    case DbImportErrorCode.UNKNOWN:
      return null;
  }
};

export function dbImportErrorMessage(
  error: DbImportError,
  unknownFallback: string,
): string {
  return uiMessage(error.code) ?? unknownFallback;
}
