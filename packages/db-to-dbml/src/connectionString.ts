import { dialectFor } from "./dialects/detect";

// One guard for every entry point that takes a connection string. It returns
// the trimmed value, so a caller passes on exactly what was validated rather
// than trimming again on its own.
export const assertConnectionString = (connection: string): string =>
  dialectFor(connection).normalize(connection.trim());

// A saved connection names a server; the database inside it is only the entry
// point. Switching databases is therefore a rewrite of the connection string
// that keeps the credentials, the host and every option untouched.
export const withDatabase = (connection: string, database: string): string =>
  dialectFor(connection).withDatabase(connection.trim(), database);
