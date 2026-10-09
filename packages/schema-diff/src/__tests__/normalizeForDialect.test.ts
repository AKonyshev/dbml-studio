import { diffSchemas } from "../diffSchemas";

import type { CanonColumn, CanonIndex, CanonSchema } from "../model";

const col = (p: Partial<CanonColumn> & { name: string }): CanonColumn => ({
  type: "integer",
  nullable: false,
  pk: false,
  ...p,
});

const ix = (columns: string[], unique = false): CanonIndex => ({
  columns,
  unique,
});

function schema(parts: {
  member: { status: string; indexes?: CanonIndex[] };
  loanIndexes?: CanonIndex[];
  enums?: Array<{ name: string; values: string[] }>;
  refs?: CanonSchema["refs"];
}): CanonSchema {
  return {
    tables: new Map([
      [
        "member",
        {
          schema: "library",
          name: "member",
          columns: new Map([
            ["id", col({ name: "id", pk: true })],
            ["status", col({ name: "status", type: parts.member.status })],
          ]),
          indexes: parts.member.indexes ?? [],
        },
      ],
      [
        "loan",
        {
          schema: "library",
          name: "loan",
          columns: new Map([
            ["id", col({ name: "id", pk: true })],
            ["member_id", col({ name: "member_id" })],
          ]),
          indexes: parts.loanIndexes ?? [],
        },
      ],
    ]),
    enums: new Map((parts.enums ?? []).map((e) => [e.name, e])),
    refs: parts.refs ?? [],
  };
}

const loanToMember = {
  fromTable: "loan",
  fromColumns: ["member_id"],
  toTable: "member",
  toColumns: ["id"],
};

