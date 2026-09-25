import { followAppTheme, themeOf, type ThemedDiagram } from "../appTheme";

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

// Obsidian fires `css-change` before it moves a popout window's body to the
// new theme; only the main window's body is already right at that moment.
describe("followAppTheme", () => {
  const diagramIn = (
    doc: Document,
    pinnedTheme: ThemedDiagram["pinnedTheme"] = null,
  ): {
    pinnedTheme: ThemedDiagram["pinnedTheme"];
    view: { wrapper: HTMLElement; setTheme: jest.Mock };
  } => {
    const wrapper = doc.createElement("div");

    doc.body.append(wrapper);

    return { pinnedTheme, view: { wrapper, setTheme: jest.fn() } };
  };

  const popoutStill = (theme: string): Document => {
    const popout = document.implementation.createHTMLDocument("popout");

    popout.body.className = `theme-${theme}`;

    return popout;
  };

  it("gives a diagram in a popout the main window's theme, not its own body's", () => {
    const main = document.createElement("body");

    main.className = "theme-dark";

    const popout = diagramIn(popoutStill("light"));

    followAppTheme([popout], main);

    expect(popout.view.setTheme).toHaveBeenCalledWith("dark");
  });

  it("gives every unpinned diagram the theme, and leaves a pinned one alone", () => {
    const main = document.createElement("body");

    main.className = "theme-light";

    const here = diagramIn(document);
    const there = diagramIn(popoutStill("dark"));
    const pinned = diagramIn(document, "dark");

    followAppTheme([here, there, pinned], main);

    expect(here.view.setTheme).toHaveBeenCalledWith("light");
    expect(there.view.setTheme).toHaveBeenCalledWith("light");
    expect(pinned.view.setTheme).not.toHaveBeenCalled();
  });
});
