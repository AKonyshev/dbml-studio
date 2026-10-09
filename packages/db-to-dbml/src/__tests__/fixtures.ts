import type { DatabaseSchema } from "../types";

// Two schemas: "public" (users, orders) and "audit" (logs).
// One cross-schema ref: public.orders.user_id -> audit.logs.id.
export function twoSchemaFixture(): DatabaseSchema {
  return {
    tables: [
      { name: "users", schemaName: "public" },
      { name: "orders", schemaName: "public" },
      { name: "logs", schemaName: "audit" },
    ],
    enums: [
      { name: "user_role", schemaName: "public" },
      { name: "log_level", schemaName: "audit" },
    ],
    refs: [
      // fully inside public: orders.user_id -> users.id
      {
        endpoints: [
          { schemaName: "public", tableName: "orders" },
          { schemaName: "public", tableName: "users" },
        ],
      },
      // cross-schema: public.orders -> audit.logs
      {
        endpoints: [
          { schemaName: "public", tableName: "orders" },
          { schemaName: "audit", tableName: "logs" },
        ],
      },
      // fully inside audit
      {
        endpoints: [
          { schemaName: "audit", tableName: "logs" },
          { schemaName: "audit", tableName: "logs" },
        ],
      },
    ],
    fields: { "public.users": [], "public.orders": [], "audit.logs": [] },
    tableConstraints: { "public.users": {}, "audit.logs": {} },
    indexes: { "public.orders": [], "audit.logs": [] },
    checks: { "public.users": [], "audit.logs": [] },
  };
}

// What the MySQL adapter hands over: the database is the schema, fields and
// indexes are keyed `<database>.<table>`, and an enum column names the enum the
// connector made for it.
export function mysqlShapedFixture(): DatabaseSchema {
  return {
    tables: [
      { name: "member", schemaName: "library" },
      { name: "book", schemaName: "library" },
    ],
    enums: [
      {
        name: "book_status_enum",
        schemaName: "library",
        values: [{ name: "available" }, { name: "lost" }],
      },
    ],
    refs: [
      {
        name: "book_ibfk_1",
        endpoints: [
          {
            schemaName: "library",
            tableName: "book",
            fieldNames: ["member_id"],
            relation: "*",
          },
          {
            schemaName: "library",
            tableName: "member",
            fieldNames: ["id"],
            relation: "1",
          },
        ],
      },
    ],
    fields: {
      "library.member": [
        { name: "id", type: { type_name: "int" }, not_null: true },
      ],
      "library.book": [
        { name: "id", type: { type_name: "int" }, not_null: true },
        { name: "member_id", type: { type_name: "int" } },
        {
          name: "status",
          type: { type_name: "book_status_enum", schemaName: "library" },
          not_null: true,
        },
      ],
    },
    tableConstraints: {
      "library.member": { id: { pk: true } },
      "library.book": { id: { pk: true } },
    },
    indexes: {
      "library.book": [
        {
          name: "member_id",
          type: "BTREE",
          columns: [{ value: "member_id", type: "column" }],
          unique: false,
        },
      ],
    },
    checks: {},
  };
}
