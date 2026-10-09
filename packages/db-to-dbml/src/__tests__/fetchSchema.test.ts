import { fetchSchema } from "../fetchSchema";
import { DbImportErrorCode } from "../errors";

const fetchSchemaJson = jest.fn();
jest.mock("@dbml/connector/dist/connectors/postgresConnector", () => ({
  fetchSchemaJson: (conn: string) => fetchSchemaJson(conn),
}));

describe("fetchSchema", () => {
  beforeEach(() => fetchSchemaJson.mockReset());

  test("rejects an unsupported connection string before connecting", async () => {
    await expect(fetchSchema("snowflake://x")).rejects.toMatchObject({
      code: DbImportErrorCode.INVALID_CONNECTION_STRING,
    });
    expect(fetchSchemaJson).not.toHaveBeenCalled();
  });

  test("calls the postgres connector with the connection string", async () => {
    fetchSchemaJson.mockResolvedValue({ tables: [] });
    const result = await fetchSchema("postgres://u:p@h:5432/db");
    expect(fetchSchemaJson).toHaveBeenCalledWith("postgres://u:p@h:5432/db");
    expect(result).toEqual({ tables: [] });
  });

  test("trims whitespace before validating and connecting", async () => {
    fetchSchemaJson.mockResolvedValue({ tables: [] });
    await fetchSchema("  postgres://u:p@h:5432/db  ");
    expect(fetchSchemaJson).toHaveBeenCalledWith("postgres://u:p@h:5432/db");
  });

  test("maps driver errors to DbImportError", async () => {
    fetchSchemaJson.mockRejectedValue({ code: "28P01" });
    await expect(fetchSchema("postgresql://u:p@h/db")).rejects.toMatchObject({
      code: DbImportErrorCode.AUTH_FAILED,
    });
  });
});
