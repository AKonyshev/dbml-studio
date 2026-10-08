import { compareWithDatabase } from "./compareWithDatabase";
import { dbmlToSql } from "./dbmlToSql";
import { importSchema } from "./importSchema";
import { listConnections } from "./listConnections";
import { listDatabases } from "./listDatabases";
import { listSchemas } from "./listSchemas";
import { sqlToDbml } from "./sqlToDbml";
import { validateDbml } from "./validateDbml";

import type { ToolDefinition } from "../context";

export const TOOLS: ToolDefinition[] = [
  listConnections,
  listDatabases,
  listSchemas,
  importSchema,
  compareWithDatabase,
  validateDbml,
  dbmlToSql,
  sqlToDbml,
];
