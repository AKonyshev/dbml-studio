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
