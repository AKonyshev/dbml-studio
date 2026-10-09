import { canonicalizeType } from "./canonicalizeType";
import { indexKey } from "./util";

import type { DialectId } from "db-to-dbml";
import type { CanonIndex, CanonSchema, CanonTable } from "./model";

/**
 * Turns the two sides of a comparison into ones that can be compared for a
 * database whose catalogue says things a hand-written file cannot. Only the
 * differences that are the database's own are removed; nothing is rewritten
 * across databases, so a type that is spelled differently in two databases
 * stays different.
 *
 * Nothing is changed in place. PostgreSQL comes back as it was.
 */
export function normalizeForDialect(
  model: CanonSchema,
  database: CanonSchema,
  dialect: DialectId | undefined,
): { model: CanonSchema; database: CanonSchema } {
  if (dialect === "mysql") {
    return {
      model: withEnumsInline(model, "declared"),
      database: dropForeignKeyIndexes(
        model,
        withEnumsInline(database, "declared"),
      ),
    };
  }
  if (dialect === "mssql") {
    return {
      model: withEnumsInline(model, "sorted"),
      database: withEnumsInline(database, "sorted"),
    };
  }
  return { model, database };
}

/**
 * MySQL has no enum type. A column is declared `ENUM('a', 'b')` and the
 * connector invents a name for it, `<table>_<column>_enum`, which no file can
 * be expected to share. So an enum is compared where MySQL keeps it, in the
 * column's type: each column typed by an enum of its own side takes the enum's
 * values as its type, and the enums themselves are no longer compared. A
 * different set of values then shows up as that column's type change.
 *
 * SQL Server has none either: the connector reads an enum out of a column's
 * CHECK constraint and names it after the constraint, which SQL Server named
 * itself. Its values come from an `IN (...)` list, which has no order, and the
 * connector does not return them in the order they were written. So there the
 * values are sorted, and a reordering is not a difference. In MySQL the order
 * is the enum's (it is what the column stores), so it is kept.
 *
 * The values are encoded as JSON, so a value that contains a comma cannot
 * make two different sets look alike.
 */
function withEnumsInline(
  schema: CanonSchema,
  order: "declared" | "sorted",
): CanonSchema {
  const byName = new Map(
    [...schema.enums.values()].map((e) => [canonicalizeType(e.name), e]),
  );

  const tables = new Map<string, CanonTable>();
  for (const [name, table] of schema.tables) {
    const columns = new Map(table.columns);
    for (const [columnName, column] of table.columns) {
      const named = byName.get(column.type);
      if (named !== undefined) {
        columns.set(columnName, {
          ...column,
          type: `enum(${JSON.stringify(
            order === "sorted" ? [...named.values].sort() : named.values,
          )})`,
        });
      }
    }
    tables.set(name, { ...table, columns });
  }

  return { tables, enums: new Map(), refs: schema.refs };
}

const sameColumns = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((column, i) => column === b[i]);

/**
 * MySQL gives every foreign key an index when it is not given one, so a file
 * that declares the key and no index is the same as a database that has both.
 * On the database side, a non-unique index that is exactly the columns of one
 * of the table's own foreign keys, and that the file does not declare, is
 * dropped. An index that is unique is a constraint someone wrote and stays.
 */
function dropForeignKeyIndexes(
  model: CanonSchema,
  database: CanonSchema,
): CanonSchema {
  const tables = new Map<string, CanonTable>();
  for (const [name, table] of database.tables) {
    const keys = database.refs
      .filter((ref) => ref.fromTable === name)
      .map((ref) => ref.fromColumns);
    const declared = new Set(
      (model.tables.get(name)?.indexes ?? []).map(indexKey),
    );
    const isForeignKeyIndex = (index: CanonIndex): boolean =>
      !index.unique &&
      !declared.has(indexKey(index)) &&
      keys.some((columns) => sameColumns(columns, index.columns));
    tables.set(name, {
      ...table,
      indexes: table.indexes.filter((index) => !isForeignKeyIndex(index)),
    });
  }
  return { ...database, tables };
}
