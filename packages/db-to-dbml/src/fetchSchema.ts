import { dialectFor } from "./dialects/detect";

import type { DatabaseSchema } from "./types";

export const fetchSchema = async (
  connection: string,
): Promise<DatabaseSchema> =>
  await dialectFor(connection).fetchSchema(connection.trim());
