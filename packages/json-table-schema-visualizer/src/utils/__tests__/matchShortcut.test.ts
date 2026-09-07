import { matchShortcut } from "../matchShortcut";

import { SHORTCUTS } from "@/constants/shortcuts";

const event = (
  key: string,
  overrides: Partial<Parameters<typeof matchShortcut>[0]> = {},
): Parameters<typeof matchShortcut>[0] => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  target: null,
  ...overrides,
});

describe("matchShortcut", () => {
  test("maps a letter to its action id", () => {
    expect(matchShortcut(event("c"))).toBe("colorRelations");
    expect(matchShortcut(event("a"))).toBe("animateRelations");
  });

  test("is case-insensitive", () => {
    expect(matchShortcut(event("C"))).toBe("colorRelations");
  });

  test("matches the legend on '?'", () => {
    expect(matchShortcut(event("?"))).toBe("legend");
  });

  test("matches the relation toggle on a bare 'h'", () => {
    expect(matchShortcut(event("h"))).toBe("toggleRefs");
  });

  test("ignores keys while typing in an input", () => {
    expect(
      matchShortcut(event("c", { target: { tagName: "INPUT" } })),
    ).toBeNull();
    expect(
      matchShortcut(event("c", { target: { tagName: "TEXTAREA" } })),
    ).toBeNull();
    expect(
      matchShortcut(event("c", { target: { isContentEditable: true } })),
    ).toBeNull();
  });

  test("does not hijack a chord built on a bound letter", () => {
    expect(matchShortcut(event("f", { ctrlKey: true }))).toBeNull();
    expect(matchShortcut(event("f", { metaKey: true }))).toBeNull();
    expect(matchShortcut(event("h", { altKey: true }))).toBeNull();
  });

  test("returns null for an unbound key", () => {
    expect(matchShortcut(event("q"))).toBeNull();
  });

  test("does not match legend-only entries by their display text", () => {
    // "Esc" is closeLegend's display text (executable: false), not an
    // event.key value — the registry lookup must skip non-executable
    // entries even when the display text happens to equal event.key.
    expect(matchShortcut(event("Esc"))).toBeNull();
    expect(matchShortcut(event("esc"))).toBeNull();
  });
});

describe("SHORTCUTS registry", () => {
  test("executable keys are unique", () => {
    const keys = SHORTCUTS.filter((s) => s.executable).map((s) =>
      s.key.toLowerCase(),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("every entry has a label key", () => {
    SHORTCUTS.forEach((entry) => {
      expect(entry.labelKey.length).toBeGreaterThan(0);
    });
  });
  test("t and u reach the per-table detail actions", () => {
    expect(
      matchShortcut({
        key: "t",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        target: null,
      }),
    ).toBe("tableDetailLevel");

    expect(
      matchShortcut({
        key: "u",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        target: null,
      }),
    ).toBe("resetTableDetailLevels");
  });
});
