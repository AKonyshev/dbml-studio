import { databaseCatalog } from "../catalog";
import { connectionsFromEnv } from "../connections";
import { compareWithDatabase } from "../tools/compareWithDatabase";
import { importSchema } from "../tools/importSchema";
import { listDatabases } from "../tools/listDatabases";
import { listSchemas } from "../tools/listSchemas";

import { makeContext } from "./helpers";

import type { ToolContext } from "../context";

/**
 * The database tools against a real PostgreSQL. Skipped unless
 * `DBML_TEST_DATABASE_URL` is set; `docs/testing.md` says how to raise one.
 */
const url = process.env.DBML_TEST_DATABASE_URL;
const describeLive = url === undefined || url === "" ? describe.skip : describe;

describeLive("database tools against DBML_TEST_DATABASE_URL", () => {
  jest.setTimeout(30_000);

  const context = async (): Promise<ToolContext> =>
    await makeContext({
      connections: connectionsFromEnv({ DBML_CONNECTION_TEST: url }),
      catalog: databaseCatalog,
    });

  it("lists databases and schemas", async () => {
    const ctx = await context();
    expect(
      (await listDatabases.run({ connection: "test" }, ctx)).structured
        .databases.length,
    ).toBeGreaterThan(0);
    expect(
      (await listSchemas.run({ connection: "test" }, ctx)).structured.schemas,
    ).toContain("public");
  });

  it("imports public and finds it identical to itself", async () => {
    const ctx = await context();
    const imported = await importSchema.run(
      { connection: "test", schemas: ["public"], overwrite: false },
      ctx,
    );
    expect(imported.structured.tables).toBeGreaterThan(0);
    const compared = await compareWithDatabase.run(
      { text: imported.text, connection: "test", schema: "public" },
      ctx,
    );
    expect(compared.structured.identical).toBe(true);
  });

  it("refuses a schema the database does not have", async () => {
    const ctx = await context();
    await expect(
      importSchema.run(
        { connection: "test", schemas: ["publc"], overwrite: false },
        ctx,
      ),
    ).rejects.toMatchObject({ code: "SCHEMA_NOT_FOUND" });
  });

  it("never shows the password of a raw connection the server rejects", async () => {
    const ctx = await makeContext({ catalog: databaseCatalog });
    const wrong = new URL(url ?? "");
    wrong.password = "Wr0ng-Pa55";
    const outcomes = await Promise.all(
      [
        listDatabases.run({ connection: wrong.href }, ctx),
        importSchema.run(
          { connection: wrong.href, schemas: ["public"], overwrite: false },
          ctx,
        ),
      ].map(
        async (call) =>
          await call.then(
            (r: unknown) => JSON.stringify(r),
            (e: Error) => `${(e as { code?: string }).code}: ${e.message}`,
          ),
      ),
    );
    for (const outcome of outcomes) {
      expect(outcome).not.toContain("Wr0ng-Pa55");
      expect(outcome).toMatch(/^[A-Z_]+: /);
    }
  });
});
