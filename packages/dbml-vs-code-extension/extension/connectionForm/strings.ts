import { l10n } from "vscode";
import { DbImportErrorCode, type DialectId } from "db-to-dbml";

// Every sentence the form shows. Keys are the English source text: the page
// looks a label up by its English text and shows the value. A function, not a
// constant, because l10n.t must not run at module load, before the bundle is
// available. Each key is written out next to its l10n.t call so that the string
// extraction finds it.
const table = () =>
  ({
    "New connection": l10n.t("New connection"),
    "Edit connection": l10n.t("Edit connection"),
    "Edit connection: {0}": l10n.t("Edit connection: {0}"),
    Save: l10n.t("Save"),
    Test: l10n.t("Test"),
    Cancel: l10n.t("Cancel"),
    "Testing…": l10n.t("Testing…"),
    "Connected — {0} databases": l10n.t("Connected — {0} databases"),

    Name: l10n.t("Name"),
    "Database kind": l10n.t("Database kind"),
    PostgreSQL: l10n.t("PostgreSQL"),
    "MySQL / MariaDB": l10n.t("MySQL / MariaDB"),
    "SQL Server": l10n.t("SQL Server"),
    Host: l10n.t("Host"),
    Port: l10n.t("Port"),
    Instance: l10n.t("Instance"),
    User: l10n.t("User"),
    Password: l10n.t("Password"),
    Database: l10n.t("Database"),
    "Encrypt connection": l10n.t("Encrypt connection"),
    "Trust server certificate": l10n.t("Trust server certificate"),
    "Additional parameters": l10n.t("Additional parameters"),
    "Leave empty to keep the current password": l10n.t(
      "Leave empty to keep the current password",
    ),
    optional: l10n.t("optional"),
    "Paste a connection string (optional) — the fields below fill in": l10n.t(
      "Paste a connection string (optional) — the fields below fill in",
    ),

    "Give the connection a name.": l10n.t("Give the connection a name."),
    "A connection with this name already exists.": l10n.t(
      "A connection with this name already exists.",
    ),
    "Enter a host.": l10n.t("Enter a host."),
    "The host is a name or address, without a port or path.": l10n.t(
      "The host is a name or address, without a port or path.",
    ),
    "The port is a number from 1 to 65535.": l10n.t(
      "The port is a number from 1 to 65535.",
    ),

    "The server refused the user name or password.": l10n.t(
      "The server refused the user name or password.",
    ),
    "Could not reach the server.": l10n.t("Could not reach the server."),
    "The user may not open that database.": l10n.t(
      "The user may not open that database.",
    ),
    "There is no such database.": l10n.t("There is no such database."),
    "The connection string is not one DBML Studio can read.": l10n.t(
      "The connection string is not one DBML Studio can read.",
    ),
    "Could not connect.": l10n.t("Could not connect."),
    "Could not save the connection.": l10n.t("Could not save the connection."),
    "The connection no longer exists.": l10n.t(
      "The connection no longer exists.",
    ),
    "If the server uses a self-signed certificate, tick Trust server certificate.":
      l10n.t(
        "If the server uses a self-signed certificate, tick Trust server certificate.",
      ),
  }) as const;

type StringKey = keyof ReturnType<typeof table>;

export const formStrings = (): Record<string, string> => ({ ...table() });

const text = (key: StringKey): string => table()[key];

// The sentences for validateFields' results, which are English keys.
export const fieldErrorMessage = (key: string): string =>
  (table() as Record<string, string>)[key] ?? key;

export const unreadableMessage = (): string =>
  text("The connection string is not one DBML Studio can read.");

export const saveFailedMessage = (): string =>
  text("Could not save the connection.");

export const connectionGoneMessage = (): string =>
  text("The connection no longer exists.");

export const editTitle = (name: string): string =>
  l10n.t("Edit connection: {0}", name);

export const newTitle = (): string => text("New connection");

// What a failed Test says. Fixed sentences only: a driver's own message can
// carry the host, the user or the password.
export function testFailureMessage(
  code: DbImportErrorCode | undefined,
  dialect: DialectId,
): string {
  switch (code) {
    case DbImportErrorCode.AUTH_FAILED:
      return text("The server refused the user name or password.");
    case DbImportErrorCode.UNREACHABLE: {
      const reached = text("Could not reach the server.");
      return dialect === "mssql"
        ? `${reached} ${text("If the server uses a self-signed certificate, tick Trust server certificate.")}`
        : reached;
    }
    case DbImportErrorCode.ACCESS_DENIED:
      return text("The user may not open that database.");
    case DbImportErrorCode.DATABASE_NOT_FOUND:
      return text("There is no such database.");
    case DbImportErrorCode.INVALID_CONNECTION_STRING:
      return unreadableMessage();
    case DbImportErrorCode.UNKNOWN:
    case undefined:
      return text("Could not connect.");
  }
}
