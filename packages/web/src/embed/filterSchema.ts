import { type JSONTableSchema } from "shared/types/tableSchema";

import { type EmbedError } from "./embedError";

export type FilterResult =
  { ok: true; schema: JSONTableSchema } | { ok: false; error: EmbedError };

/**
 * Short name to full name, for the names where that mapping is a function.
 *
 * A name held by two schemas is left out rather than resolved to either: the
 * author asked for something the file cannot answer, and guessing would put a
 * table on the page that they did not mean.
 */
const shortNames = (tables: JSONTableSchema["tables"]): Map<string, string> => {
  const seen = new Map<string, string | null>();

  for (const { name } of tables) {
    const short = name.slice(name.lastIndexOf(".") + 1);
    seen.set(short, seen.has(short) ? null : name);
  }

  const resolved = new Map<string, string>();

  for (const [short, full] of seen) {
    if (full !== null) {
      resolved.set(short, full);
    }
  }

  return resolved;
};

const isAmbiguous = (
  name: string,
  tables: JSONTableSchema["tables"],
): boolean =>
  tables.filter((table) => table.name.endsWith(`.${name}`)).length > 1;

export const filterSchema = (
  schema: JSONTableSchema,
  names: string[] | null,
): FilterResult => {
  if (names === null) {
    return schema.tables.length === 0
      ? { ok: false, error: { kind: "noTablesLeft" } }
      : { ok: true, schema };
  }

  const full = new Set(schema.tables.map((table) => table.name));
  const short = shortNames(schema.tables);
  const keep = new Set<string>();

  for (const name of names) {
    if (full.has(name)) {
      keep.add(name);
      continue;
    }

    const resolved = short.get(name);

    if (resolved !== undefined) {
      keep.add(resolved);
      continue;
    }

    return isAmbiguous(name, schema.tables)
      ? { ok: false, error: { kind: "tableAmbiguous", name } }
      : { ok: false, error: { kind: "tableMissing", name } };
  }

  if (keep.size === 0) {
    return { ok: false, error: { kind: "noTablesLeft" } };
  }

  /**
   * A layout the file carries is an arrangement of the whole model, and this is
   * no longer the whole model.
   *
   * Kept, the tables that survive hold the coordinates they had among all the
   * others: three tables out of thirty, still hundreds of table-widths apart,
   * with the frame fitted to the empty rectangle they span. That is a page of
   * white with something small in two of its corners — and it is what a
   * documentation page gets by default, because every model in the project
   * carries such a block.
   *
   * Dropped, the tables are arranged as what they now are: a diagram of three.
   * Only when something was actually left out — a filter that names every table
   * has not made a different diagram, and the file still describes it.
   */
  const isSubset = keep.size < schema.tables.length;
  const kept = schema.tables
    .filter((table) => keep.has(table.name))
    .map((table) => {
      if (!isSubset) {
        return table;
      }

      const { fromMetaInfo, metaInfoPositions, ...rest } = table;

      return rest;
    });

  return {
    ok: true,
    schema: {
      tables: kept,
      // Both ends, not either: an edge to a table that is not on the diagram
      // leads the reader's eye off the canvas for no reason.
      refs: schema.refs.filter((relation) =>
        relation.endpoints.every((endpoint) => keep.has(endpoint.tableName)),
      ),
      // Enums are field types, not nodes, so filtering them would only make
      // some columns render without their type.
      enums: schema.enums,
    },
  };
};
