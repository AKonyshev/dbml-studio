import { validateConnectionInput } from "../connectionInput";

describe("validateConnectionInput", () => {
  it.each([
    "postgres://u:p@h:5432/db",
    "mysql://u:p@h:3306/db",
    "mariadb://u:p@h/db",
    "sqlserver://u:p@h:1433/db",
    "Server=h;Database=db;User Id=u;Password=p",
  ])("accepts %s", (value) => {
    expect(validateConnectionInput(value)).toBeUndefined();
  });

  it("explains what it accepts, without repeating the input", () => {
    const message = validateConnectionInput("snowflake://u:Secr3t@a/db");
    expect(message).toMatch(/postgres:\/\/.*mysql:\/\/.*sqlserver:\/\//);
    expect(message).not.toContain("Secr3t");
  });

  it("says nothing while the box is empty", () => {
    expect(validateConnectionInput("")).toBeUndefined();
  });
});
