// One fake client for the whole suite: the queries under test are one round
// trip each, and what matters is the SQL that goes out, the names that come
// back, and that the socket is closed on every path.
import { Client } from "pg";

import { DbImportError, DbImportErrorCode } from "../errors";
import { listDatabases } from "../listDatabases";
import { listSchemas } from "../listSchemas";

const connect = jest.fn();
const query = jest.fn();
const end = jest.fn();

jest.mock("pg", () => ({
  Client: jest.fn(() => ({ connect, query, end })),
}));

describe("catalog queries", () => {
  beforeEach(() => {
    jest.mocked(Client).mockClear();
    connect.mockReset().mockResolvedValue(undefined);
    query.mockReset();
    end.mockReset().mockResolvedValue(undefined);
  });

  test("listDatabases skips templates and databases that refuse connections", async () => {
    query.mockResolvedValue({
      rows: [{ name: "billing" }, { name: "orders" }],
    });

    expect(await listDatabases("postgres://u:p@h/entry")).toEqual([
      "billing",
      "orders",
    ]);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("pg_database");
    expect(sql).toContain("datallowconn");
    expect(sql).toContain("NOT datistemplate");
  });

  test("listSchemas skips the server's own schemas", async () => {
    query.mockResolvedValue({ rows: [{ name: "audit" }, { name: "public" }] });

    expect(await listSchemas("postgres://u:p@h/orders")).toEqual([
      "audit",
      "public",
    ]);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("pg_namespace");
    expect(sql).toContain("information_schema");
  });

  test("connects to the database named in the string, under a time limit", async () => {
    query.mockResolvedValue({ rows: [] });

    await listSchemas("postgres://u:p@h/orders");

    // The timeouts are the point: a tree expansion has nothing to cancel with,
    // so an unbounded connect to a host that drops packets would hang it.
    expect(Client).toHaveBeenCalledWith({
      connectionString: "postgres://u:p@h/orders",
      connectionTimeoutMillis: expect.any(Number),
      query_timeout: expect.any(Number),
      statement_timeout: expect.any(Number),
    });

    const config = jest.mocked(Client).mock.calls[0][0] as {
      connectionTimeoutMillis: number;
      query_timeout: number;
      statement_timeout: number;
    };
    expect(config.connectionTimeoutMillis).toBeGreaterThan(0);
    expect(config.query_timeout).toBeGreaterThan(0);
    expect(config.statement_timeout).toBeGreaterThan(0);
  });

  test("maps a driver failure to a DbImportError and still closes the client", async () => {
    connect.mockRejectedValue({ code: "42501" });

    await expect(listSchemas("postgres://u:p@h/billing")).rejects.toMatchObject(
      {
        code: DbImportErrorCode.ACCESS_DENIED,
      },
    );
    expect(end).toHaveBeenCalled();
  });

  test("rejects an unsupported string without opening a client", async () => {
    await expect(listDatabases("snowflake://u:p@h/db")).rejects.toBeInstanceOf(
      DbImportError,
    );
    expect(Client).not.toHaveBeenCalled();
  });
});
