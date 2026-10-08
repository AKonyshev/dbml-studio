import { fetchPostgresSchema } from "db-to-dbml";

import { databaseSchemaToModel } from "../databaseSchemaToModel";
import { diffSchemas } from "../diffSchemas";
import { parseDbmlToModel } from "../parseDbmlToModel";
import { renderDiffMarkdown } from "../renderDiffMarkdown";

/**
 * Comparing a file against a database that exists.
 *
 * The rest of this package compares two models built from fixtures, which
 * proves the comparison and nothing about the half that comes off a live
 * catalogue. This is where a type the database spells its own way — `int4` for
 * a column written `serial` — either survives canonicalisation or shows up as a
 * difference that is not one.
 *
 * Skipped unless `DBML_TEST_DATABASE_URL` is set; `docs/testing.md` says how to
 * raise a database to run it against.
 */
const url = process.env.DBML_TEST_DATABASE_URL;
const describeLive = url === undefined ? describe.skip : describe;
// Narrowed once. Nothing below runs unless the variable is set, which is a
// guarantee `describe.skip` gives and the type system does not see.
const connection = url as unknown as string;

// The schema the fixture database is created with. Written the way a person
// would write it, not the way Postgres reports it back.
const MATCHING = `
Table "authors" {
  "id" int4 [pk, increment]
  "email" varchar(255) [unique, not null]
  "bio" text
}

Table "books" {
  "id" int4 [pk, increment]
  "author_id" int4 [not null]
  "title" varchar(255) [not null]
}

Ref: "authors"."id" < "books"."author_id"
`;

describeLive("against a real PostgreSQL", () => {
  jest.setTimeout(30_000);

  it("finds nothing to report when the file describes the database", async () => {
    const live = databaseSchemaToModel(
      await fetchPostgresSchema(connection),
      "public",
    );
    const difference = diffSchemas(parseDbmlToModel(MATCHING), live);

    // The point of the whole feature: a file that matches must come back clean.
    // One spurious difference here — a type spelled differently on the two
    // sides, a not-null read off the wrong column — and the report is noise
    // nobody reads. `int4` against a column written `serial` is exactly that
    // trap, and only a live database can spring it.
    expect(difference.identical).toBe(true);
  });

  it("reports a table the database does not have", async () => {
    const live = databaseSchemaToModel(
      await fetchPostgresSchema(connection),
      "public",
    );
    const withExtra = parseDbmlToModel(
      `${MATCHING}\nTable "reviews" {\n  "id" int4 [pk]\n}\n`,
    );

    const report = renderDiffMarkdown(diffSchemas(withExtra, live));

    expect(report).toContain("reviews");
  });

  it("reports a column the database does not have", async () => {
    const live = databaseSchemaToModel(
      await fetchPostgresSchema(connection),
      "public",
    );
    const withExtra = parseDbmlToModel(
      MATCHING.replace('"bio" text', '"bio" text\n  "twitter" varchar(64)'),
    );

    const report = renderDiffMarkdown(diffSchemas(withExtra, live));

    expect(report).toContain("twitter");
  });
});
