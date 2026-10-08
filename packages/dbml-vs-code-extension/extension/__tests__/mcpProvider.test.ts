import { McpStdioServerDefinition } from "vscode";

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

const makeProvider = (
  secrets: SecretStore,
  enabled: boolean,
  warn = jest.fn(),
) =>
  createMcpProvider({
    secrets,
    extensionPath: "/ext",
    isEnabled: () => enabled,
    workspaceFolder: () => "/work/library",
    warn,
  });

describe("connectionEnv", () => {
  it("names each connection by its env suffix", () => {
    expect(
      connectionEnv({
        staging: "postgres://a",
        "Library prod": "postgres://b",
      }),
    ).toEqual({
      env: {
        DBML_CONNECTION_STAGING: "postgres://a",
        DBML_CONNECTION_LIBRARY_PROD: "postgres://b",
      },
      collisions: [],
    });
  });

  it("drops both of two names that make the same variable", () => {
    const { env, collisions } = connectionEnv({
      "lib-db": "postgres://a",
      "lib db": "postgres://b",
      x: "postgres://c",
    });
    expect(env).toEqual({ DBML_CONNECTION_X: "postgres://c" });
    expect(collisions).toEqual([["lib db", "lib-db"]]);
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
    expect(definition.args).toEqual(["/ext/dist/mcp/server.cjs"]);
    expect(definition.env).toEqual({ ELECTRON_RUN_AS_NODE: "1" });
    expect(definition.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("hands saved connections over only when the server starts", async () => {
    const secrets = memorySecrets();
    await saveConnection(secrets, "staging", "postgres://reader:pw@h/library");
    const provider = makeProvider(secrets, true);
    const [definition] = (await provider.provideMcpServerDefinitions(
      {} as never,
    )) as McpStdioServerDefinition[];
    expect(definition.env).not.toHaveProperty("DBML_CONNECTION_STAGING");
    const resolved = (await provider.resolveMcpServerDefinition?.(
      definition,
      {} as never,
    )) as McpStdioServerDefinition;
    expect(resolved.env).toMatchObject({
      ELECTRON_RUN_AS_NODE: "1",
      DBML_CONNECTION_STAGING: "postgres://reader:pw@h/library",
    });
    expect(resolved.cwd?.fsPath).toBe("/work/library");
  });

  it("warns about colliding names without naming their URLs", async () => {
    const secrets = memorySecrets();
    await saveConnection(secrets, "lib-db", "postgres://u:secret1@h/a");
    await saveConnection(secrets, "lib db", "postgres://u:secret2@h/b");
    const warn = jest.fn();
    const provider = makeProvider(secrets, true, warn);
    const [definition] = (await provider.provideMcpServerDefinitions(
      {} as never,
    )) as McpStdioServerDefinition[];
    await provider.resolveMcpServerDefinition?.(definition, {} as never);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain("lib-db");
    expect(message).not.toContain("secret");
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
    expect(first).not.toBe(initial);
    expect(second).not.toBe(first);
    expect(first?.startsWith(initial as string)).toBe(true);
    expect(second?.startsWith(initial as string)).toBe(true);
  });

  it("tells VS Code to look again on refresh", () => {
    const provider = makeProvider(memorySecrets(), true);
    const listener = jest.fn();
    provider.onDidChangeMcpServerDefinitions?.(listener);
    provider.refresh();
    expect(listener).toHaveBeenCalled();
  });
});
