import { dialectFor } from "./dialects/detect";

export const listSchemas = async (connection: string): Promise<string[]> =>
  await dialectFor(connection).listSchemas(connection.trim());
