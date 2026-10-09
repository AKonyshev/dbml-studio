// Expanding a tree node must not be able to hang: a host that drops packets
// holds an unbounded connect open for minutes. These bound both halves of a
// catalogue round trip, for every database.
export const CONNECT_TIMEOUT_MS = 10_000;
export const QUERY_TIMEOUT_MS = 15_000;

// Socket-level failures mean the same thing whatever the driver.
export const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ESOCKET",
  "ETIMEOUT",
]);

// What a string no dialect owns is refused with. It lives here rather than in
// `detect.ts` so that an adapter can use it without importing the module that
// imports the adapters.
export const UNSUPPORTED_CONNECTION =
  "Connection string must start with postgres://, postgresql://, mysql://, mariadb://, sqlserver:// or mssql://, or be a SQL Server connection string (Server=…;Database=…;User Id=…;Password=…)";
