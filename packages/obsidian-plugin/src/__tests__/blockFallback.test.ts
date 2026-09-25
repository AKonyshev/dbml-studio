import { renderBlockCode, renderBlockError } from "../blockFallback";

const container = (): HTMLElement => {
  const element = document.createElement("div");

  document.body.append(element);

  return element;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("renderBlockError", () => {
  it("puts the message in the note", () => {
    const element = container();

    renderBlockError(element, "Неизвестный ключ: tabels");

    expect(element.querySelector(".dbml-diagram-error")?.textContent).toBe(
      "Неизвестный ключ: tabels",
    );
  });

  // Obsidian re-runs a block's processor on edits; whatever the container held
  // from the last run must not stack up beside the new message.
  it("replaces whatever the container held", () => {
    const element = container();

    renderBlockError(element, "первая");
    renderBlockError(element, "вторая");

    expect(element.querySelectorAll(".dbml-diagram-error")).toHaveLength(1);
    expect(element.textContent).toBe("вторая");
  });
});

describe("renderBlockCode", () => {
  it("shows the block as DBML code, verbatim", () => {
    const element = container();
    const source = "Table users {\n  id int [pk]\n}";

    renderBlockCode(element, source);

    const code = element.querySelector("pre > code");

    expect(code?.textContent).toBe(source);
    expect(code?.classList.contains("language-dbml")).toBe(true);
  });

  // A note about the language may well show `<` and `>`; they are text.
  it("never reads the block as markup", () => {
    const element = container();

    renderBlockCode(element, "Note: '<b>bold</b>'");

    expect(element.querySelector("b")).toBeNull();
  });
});