describe("diffSchemas for MySQL", () => {
  describe("enums", () => {
    const model = (values = ["active", "lapsed"]): CanonSchema =>
      schema({
        member: { status: "membership_status" },
        enums: [{ name: "membership_status", values }],
        refs: [loanToMember],
      });
    const database = (values = ["active", "lapsed"]): CanonSchema =>
      schema({
        member: { status: "member_status_enum" },
        enums: [{ name: "member_status_enum", values }],
        refs: [loanToMember],
      });

    it("compares an enum by its values and not its name", () => {
      expect(
        diffSchemas(model(), database(), { dialect: "mysql" }).identical,
      ).toBe(true);
    });

    it("still reports the names when no dialect is given", () => {
      const difference = diffSchemas(model(), database());

      expect(difference.identical).toBe(false);
      expect(difference.enumsOnlyInDbml).toEqual(["membership_status"]);
      expect(difference.enumsOnlyInDatabase).toEqual(["member_status_enum"]);
    });

    it("reports other databases' enums as before", () => {
      for (const dialect of ["postgres", "mssql"] as const) {
        const difference = diffSchemas(model(), database(), { dialect });

        expect(difference.enumsOnlyInDbml).toEqual(["membership_status"]);
      }
    });

    it("reports different values as a change of the column's type", () => {
      const difference = diffSchemas(model(), database(["active", "gone"]), {
        dialect: "mysql",
      });

      expect(difference.identical).toBe(false);
      expect(difference.enumsOnlyInDbml).toEqual([]);
      expect(difference.enumsOnlyInDatabase).toEqual([]);
      expect(difference.enumValueDiffs).toEqual([]);
      expect(difference.columnDiffs).toHaveLength(1);
      expect(difference.columnDiffs[0].table).toBe("member");
      expect(difference.columnDiffs[0].changed).toEqual([
        expect.objectContaining({ column: "status", differs: ["type"] }),
      ]);
    });

    it("treats the same values in another order as a difference", () => {
      const difference = diffSchemas(model(), database(["lapsed", "active"]), {
        dialect: "mysql",
      });

      expect(difference.columnDiffs[0].changed[0].differs).toEqual(["type"]);
    });

    it("leaves the nullability and key of the column alone", () => {
      const m = model();
      m.tables
        .get("member")
        ?.columns.set(
          "status",
          col({ name: "status", type: "membership_status", nullable: true }),
        );

      const difference = diffSchemas(m, database(), { dialect: "mysql" });

      expect(difference.columnDiffs[0].changed[0].differs).toEqual([
        "nullable",
      ]);
    });

    it("does not change the schemas it is given", () => {
      const m = model();
      const d = database();

      diffSchemas(m, d, { dialect: "mysql" });

      expect(m.enums.size).toBe(1);
      expect(d.enums.size).toBe(1);
      expect(m.tables.get("member")?.columns.get("status")?.type).toBe(
        "membership_status",
      );
    });
  });

  describe("indexes MySQL makes for foreign keys", () => {
    const model = (indexes: CanonIndex[] = []): CanonSchema =>
      schema({
        member: { status: "varchar" },
        loanIndexes: indexes,
        refs: [loanToMember],
      });
    const database = (indexes: CanonIndex[]): CanonSchema =>
      schema({
        member: { status: "varchar" },
        loanIndexes: indexes,
        refs: [loanToMember],
      });

    it("does not report the index a foreign key brought with it", () => {
      const difference = diffSchemas(model(), database([ix(["member_id"])]), {
        dialect: "mysql",
      });

      expect(difference.identical).toBe(true);
    });

    it("reports it for PostgreSQL, which makes none", () => {
      const difference = diffSchemas(model(), database([ix(["member_id"])]), {
        dialect: "postgres",
      });

      expect(difference.indexDiffs).toEqual([
        {
          table: "loan",
          onlyInDbml: [],
          onlyInDatabase: [ix(["member_id"])],
        },
      ]);
    });

    it("reports it when no dialect is given", () => {
      const difference = diffSchemas(model(), database([ix(["member_id"])]));

      expect(difference.indexDiffs).toHaveLength(1);
    });

    it("reports a unique index on the same column", () => {
      const difference = diffSchemas(
        model(),
        database([ix(["member_id"], true)]),
        { dialect: "mysql" },
      );

      expect(difference.indexDiffs).toEqual([
        {
          table: "loan",
          onlyInDbml: [],
          onlyInDatabase: [ix(["member_id"], true)],
        },
      ]);
    });

    it("reports an index that is not a foreign key's columns", () => {
      const difference = diffSchemas(
        model(),
        database([ix(["member_id", "id"])]),
        { dialect: "mysql" },
      );

      expect(difference.indexDiffs).toHaveLength(1);
    });

    it("keeps an index the file declares, and reports it if the database lacks it", () => {
      const withIndex = diffSchemas(
        model([ix(["member_id"])]),
        database([ix(["member_id"])]),
        { dialect: "mysql" },
      );
      const without = diffSchemas(model([ix(["member_id"])]), database([]), {
        dialect: "mysql",
      });

      expect(withIndex.identical).toBe(true);
      expect(without.indexDiffs[0].onlyInDbml).toEqual([ix(["member_id"])]);
    });

    it("matches a composite key on its columns in order", () => {
      const composite = (indexes: CanonIndex[]): CanonSchema => {
        const s = database(indexes);
        s.refs = [
          {
            fromTable: "loan",
            fromColumns: ["member_id", "id"],
            toTable: "member",
            toColumns: ["id", "id"],
          },
        ];
        return s;
      };
      const m = composite([]);

      expect(
        diffSchemas(m, composite([ix(["member_id", "id"])]), {
          dialect: "mysql",
        }).identical,
      ).toBe(true);
      expect(
        diffSchemas(m, composite([ix(["id", "member_id"])]), {
          dialect: "mysql",
        }).indexDiffs,
      ).toHaveLength(1);
    });

    it("only drops indexes for foreign keys the database has", () => {
      const lacking = database([ix(["member_id"])]);
      lacking.refs = [];
      const m = model();
      m.refs = [];

      const difference = diffSchemas(m, lacking, { dialect: "mysql" });

      expect(difference.indexDiffs).toHaveLength(1);
    });

    it("does not drop the index from the schema it was given", () => {
      const d = database([ix(["member_id"])]);

      diffSchemas(model(), d, { dialect: "mysql" });

      expect(d.tables.get("loan")?.indexes).toEqual([ix(["member_id"])]);
    });
  });
});
