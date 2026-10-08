import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const pkg = path.resolve(__dirname, "../..");
const bundle = path.join(pkg, "dist/server.cjs");

// The built file, not the sources: this is what npx and the extension run.
beforeAll(() => {
  execFileSync(process.execPath, ["scripts/build.mjs"], {
    cwd: pkg,
    stdio: "inherit",
  });
}, 120_000);

async function connect(
  env: Record<string, string>,
  cwd: string,
  args: string[] = [],
): Promise<Client> {
  const client = new Client({ name: "dbml-mcp-test", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [bundle, ...args],
      env,
      cwd,
    }),
  );
  return client;
}

describe("the bundled server over stdio", () => {
  let client: Client;
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "dbml-mcp-proto-"));
    await writeFile(
      path.join(root, "library.dbml"),
      "Table member {\n  id integer [pk]\n}\n",
    );
    // No DBML_CONNECTION_*: the server must start without any.
    client = await connect({ PATH: process.env.PATH ?? "" }, root);
  }, 30_000);

  afterAll(async () => {
    await client.close();
    await rm(root, { recursive: true, force: true });
  });

  it("lists the eight tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "compare_with_database",
      "dbml_to_sql",
      "import_schema",
      "list_connections",
      "list_databases",
      "list_schemas",
      "sql_to_dbml",
      "validate_dbml",
    ]);
    const validate = tools.find((t) => t.name === "validate_dbml");
    expect(validate?.annotations?.readOnlyHint).toBe(true);
    expect(validate?.outputSchema).toBeDefined();
  });

  it("validates a file in its working folder", async () => {
    const result = await client.callTool({
      name: "validate_dbml",
      arguments: { path: "library.dbml" },
    });
    expect(result.structuredContent).toEqual({
      valid: true,
      errors: [],
      tables: 1,
      refs: 0,
    });
  });

  it("answers a database tool without connections with CONNECTION_NOT_FOUND", async () => {
    const result = await client.callTool({
      name: "list_databases",
      arguments: { connection: "prod" },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("CONNECTION_NOT_FOUND");
  });
});

// The folder a tool may read and write is a choice: started with --no-root, or
// in the home folder as clients without a project do, it has none.
describe.each([
  ["with --no-root", ["--no-root"], undefined],
  ["started in the home folder", [], homedir()],
])("the bundled server %s", (_label, args, cwd) => {
  let client: Client;
  let made: string | undefined;

  beforeAll(async () => {
    let start = cwd;
    if (start === undefined) {
      made = await mkdtemp(path.join(tmpdir(), "dbml-mcp-noroot-"));
      await writeFile(path.join(made, "x.dbml"), "Table member {\n}\n");
      start = made;
    }
    client = await connect({ PATH: process.env.PATH ?? "" }, start, args);
  }, 30_000);

  afterAll(async () => {
    await client.close();
    if (made !== undefined) {
      await rm(made, { recursive: true, force: true });
    }
  });

  it("refuses a path with NO_ROOT", async () => {
    const result = await client.callTool({
      name: "validate_dbml",
      arguments: { path: "x.dbml" },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("NO_ROOT");
  });

  it("still validates text", async () => {
    const result = await client.callTool({
      name: "validate_dbml",
      arguments: { text: "Table member {\n  id integer [pk]\n}\n" },
    });
    expect(result.structuredContent).toMatchObject({ valid: true, tables: 1 });
  });
});

describe("the bundled server at start-up", () => {
  it("reports colliding connection names in a few lines and leaks no value", () => {
    const run = spawnSync(process.execPath, [bundle], {
      env: {
        PATH: process.env.PATH ?? "",
        DBML_CONNECTION_A_B: "postgres://u:hunter1@h/db",
        DBML_CONNECTION_A_b: "postgres://u:hunter2@h/db",
      },
      encoding: "utf8",
      timeout: 20_000,
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr.length).toBeLessThan(1000);
    expect(run.stderr).toContain("DBML_CONNECTION_A_B");
    expect(run.stderr).toContain("DBML_CONNECTION_A_b");
    for (const secret of ["hunter1", "hunter2"]) {
      expect(run.stdout).not.toContain(secret);
      expect(run.stderr).not.toContain(secret);
    }
  });
});
