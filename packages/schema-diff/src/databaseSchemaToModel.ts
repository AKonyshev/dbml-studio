import { filterDatabaseSchema, type DatabaseSchema } from "db-to-dbml";

import { canonicalizeType } from "./canonicalizeType";
import { endpointsToRef } from "./util";

import type {
  CanonColumn,
  CanonEnum,
  CanonIndex,
  CanonSchema,
  CanonTable,
} from "./model";

interface DbField {
  name: string;
  type?: { type_name?: string };
  not_null?: boolean;
}
interface DbIndex {
  name?: string;
  unique?: boolean;
  columns?: Array<{ value: string | number }>;
}
interface DbRef {
  endpoints: Array<{
    tableName: string;
    schemaName?: string | null;
    fieldNames?: string[];
  }>;
}

export function databaseSchemaToModel(
  db: DatabaseSchema,
  schemaName: string,
): CanonSchema {
  const { schema } = filterDatabaseSchema(db, [schemaName]);

  const tables = new Map<string, CanonTable>();
  for (const t of schema.tables) {
    const key = `${t.schemaName}.${t.name}`;
    const fieldList = (schema.fields[key] as DbField[] | undefined) ?? [];
    const pkMap =
      (schema.tableConstraints[key] as
        Record<string, { pk?: boolean }> | undefined) ?? {};

    const columns = new Map<string, CanonColumn>();
    for (const f of fieldList) {
      columns.set(f.name, {
        name: f.name,
        type: canonicalizeType(f.type?.type_name ?? ""),
        nullable: f.not_null !== true,
        pk: pkMap[f.name]?.pk === true,
      });
    }

    const idxList = (schema.indexes[key] as DbIndex[] | undefined) ?? [];
    const indexes: CanonIndex[] = idxList.map((ix) => ({
      columns: (ix.columns ?? []).map((c) => String(c.value)),
      unique: ix.unique === true,
      name: ix.name,
    }));

    tables.set(t.name, {
      schema: t.schemaName,
      name: t.name,
      columns,
      indexes,
    });
  }

  const enums = new Map<string, CanonEnum>();
  for (const e of schema.enums) {
    enums.set(e.name, {
      name: e.name,
      values: ((e.values as Array<{ name: string }> | undefined) ?? []).map(
        (v) => v.name,
      ),
    });
  }

  const refs = (schema.refs as unknown as DbRef[]).map((r) =>
    endpointsToRef(r.endpoints),
  );

  return { tables, enums, refs };
}
