import { type JSONTableTable } from "shared/types/tableSchema";

import { getTableFullName } from "../computeNameWithSchemaName";

import { dbmlFieldToJSONTableField } from "./dbmlFieldToJSONTableField";
import { dbmlIndexToJSONTableIndex } from "./dbmlIndexToJSONTableIndex";

import type { Table } from "@dbml/core";

export const dbmlTableToJSONTableTable = (
  table: Table,
  relationalFieldMap: Map<string, string[]>,
  enumsMap: Set<string>,
): JSONTableTable => {
  const { name, note, headerColor, fields, indexes } = table;

  return {
    name: getTableFullName(table),
    x: 0,
    y: 0,
    headerColor,
    // the note returned by the dbml parser is not string
    // but an object there is an typing error in their package
    note: (note as any)?.value,
    fields: fields.map((field) =>
      dbmlFieldToJSONTableField({
        field,
        enumsSet: enumsMap,
        relationalFieldMap,
        ownerTable: name,
      }),
    ),
    indexes: indexes.map(dbmlIndexToJSONTableIndex),
  };
};
