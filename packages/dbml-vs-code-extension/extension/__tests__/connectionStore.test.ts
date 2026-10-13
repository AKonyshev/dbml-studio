import {
  listConnections,
  getConnection,
  saveConnection,
  deleteConnection,
  renameConnection,
  type SecretStore,
} from "../connectionStore";

function fakeSecrets(): SecretStore {
  const map = new Map<string, string>();
  return {
    get: async (k) => map.get(k),
    store: async (k, v) => void map.set(k, v),
  };
}

describe("connectionStore", () => {
  test("save then list and get", async () => {
    const s = fakeSecrets();
    await saveConnection(s, "local", "postgres://u:p@h/db");
    expect(await listConnections(s)).toEqual(["local"]);
    expect(await getConnection(s, "local")).toBe("postgres://u:p@h/db");
  });

  test("delete removes a connection", async () => {
    const s = fakeSecrets();
    await saveConnection(s, "a", "postgres://a");
    await saveConnection(s, "b", "postgres://b");
    await deleteConnection(s, "a");
    expect(await listConnections(s)).toEqual(["b"]);
  });

  test("empty store lists nothing", async () => {
    expect(await listConnections(fakeSecrets())).toEqual([]);
  });

  test("stored JSON `null` does not throw and lists nothing", async () => {
    const s = fakeSecrets();
    await s.store("dbml.connections", "null");
    await expect(listConnections(s)).resolves.toEqual([]);
  });

  test("stored JSON array does not throw and lists nothing", async () => {
    const s = fakeSecrets();
    await s.store("dbml.connections", "[]");
    await expect(listConnections(s)).resolves.toEqual([]);
  });

  test("rename moves a connection in one write", async () => {
    const s = fakeSecrets();
    await saveConnection(s, "a", "postgres://a");
    await saveConnection(s, "b", "postgres://b");
    const store = jest.spyOn(s, "store");
    await expect(renameConnection(s, "a", "c", "postgres://c")).resolves.toBe(
      true,
    );
    expect(store).toHaveBeenCalledTimes(1);
    expect(await listConnections(s)).toEqual(["b", "c"]);
    expect(await getConnection(s, "c")).toBe("postgres://c");
  });

  test("a case-only rename leaves only the new spelling", async () => {
    const s = fakeSecrets();
    await saveConnection(s, "shop", "postgres://a");
    await renameConnection(s, "shop", "Shop", "postgres://a");
    expect(await listConnections(s)).toEqual(["Shop"]);
  });

  test("rename to the same key replaces its string", async () => {
    const s = fakeSecrets();
    await saveConnection(s, "a", "postgres://a");
    await expect(renameConnection(s, "a", "a", "postgres://new")).resolves.toBe(
      true,
    );
    expect(await getConnection(s, "a")).toBe("postgres://new");
  });

  test("rename refuses, and writes nothing, when the old key is gone", async () => {
    const s = fakeSecrets();
    await saveConnection(s, "b", "postgres://b");
    const store = jest.spyOn(s, "store");
    await expect(renameConnection(s, "a", "c", "postgres://c")).resolves.toBe(
      false,
    );
    await expect(renameConnection(s, "a", "a", "postgres://c")).resolves.toBe(
      false,
    );
    expect(store).not.toHaveBeenCalled();
    expect(await listConnections(s)).toEqual(["b"]);
  });
});
