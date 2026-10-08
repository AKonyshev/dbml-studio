import { envSuffix } from "../envName";

describe("envSuffix", () => {
  it("upper-cases and replaces everything that is not a letter or digit", () => {
    expect(envSuffix("staging")).toBe("STAGING");
    expect(envSuffix("Library prod")).toBe("LIBRARY_PROD");
    expect(envSuffix("lib-db.2")).toBe("LIB_DB_2");
  });
});
