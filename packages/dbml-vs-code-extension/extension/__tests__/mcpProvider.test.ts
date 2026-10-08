import { McpStdioServerDefinition } from "vscode";
import { VERSION } from "dbml-mcp/version";

import { connectionEnv, createMcpProvider } from "../mcpProvider";
import { saveConnection, type SecretStore } from "../connectionStore";

const memorySecrets = (): SecretStore => {
  const data = new Map<string, string>();
  return {
    get: async (k) => data.get(k),
    store: async (k, v) => {
      data.set(k, v);
    },
  };
};

// Escaped, because the sources are English (sourceLanguage.test.ts).
const PROD_RU = "\u043f\u0440\u043e\u0434"; // Russian "prod"
const PROD_RU_TITLE = "\u041f\u0440\u043e\u0434"; // the same, capitalised
const LIBRARY_ZH = "\u56fe\u4e66\u9986"; // Chinese "library"

const SERVER = "/ext/dist/mcp/server.cjs";

const makeProvider = (
  secrets: SecretStore,
  enabled: boolean,
  warn = jest.fn(),
  // null for "no folder open": an undefined argument would take the default.
  folder: string | null = "/work/library",
) =>
  createMcpProvider({
    secrets,
    extensionPath: "/ext",
    extensionVersion: "1.3.0",
    isEnabled: () => enabled,
    workspaceFolder: () => folder ?? undefined,
    warn,
  });

const resolveOne = async (
  provider: ReturnType<typeof makeProvider>,
): Promise<McpStdioServerDefinition> => {
  const [definition] = (await provider.provideMcpServerDefinitions(
    {} as never,
  )) as McpStdioServerDefinition[];
  return (await provider.resolveMcpServerDefinition?.(
    definition,
    {} as never,
  )) as McpStdioServerDefinition;
};

describe("connectionEnv", () => {
  it("numbers the connections in name order and maps the numbers to names", () => {
    expect(
      connectionEnv({
        [LIBRARY_ZH]: "postgres://c",
        staging: "postgres://a",
        [PROD_RU]: "postgres://b",
        "Library prod": "postgres://d",
      }),
    ).toEqual({
      env: {
        DBML_CONNECTION_C1: "postgres://d",
        DBML_CONNECTION_C2: "postgres://a",
        DBML_CONNECTION_C3: "postgres://b",
        DBML_CONNECTION_C4: "postgres://c",
        DBML_CONNECTION_NAMES: JSON.stringify({
          C1: "Library prod",
          C2: "staging",
          C3: PROD_RU,
          C4: LIBRARY_ZH,
        }),
      },
      collisions: [],
    });
  });

  it("drops every name that equals another but for case, and says which", () => {
    const { env, collisions } = connectionEnv({
      [PROD_RU_TITLE]: "postgres://a",
      [PROD_RU]: "postgres://b",
      x: "postgres://c",
    });
    expect(env).toEqual({
      DBML_CONNECTION_C1: "postgres://c",
      DBML_CONNECTION_NAMES: JSON.stringify({ C1: "x" }),
    });
    expect(collisions).toEqual([[PROD_RU_TITLE, PROD_RU]]);
  });

  it("keeps names that differ only in punctuation apart", () => {
    const { env, collisions } = connectionEnv({
      "lib-db": "postgres://a",
      "lib db": "postgres://b",
    });
    expect(collisions).toEqual([]);
    expect(JSON.parse(env.DBML_CONNECTION_NAMES)).toEqual({
      C1: "lib db",
      C2: "lib-db",
    });
  });
});

