import { dialectFor } from "./dialects/detect";

export const listDatabases = async (connection: string): Promise<string[]> =>
  await dialectFor(connection).listDatabases(connection.trim());
