import { importer } from "@dbml/core";

import { filterDatabaseSchema } from "./filterDatabaseSchema";

import type { DatabaseSchema } from "./types";

// The one schema name @dbml/core's generator leaves unwritten. It does so for
// this name and no other, so writing another schema's objects without a prefix
// means presenting them to the generator under this one.
const GENERATOR_DEFAULT_SCHEMA = "public";

interface FieldLike {
  type?: { schemaName?: string | null; [key: string]: unknown };
  [key: string]: unknown;
}

/**
 * Re-keys a `<schema>.<table>` dictionary for the tables that moved from
 * `from` to `to`. Keys are matched against the known table names rather than
 * by prefix, so a table whose name contains a dot is not mistaken for a
 * different schema's.
 */
function rekey(
  dict: Record<string, unknown> | undefined,
  from: string,
  to: string,
  tableNames: string[],
): Record<string, unknown> {
  const moved = new Map(tableNames.map((n) => [`${from}.${n}`, `${to}.${n}`]));
  return Object.fromEntries(
    Object.entries(dict ?? {}).map(([key, value]) => {
      const renamed = moved.get(key);
      return [renamed ?? key, value];
    }),
  );
}

/**
 * A copy of `schema` in which the objects of `from` live in `to`. The input is
 * not touched: `filterDatabaseSchema` hands back the caller's own sections.
 */
function moveSchema(
  schema: Required<DatabaseSchema>,
  from: string,
  to: string,
): Required<DatabaseSchema> {
  const tableNames = schema.tables
    .filter((t) => t.schemaName === from)
    .map((t) => t.name);
  const rename = <T extends { schemaName: string }>(o: T): T =>
    o.schemaName === from ? { ...o, schemaName: to } : o;

  // A column typed by an enum names the enum's schema inside its type; that is
  // what makes the generator write `"schema".enum` for it.
  const retypeFields = (fields: unknown): unknown =>
    Array.isArray(fields)
      ? fields.map((f: FieldLike) =>
          f.type?.schemaName === from
            ? { ...f, type: { ...f.type, schemaName: to } }
            : f,
        )
      : fields;

  // Columns in other schemas can be typed by an enum of `from`.
  const retypeAll = (dict: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(dict).map(([key, value]) => [key, retypeFields(value)]),
    );

  return {
    tables: schema.tables.map(rename),
    enums: schema.enums.map(rename),
    refs: schema.refs.map((ref) => ({
      ...ref,
      endpoints: ref.endpoints.map(rename),
    })),
    fields: retypeAll(rekey(schema.fields, from, to, tableNames)),
    tableConstraints: rekey(schema.tableConstraints, from, to, tableNames),
    indexes: rekey(schema.indexes, from, to, tableNames),
    checks: rekey(schema.checks, from, to, tableNames),
  };
}

export interface SchemaToDbmlOptions {
  /**
   * A schema whose objects are written without a prefix, the way PostgreSQL's
   * `public` is. For MySQL that is the database, for SQL Server `dbo`: without
   * it every name in the file reads `"library"."book"`. Objects in every other
   * selected schema keep their prefix.
   *
   * Ignored when it is `public`, which needs nothing, or when `public` is also
   * selected, where two schemas cannot both go unwritten.
   */
  unqualified?: string;
}

export function schemaToDbml(
  db: DatabaseSchema,
  schemaNames: string[],
  options: SchemaToDbmlOptions = {},
): { dbml: string; droppedCrossSchemaRefs: number } {
  const { schema, droppedCrossSchemaRefs } = filterDatabaseSchema(
    db,
    schemaNames,
  );
  const { unqualified } = options;
  const shouldMove =
    unqualified !== undefined &&
    unqualified !== GENERATOR_DEFAULT_SCHEMA &&
    schemaNames.includes(unqualified) &&
    !schemaNames.includes(GENERATOR_DEFAULT_SCHEMA);

  const dbml: string = importer.generateDbml(
    shouldMove
      ? moveSchema(schema, unqualified, GENERATOR_DEFAULT_SCHEMA)
      : schema,
  );
  return { dbml, droppedCrossSchemaRefs };
}