describe("the MCP server definition provider", () => {
  it("offers nothing while the setting is off", async () => {
    expect(
      await makeProvider(memorySecrets(), false).provideMcpServerDefinitions(
        {} as never,
      ),
    ).toEqual([]);
  });

  it("offers the bundled server, started with VS Code's own Node", async () => {
    const [definition] = (await makeProvider(
      memorySecrets(),
      true,
    ).provideMcpServerDefinitions({} as never)) as McpStdioServerDefinition[];
    expect(definition.command).toBe(process.execPath);
    expect(definition.args).toEqual([SERVER]);
    expect(definition.env).toEqual({ ELECTRON_RUN_AS_NODE: "1" });
    expect(definition.version).toBe(`1.3.0-${VERSION}`);
  });

  it("names the workspace folder as the server's root", async () => {
    const resolved = await resolveOne(makeProvider(memorySecrets(), true));
    expect(resolved.args).toEqual([SERVER, "--root", "/work/library"]);
    expect(resolved.cwd?.fsPath).toBe("/work/library");
  });

  it("starts the server with no root when no folder is open", async () => {
    const resolved = await resolveOne(
      makeProvider(memorySecrets(), true, jest.fn(), null),
    );
    expect(resolved.args).toEqual([SERVER, "--no-root"]);
    expect(resolved.cwd).toBeUndefined();
  });

  it("gives the same arguments when a definition is resolved twice", async () => {
    const provider = makeProvider(memorySecrets(), true);
    const [definition] = (await provider.provideMcpServerDefinitions(
      {} as never,
    )) as McpStdioServerDefinition[];
    await provider.resolveMcpServerDefinition?.(definition, {} as never);
    const again = (await provider.resolveMcpServerDefinition?.(
      definition,
      {} as never,
    )) as McpStdioServerDefinition;
    expect(again.args).toEqual([SERVER, "--root", "/work/library"]);
  });

  describe("with connection variables in VS Code's own environment", () => {
    const inherited = {
      DBML_CONNECTION_SHELL: "postgres://u:fromshell@h/a",
      dbml_connection_lower: "postgres://u:fromshell@h/b",
      DBML_CONNECTION_NAMES: '{"SHELL":"shell"}',
    };

    beforeEach(() => {
      Object.assign(process.env, inherited);
    });

    afterEach(() => {
      for (const key of Object.keys(inherited)) {
        Reflect.deleteProperty(process.env, key);
      }
    });

    it("removes the ones it did not set, so the server never sees them", async () => {
      const secrets = memorySecrets();
      await saveConnection(
        secrets,
        "staging",
        "postgres://reader:pw@h/library",
      );
      const resolved = await resolveOne(makeProvider(secrets, true));
      expect(resolved.env).toEqual({
        ELECTRON_RUN_AS_NODE: "1",
        DBML_CONNECTION_C1: "postgres://reader:pw@h/library",
        DBML_CONNECTION_NAMES: JSON.stringify({ C1: "staging" }),
        DBML_CONNECTION_SHELL: null,
        dbml_connection_lower: null,
      });
    });
  });

  it("hands saved connections over only when the server starts", async () => {
    const secrets = memorySecrets();
    await saveConnection(secrets, "staging", "postgres://reader:pw@h/library");
    const provider = makeProvider(secrets, true);
    const [definition] = (await provider.provideMcpServerDefinitions(
      {} as never,
    )) as McpStdioServerDefinition[];
    expect(definition.env).toEqual({ ELECTRON_RUN_AS_NODE: "1" });
    const resolved = (await provider.resolveMcpServerDefinition?.(
      definition,
      {} as never,
    )) as McpStdioServerDefinition;
    expect(resolved.env).toMatchObject({
      ELECTRON_RUN_AS_NODE: "1",
      DBML_CONNECTION_C1: "postgres://reader:pw@h/library",
      DBML_CONNECTION_NAMES: JSON.stringify({ C1: "staging" }),
    });
  });

  it("warns about names equal but for case without naming their URLs", async () => {
    const secrets = memorySecrets();
    await saveConnection(secrets, PROD_RU_TITLE, "postgres://u:secret1@h/a");
    await saveConnection(secrets, PROD_RU, "postgres://u:secret2@h/b");
    const warn = jest.fn();
    const resolved = await resolveOne(makeProvider(secrets, true, warn));
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain(PROD_RU_TITLE);
    expect(message).toContain(PROD_RU);
    expect(message).toContain("differ only in letter case");
    expect(message).not.toContain("secret");
    expect(JSON.stringify(resolved.env)).not.toContain("secret");
  });

  it("changes the definition's version on every refresh, without secrets", async () => {
    const secrets = memorySecrets();
    await saveConnection(secrets, "staging", "postgres://reader:pw@h/library");
    const provider = makeProvider(secrets, true);
    const versionOf = async (): Promise<string | undefined> => {
      const [definition] = (await provider.provideMcpServerDefinitions(
        {} as never,
      )) as McpStdioServerDefinition[];
      expect(definition.env).toEqual({ ELECTRON_RUN_AS_NODE: "1" });
      return definition.version;
    };
    const initial = await versionOf();
    provider.refresh();
    const first = await versionOf();
    provider.refresh();
    const second = await versionOf();
    expect(initial).toBe(`1.3.0-${VERSION}`);
    expect(first).toBe(`1.3.0-${VERSION}+1`);
    expect(second).toBe(`1.3.0-${VERSION}+2`);
  });

  it("tells VS Code to look again on refresh", () => {
    const provider = makeProvider(memorySecrets(), true);
    const listener = jest.fn();
    provider.onDidChangeMcpServerDefinitions?.(listener);
    provider.refresh();
    expect(listener).toHaveBeenCalled();
  });
});
