import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { ConfigError, readConfig } from "../config";

let dir = "";

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "antora-dbml-config-"));
  mkdirSync(path.join(dir, "models"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("readConfig", () => {
  it("resolves models from the playbook's folder and fills the defaults", () => {
    expect(readConfig({ models: "./models" }, dir)).toEqual({
      modelsDir: path.join(dir, "models"),
      height: 500,
      theme: null,
      validate: "warn",
    });
  });

  it("takes height, theme and validate as given", () => {
    expect(
      readConfig(
        { models: "models", height: 700, theme: "dark", validate: "error" },
        dir,
      ),
    ).toMatchObject({ height: 700, theme: "dark", validate: "error" });
  });

  it("tolerates id and enabled, which older Antora passes through", () => {
    expect(
      readConfig({ models: "models", id: "dbml", enabled: true }, dir),
    ).toMatchObject({ height: 500 });
  });

  it("reads a height written as a string", () => {
    expect(readConfig({ models: "models", height: "640" }, dir).height).toBe(
      640,
    );
  });

  it("maps validate true and false", () => {
    expect(readConfig({ models: "models", validate: true }, dir).validate).toBe(
      "warn",
    );
    expect(
      readConfig({ models: "models", validate: false }, dir).validate,
    ).toBe("off");
  });

  it("refuses an entry without models, and says what to add", () => {
    expect(() => readConfig({}, dir)).toThrow(ConfigError);
    expect(() => readConfig({}, dir)).toThrow(/models/);
  });

  it("refuses a models folder that does not exist", () => {
    expect(() => readConfig({ models: "nope" }, dir)).toThrow(/nope/);
  });

  it.each([[0], [-5], ["abc"], [1.5]])("refuses height %p", (height) => {
    expect(() => readConfig({ models: "models", height }, dir)).toThrow(
      /height/,
    );
  });

  it("refuses an unknown theme", () => {
    expect(() => readConfig({ models: "models", theme: "blue" }, dir)).toThrow(
      /theme/,
    );
  });

  it("refuses an unknown validate", () => {
    expect(() =>
      readConfig({ models: "models", validate: "loud" }, dir),
    ).toThrow(/validate/);
  });

  // A typo in a key would otherwise be a setting silently not applied.
  it("refuses a key it does not know, by name", () => {
    expect(() => readConfig({ models: "models", hieght: 600 }, dir)).toThrow(
      /hieght/,
    );
  });
});
