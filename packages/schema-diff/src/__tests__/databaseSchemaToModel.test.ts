import { databaseSchemaToModel } from "../databaseSchemaToModel";

import type { DatabaseSchema } from "db-to-dbml";

function dbFixture(): DatabaseSchema {
  return {
    tables: [{ name: "t", schemaName: "s" }],
    enums: [{ name: "color", schemaName: "s", values: [{ name: "red" }] }],
    refs: [
      {
        endpoints: [
          { tableName: "t", schemaName: "s", fieldNames: ["id"] },
          { tableName: "u", schemaName: "s", fieldNames: ["t_id"] },
        ],
      },
    ],
    fields: {
      "s.t": [
        { name: "id", type: { type_name: "uuid" }, not_null: true },
        {
          name: "amount",
          type: { type_name: "numeric(10,2)" },
          not_null: false,
        },
      ],
    },
    tableConstraints: { "s.t": { id: { pk: true } } },
    indexes: {
      "s.t": [
        {
          name: "ix",
          type: "btree",
          columns: [{ type: "column", value: "amount" }],
        },
      ],
    },
    checks: {},
  };
}

describe("databaseSchemaToModel", () => {
  test("normalizes columns with pk from tableConstraints and canonical types", () => {
    const m = databaseSchemaToModel(dbFixture(), "s");
    const t = m.tables.get("t");
    expect(t?.columns.get("id")).toEqual({
      name: "id",
      type: "uuid",
      nullable: false,
      pk: true,
    });
    expect(t?.columns.get("amount")).toEqual({
      name: "amount",
      type: "numeric",
      nullable: true,
      pk: false,
    });
  });

  test("normalizes indexes (unique always false), enums, and refs", () => {
    const m = databaseSchemaToModel(dbFixture(), "s");
    expect(m.tables.get("t")?.indexes).toEqual([
      { columns: ["amount"], unique: false, name: "ix" },
    ]);
    expect(m.enums.get("color")).toEqual({ name: "color", values: ["red"] });
    expect(m.refs).toHaveLength(1);
    expect([m.refs[0].fromTable, m.refs[0].toTable].sort()).toEqual(["t", "u"]);
  });
});
