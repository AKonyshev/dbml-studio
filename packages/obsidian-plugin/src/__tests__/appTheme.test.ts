import { themeOf } from "../appTheme";

describe("themeOf", () => {
  it("reads the class Obsidian puts on the body", () => {
    const body = document.createElement("body");

    body.className = "theme-dark";
    expect(themeOf(body)).toBe("dark");

    body.className = "theme-light";
    expect(themeOf(body)).toBe("light");
  });

  it("calls anything else light", () => {
    expect(themeOf(document.createElement("body"))).toBe("light");
  });
});
