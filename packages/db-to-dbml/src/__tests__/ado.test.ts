import { formatAdo, parseAdo } from "../dialects/ado";

describe("ADO connection strings", () => {
  it("reads keys case-insensitively and trims", () => {
    const map = parseAdo(
      " Server = host,1433 ; DATABASE=library;User Id=u;Password=p; ",
    );
    expect(map.get("server")).toBe("host,1433");
    expect(map.get("database")).toBe("library");
    expect(map.get("user id")).toBe("u");
  });

  it("reads braced and quoted values with ; = and } inside", () => {
    const map = parseAdo('Server=h;Password={a;b=c}}d};Application Name="x;y"');
    expect(map.get("password")).toBe("a;b=c}d");
    expect(map.get("application name")).toBe("x;y");
  });

  it("unescapes a doubled quote inside a quoted value", () => {
    expect(parseAdo("Password='it''s';Server=h").get("password")).toBe("it's");
    expect(parseAdo('Password="say ""hi""";Server=h').get("password")).toBe(
      'say "hi"',
    );
  });

  it("writes back what it read", () => {
    const original = "Server=h;Database=library;User Id=u;Password={a;b=c}}d}";
    expect(parseAdo(formatAdo(parseAdo(original)))).toEqual(parseAdo(original));
  });

  it("quotes values with spaces at the ends, braces and equals signs", () => {
    const map = new Map([
      ["server", "h"],
      ["password", " lead"],
      ["user id", "a=b"],
      ["application name", "{x}"],
    ]);
    const text = formatAdo(map);
    expect(text).toContain("password={ lead}");
    expect(parseAdo(text)).toEqual(map);
  });

  it("reads an unterminated brace to the end instead of throwing", () => {
    expect(parseAdo("Server=h;Password={abc").get("password")).toBe("abc");
  });
});
