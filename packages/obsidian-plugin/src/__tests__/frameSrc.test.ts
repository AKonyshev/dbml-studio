import { withTheme } from "../frameSrc";

describe("withTheme", () => {
  it("makes the theme the query when there is none", () => {
    expect(withTheme("app://local/frame/embed.html", "dark")).toBe(
      "app://local/frame/embed.html?theme=dark",
    );
  });

  // `getResourcePath` hands out URLs with a cache-busting query of their own.
  it("appends the theme to a query that is already there", () => {
    expect(
      withTheme("app://local/frame/embed.html?1727000000000", "light"),
    ).toBe("app://local/frame/embed.html?1727000000000&theme=light");
  });
});
