import { connectionsFromEnv, resolveConnection } from "../connections";
import { ToolError } from "../errors";

const URL_LOCAL = "postgresql://reader:s3cret@localhost:5432/library";

describe("connectionsFromEnv", () => {
  it("names a connection by its lower-cased suffix", () => {
    const source = connectionsFromEnv({
      DBML_CONNECTION_LOCAL: URL_LOCAL,
      DBML_CONNECTION_LIBRARY_PROD: "postgres://x@prod/library",
      PATH: "/usr/bin",
    });
    expect(source.names()).toEqual(["library_prod", "local"]);
    expect(source.get("local")).toBe(URL_LOCAL);
  });

  it("ignores empty values", () => {
    expect(connectionsFromEnv({ DBML_CONNECTION_X: "" }).names()).toEqual([]);
  });

  it("refuses two variables that make the same name, naming both", () => {
    expect(() =>
      connectionsFromEnv({
        DBML_CONNECTION_LOCAL: URL_LOCAL,
        DBML_CONNECTION_local: URL_LOCAL,
      }),
    ).toThrow(
      /DBML_CONNECTION_LOCAL.*DBML_CONNECTION_local|DBML_CONNECTION_local.*DBML_CONNECTION_LOCAL/,
    );
  });
});

describe("resolveConnection", () => {
  const source = connectionsFromEnv({ DBML_CONNECTION_STAGING: URL_LOCAL });

  it("resolves a known name", () => {
    expect(resolveConnection(source, "staging")).toBe(URL_LOCAL);
  });

  it("matches a name regardless of case", () => {
    expect(resolveConnection(source, "Staging")).toBe(URL_LOCAL);
  });

  it("accepts a raw postgres URL", () => {
    expect(resolveConnection(source, "postgres://u@h/db")).toBe(
      "postgres://u@h/db",
    );
  });

  it("switches the database when one is given", () => {
    expect(resolveConnection(source, "staging", "archive")).toBe(
      "postgresql://reader:s3cret@localhost:5432/archive",
    );
  });

  it("says which names exist when the value is neither", () => {
    expect.assertions(3);
    try {
      resolveConnection(source, "prod");
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      expect((error as ToolError).code).toBe("CONNECTION_NOT_FOUND");
      expect((error as ToolError).message).toContain("staging");
    }
  });

  it("explains how to configure one when there are none", () => {
    expect(() => resolveConnection(connectionsFromEnv({}), "prod")).toThrow(
      /DBML_CONNECTION_<NAME>/,
    );
  });

  it("never echoes the password of a raw URL it cannot use", () => {
    expect.assertions(1);
    try {
      resolveConnection(source, "postgres://u:p#ss@h/db", "other");
    } catch (error) {
      expect((error as Error).message).not.toContain("p#ss");
    }
  });
});
