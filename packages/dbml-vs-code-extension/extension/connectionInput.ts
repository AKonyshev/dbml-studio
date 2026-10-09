import { l10n } from "vscode";
import { assertConnectionString } from "db-to-dbml";

// Functions, not constants, for the translated strings: l10n.t must not run at
// module load, before the bundle is available.
export const connectionPrompt = (): string =>
  l10n.t(
    "Connection string for PostgreSQL, MySQL or SQL Server (the database in it is only the entry point)",
  );

export const CONNECTION_PLACEHOLDER =
  "postgres://… · mysql://… · sqlserver://… · Server=…;Database=…";

// Shown under the input box as the user types; VS Code keeps the box open until
// this returns undefined. The input is a password field and may be half-typed,
// so the message is a fixed sentence and never repeats what was typed. An empty
// box is left alone: cancelling and submitting nothing are handled by the caller.
export function validateConnectionInput(value: string): string | undefined {
  if (value.trim() === "") {
    return undefined;
  }
  try {
    assertConnectionString(value);
    return undefined;
  } catch {
    return l10n.t(
      "Use a postgres://, mysql://, mariadb://, sqlserver:// or mssql:// URL, or a SQL Server connection string (Server=…;Database=…;User Id=…;Password=…).",
    );
  }
}
