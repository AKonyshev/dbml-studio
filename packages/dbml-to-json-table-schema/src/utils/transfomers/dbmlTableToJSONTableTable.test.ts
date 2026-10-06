import { createEnumsSet } from "../createEnumsSet";
import { createRelationalTalesMap } from "../createRelationalTalesMap";

import { dbmlTableToJSONTableTable } from "./dbmlTableToJSONTableTable";

import { dbmlTestCodeInJSONTableFormat, parsedDBML } from "@/tests/data";

type TableResult = ReturnType<typeof dbmlTableToJSONTableTable>;
type FieldResult = TableResult["fields"][number];
type IndexResult = TableResult["indexes"][number];

const normalizeField = (field: FieldResult): unknown => {
  if (Array.isArray(field.relational_tables)) {
    return {
      ...field,
      relational_tables: new Set(field.relational_tables),
    };
  }

  return field;
};

const normalizeIndex = (index: IndexResult): unknown => {
  if (typeof index.pk === "boolean" && !index.pk) {
    const { pk: _removed, ...rest } = index;
    return rest;
  }

  return index;
};

const normalizeTable = (table: TableResult): unknown => {
  const withNormalizedFieldsAndIndexes = {
    ...table,
    fields: table.fields.map((field) => normalizeField(field)),
    indexes: table.indexes.map((index) => normalizeIndex(index)),
  } as any;

  if (withNormalizedFieldsAndIndexes.headerColor === undefined) {
    const { headerColor: _removed, ...rest } = withNormalizedFieldsAndIndexes;
    return { x: 0, y: 0, ...rest };
  }

  return { x: 0, y: 0, ...withNormalizedFieldsAndIndexes };
};

describe("transform dbml table to json table table", () => {
  test("transform table", () => {
    const enumSet = createEnumsSet(parsedDBML.enums);
    const relationalFieldMap = createRelationalTalesMap(parsedDBML.refs);

    const result = dbmlTableToJSONTableTable(
      parsedDBML.tables[0],
      relationalFieldMap,
      enumSet,
    );

    expect(normalizeTable(result)).toEqual({
      x: 0,
      y: 0,
      ...dbmlTestCodeInJSONTableFormat.tables[0],
    });
  });
});
