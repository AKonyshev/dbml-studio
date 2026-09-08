import { buildSourceIndex, findTable } from "./sourceIndex";

const src = [
  "Table users as u {",
  "  id integer [pk]",
  "  email varchar",
  "}",
  "",
  "Table posts {",
  "  id integer [pk]",
  "  author integer",
  "}",
  "",
  "Ref: posts.author > users.id",
  "",
].join("\n");

describe("buildSourceIndex", () => {
  it("indexes tables by the name the diagram shows", () => {
    const index = buildSourceIndex(src);

    expect(index.tables.map((table) => table.fullName)).toEqual([
      "users",
      "posts",
    ]);
  });

  it("keeps the alias apart from the name", () => {
    const users = findTable(buildSourceIndex(src), "users");

    expect(users?.declaredName).toBe("users");
    expect(users?.alias).toBe("u");
    expect(
      src.slice(users?.nameRange.start ?? 0, users?.nameRange.end ?? 0),
    ).toBe("users");
  });

  it("lists a table's fields with usable ranges", () => {
    const users = findTable(buildSourceIndex(src), "users");
    const email = users?.fields[1];

    expect(users?.fields.map((field) => field.name)).toEqual(["id", "email"]);
    expect(src.slice(email?.range.start ?? 0, email?.range.end ?? 0)).toBe(
      "email varchar",
    );
  });

  it("points at the table's name inside a standalone ref", () => {
    const users = findTable(buildSourceIndex(src), "users");
    const range = users?.refNameRanges[0];

    expect(users?.refNameRanges).toHaveLength(1);
    expect(src.slice(range?.start ?? 0, range?.end ?? 0)).toBe("users");
  });

  it("leaves refs alone when they go through the alias", () => {
    const aliased = [
      "Table users as u {",
      "  id integer [pk]",
      "}",
      "",
      "Table posts {",
      "  author integer [ref: > u.id]",
      "}",
      "",
    ].join("\n");
    const users = findTable(buildSourceIndex(aliased), "users");

    expect(users?.refNameRanges).toEqual([]);
  });

  it("finds the table's entry in the metainfo block", () => {
    const withMeta = [
      "Table users {",
      "  id integer [pk]",
      "}",
      "",
      "/*MetaInfo",
      '[{"name":"users","x":10,"y":20}]',
      "MetaInfo*/",
      "",
    ].join("\n");
    const users = findTable(buildSourceIndex(withMeta), "users");
    const range = users?.metaInfoNameRanges[0];

    expect(users?.metaInfoNameRanges).toHaveLength(1);
    expect(withMeta.slice(range?.start ?? 0, range?.end ?? 0)).toBe("users");
  });
});

describe("when a name is also another table's alias", () => {
  const ambiguous = [
    "Table users {",
    "  id integer [pk]",
    "}",
    "",
    "Table accounts as users {",
    "  id integer [pk]",
    "}",
    "",
    "Table posts {",
    "  owner integer [ref: > users.id]",
    "}",
    "",
  ].join("\n");

  it("touches no ref at all rather than the wrong one", () => {
    const table = findTable(buildSourceIndex(ambiguous), "users");

    expect(table?.refNameRanges).toEqual([]);
  });
});
