import { fetchPostgresSchema, listDatabases, listSchemas } from "db-to-dbml";

import type { Catalog } from "./context";

export const postgresCatalog: Catalog = {
  listDatabases,
  listSchemas,
  fetchSchema: fetchPostgresSchema,
};
