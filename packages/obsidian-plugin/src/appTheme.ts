import { type FrameTheme } from "./blockParams";

/**
 * Which theme the application is wearing.
 *
 * Obsidian puts `theme-dark` or `theme-light` on the body and swaps them when
 * the user changes theme; there is no API that answers this question, and the
 * class is what every plugin reads.
 */
export const themeOf = (body: HTMLElement): FrameTheme =>
  body.classList.contains("theme-dark") ? "dark" : "light";

/** What following the application's theme needs of a diagram. */
export interface ThemedDiagram {
  /** The theme the block pinned, or `null` to follow the application. */
  pinnedTheme: FrameTheme | null;
  view: { setTheme: (theme: FrameTheme) => void };
}

/**
 * Tells every diagram that follows the application the theme `appBody`, the
 * main window's body, now wears.
 *
 * One reading for all windows, not each diagram's own body. Obsidian has one
 * theme for every window, but it fires `css-change` before it moves a popout
 * window's body to the new class. At that moment a popout's body still wears
 * the old theme, `setTheme` would see no change, and nothing would correct it
 * later. The main window's body already has the new class. A block that
 * renders later, in a popout that is already themed, reads its own body as
 * before.
 */
export const followAppTheme = (
  diagrams: Iterable<ThemedDiagram>,
  appBody: HTMLElement,
): void => {
  const theme = themeOf(appBody);

  for (const diagram of diagrams) {
    if (diagram.pinnedTheme === null) {
      diagram.view.setTheme(theme);
    }
  }
};
