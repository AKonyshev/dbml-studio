import { fetchSchema, listDatabases, listSchemas } from "db-to-dbml";

import type { Catalog } from "./context";

export const databaseCatalog: Catalog = {
  listDatabases,
  listSchemas,
  fetchSchema,
};
