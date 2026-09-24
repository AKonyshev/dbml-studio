import { parseBlockParams } from "../blockParams";

describe("parseBlockParams", () => {
  it("reads a model, a table list and a height", () => {
    expect(
      parseBlockParams(
        [
          "model: /../antora/models/to-be/dbml/rd.dbml",
          "tables: reference_dictionary.agent_group, reference_dictionary.agent",
          "height: 600",
        ].join("\n"),
      ),
    ).toEqual({
      ok: true,
      params: {
        model: "/../antora/models/to-be/dbml/rd.dbml",
        tables: [
          "reference_dictionary.agent_group",
          "reference_dictionary.agent",
        ],
        height: 600,
        theme: null,
      },
    });
  });

  it("defaults everything but the model", () => {
    expect(parseBlockParams("model: rd.dbml")).toEqual({
      ok: true,
      params: { model: "rd.dbml", tables: null, height: 500, theme: null },
    });
  });

  it("reads a theme", () => {
    expect(parseBlockParams("model: rd.dbml\ntheme: dark")).toEqual({
      ok: true,
      params: { model: "rd.dbml", tables: null, height: 500, theme: "dark" },
    });
  });

  // The MkDocs plugin reads the block as YAML, where `#` starts a comment; one
  // block has to mean the same in a note and on a page.
  it("skips blank lines and comments, before the first key too", () => {
    const source = [
      "",
      "# the agents",
      "model: rd.dbml  ",
      "",
      "# only two",
      "tables: a, b",
      "",
    ].join("\n");

    expect(parseBlockParams(source)).toEqual({
      ok: true,
      params: {
        model: "rd.dbml",
        tables: ["a", "b"],
        height: 500,
        theme: null,
      },
    });
  });

  // An empty list means the author filtered nothing, not that they filtered
  // everything away — the same rule the frame's own `parseTables` follows.
  it("treats an empty table list as no filter at all", () => {
    expect(parseBlockParams("model: rd.dbml\ntables:  , ,")).toEqual({
      ok: true,
      params: { model: "rd.dbml", tables: null, height: 500, theme: null },
    });
  });

  it("reads a table list written as a YAML list", () => {
    expect(
      parseBlockParams("model: rd.dbml\ntables: [agent, agent_group]"),
    ).toEqual({
      ok: true,
      params: {
        model: "rd.dbml",
        tables: ["agent", "agent_group"],
        height: 500,
        theme: null,
      },
    });
  });

  it("reads a note saved with Windows line endings", () => {
    expect(parseBlockParams("model: rd.dbml\r\nheight: 600\r\n")).toEqual({
      ok: true,
      params: { model: "rd.dbml", tables: null, height: 600, theme: null },
    });
  });

  // What ```dbml has always meant: a page or a note showing the language.
  it("leaves a block of DBML code alone", () => {
    expect(parseBlockParams("Table users {\n  id int [pk]\n}")).toBeNull();
  });

  // A multi-line note can hold a line that starts with `model:`; the block
  // still does not open with one of ours.
  it("leaves DBML alone when a note inside it has a model: line", () => {
    expect(
      parseBlockParams(
        [
          "Table users {",
          "  id int",
          "  Note: '''",
          "model: the domain model",
          "  '''",
          "}",
        ].join("\n"),
      ),
    ).toBeNull();
  });

  it("leaves a block with no model line alone", () => {
    expect(parseBlockParams("tables: agent\nheight: 600")).toBeNull();
  });

  it("reads keys in lower case only, as YAML does", () => {
    expect(parseBlockParams("Model: rd.dbml")).toBeNull();
    expect(parseBlockParams("model: rd.dbml\nHeight: 600")).toEqual({
      ok: false,
      error: { kind: "unknownKey", key: "Height" },
    });
  });

  it("refuses a model line with no path", () => {
    expect(parseBlockParams("model:\ntables: a")).toEqual({
      ok: false,
      error: { kind: "modelMissing" },
    });
  });

  // The whole point of failing here: a note is read by eye, and a typo that is
  // silently dropped sends its author looking for the fault in the model.
  it("refuses a key it does not know", () => {
    expect(parseBlockParams("model: rd.dbml\ntabels: agent")).toEqual({
      ok: false,
      error: { kind: "unknownKey", key: "tabels" },
    });
  });

  it("refuses the same key twice", () => {
    expect(parseBlockParams("model: a.dbml\nmodel: b.dbml")).toEqual({
      ok: false,
      error: { kind: "duplicateKey", key: "model" },
    });
  });

  it("refuses a line that is not a key and a value", () => {
    expect(parseBlockParams("model: rd.dbml\njust some prose")).toEqual({
      ok: false,
      error: { kind: "malformedLine", line: "just some prose" },
    });
  });

  it("refuses a height that is not a whole number above zero", () => {
    for (const value of ["tall", "0", "12.5", "-5"]) {
      expect(parseBlockParams(`model: rd.dbml\nheight: ${value}`)).toEqual({
        ok: false,
        error: { kind: "heightInvalid", value },
      });
    }
  });

  it("refuses a theme that is neither light nor dark", () => {
    expect(parseBlockParams("model: rd.dbml\ntheme: solarized")).toEqual({
      ok: false,
      error: { kind: "themeInvalid", value: "solarized" },
    });
  });
});
