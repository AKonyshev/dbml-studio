import { dialectFor } from "./dialects/detect";

/** The schema a database puts a table in when none is named. */
export const defaultSchema = (connection: string): string =>
  dialectFor(connection).defaultSchema(connection.trim());
