import { Parser } from "@dbml/core";

import { canonicalizeType } from "./canonicalizeType";
import { DbmlParseError } from "./errors";
import { endpointsToRef, splitQualified } from "./util";

import type {
  CanonColumn,
  CanonEnum,
  CanonIndex,
  CanonSchema,
  CanonTable,
} from "./model";

interface ParsedField {
  name: string;
  type?: { type_name?: string };
  pk?: boolean;
  not_null?: boolean;
}
interface ParsedIndexColumn {
  value: string | number;
}
interface ParsedIndex {
  columns?: ParsedIndexColumn[];
  unique?: boolean;
  name?: string;
}
interface ParsedTable {
  name: string;
  schemaName?: string | null;
  fields?: ParsedField[];
  indexes?: ParsedIndex[];
}
interface ParsedEnum {
  name: string;
  schemaName?: string | null;
  values?: Array<{ name: string }>;
}
interface ParsedRef {
  endpoints: Array<{
    tableName: string;
    schemaName?: string | null;
    fieldNames?: string[];
  }>;
}
interface ParsedDbml {
  tables?: ParsedTable[];
  enums?: ParsedEnum[];
  refs?: ParsedRef[];
}

export function parseDbmlToModel(dbmlText: string): CanonSchema {
  let parsed: ParsedDbml;
  try {
    parsed = Parser.parseDBMLToJSON(dbmlText);
  } catch (err) {
    const loc = (
      err as { location?: { start?: { line?: number; column?: number } } }
    )?.location?.start;
    throw new DbmlParseError(
      (err as { message?: string })?.message ?? "Failed to parse DBML",
      loc?.line ?? 0,
      loc?.column ?? 0,
    );
  }

  const tables = new Map<string, CanonTable>();
  for (const t of parsed.tables ?? []) {
    const { schema, table } = splitQualified(t.name, t.schemaName);
    const columns = new Map<string, CanonColumn>();
    for (const f of t.fields ?? []) {
      columns.set(f.name, {
        name: f.name,
        type: canonicalizeType(f.type?.type_name ?? ""),
        nullable: f.not_null !== true,
        pk: f.pk === true,
      });
    }
    const indexes: CanonIndex[] = (t.indexes ?? []).map((ix) => ({
      columns: (ix.columns ?? []).map((c) => String(c.value)),
      unique: ix.unique === true,
      name: ix.name,
    }));
    tables.set(table, { schema, name: table, columns, indexes });
  }

  const enums = new Map<string, CanonEnum>();
  for (const e of parsed.enums ?? []) {
    const { table } = splitQualified(e.name, e.schemaName);
    enums.set(table, {
      name: table,
      values: (e.values ?? []).map((v) => v.name),
    });
  }

  const refs = (parsed.refs ?? []).map((r) => endpointsToRef(r.endpoints));

  return { tables, enums, refs };
}
