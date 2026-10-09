export interface SecretStore {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
}

const KEY = "dbml.connections";

async function readAll(secrets: SecretStore): Promise<Record<string, string>> {
  const raw = await secrets.get(KEY);
  if (raw == null || raw === "") {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  const isPlainObject =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  return isPlainObject ? (parsed as Record<string, string>) : {};
}

async function writeAll(
  secrets: SecretStore,
  all: Record<string, string>,
): Promise<void> {
  await secrets.store(KEY, JSON.stringify(all));
}

export async function listConnections(secrets: SecretStore): Promise<string[]> {
  return Object.keys(await readAll(secrets)).sort();
}

// Every saved connection with its string. For callers that need to look at all
// of them at once and would otherwise read the one secret key once per name.
export async function getAllConnections(
  secrets: SecretStore,
): Promise<Record<string, string>> {
  return await readAll(secrets);
}

export async function getConnection(
  secrets: SecretStore,
  name: string,
): Promise<string | undefined> {
  return (await readAll(secrets))[name];
}

export async function saveConnection(
  secrets: SecretStore,
  name: string,
  connectionString: string,
): Promise<void> {
  const all = await readAll(secrets);
  all[name] = connectionString;
  await writeAll(secrets, all);
}

export async function deleteConnection(
  secrets: SecretStore,
  name: string,
): Promise<void> {
  const all = await readAll(secrets);
  delete all[name];
  await writeAll(secrets, all);
}
