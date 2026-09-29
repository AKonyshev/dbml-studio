"""Which theme a diagram opens in, and which of Material's palettes is dark.

The page's own switch is followed by the host script once the page is up; this
only decides the first paint, so a frame does not open light on a dark page and
correct itself a moment later more often than it has to.
"""

from __future__ import annotations

DEFAULT_DARK_SCHEME = "slate"


def _entries(palette: object) -> list[dict]:
    if isinstance(palette, dict):
        return [palette]
    if isinstance(palette, list):
        return [entry for entry in palette if isinstance(entry, dict)]
    return []


def dark_scheme_of(palette: object) -> str | None:
    """The one scheme in Material's palette that is not `default`, if there is one.

    Material calls its dark scheme `slate`, but a site may name its own; two
    candidates are not guessed between, and the host script then assumes `slate`.
    """
    schemes = {
        entry.get("scheme") for entry in _entries(palette) if entry.get("scheme")
    }
    candidates = sorted(scheme for scheme in schemes if scheme != "default")
    return candidates[0] if len(candidates) == 1 else None


def follows_the_system(palette: object) -> bool:
    """Whether the page picks its palette by the reader's system.

    Material's automatic toggle and the older light/dark pair both mark their
    entries with a `media` query on `prefers-color-scheme`. One such entry is
    enough: the page's first colour is then the system's, which the build cannot
    know and the frame can.
    """
    return any(
        isinstance(entry.get("media"), str) and "prefers-color-scheme" in entry["media"]
        for entry in _entries(palette)
    )


def initial_theme(
    block_theme: str | None, config_theme: str | None, palette: object
) -> str:
    """`light`, `dark`, or `auto` — the frame's own `prefers-color-scheme`.

    `auto` only ever comes from the palette: a block or the plugin config that
    names a theme has fixed it, and the page's own palette does not move it.
    """
    if block_theme is not None:
        return block_theme
    if config_theme is not None:
        return config_theme
    if follows_the_system(palette):
        return "auto"
    first = next(
        (entry["scheme"] for entry in _entries(palette) if entry.get("scheme")), None
    )
    dark = dark_scheme_of(palette) or DEFAULT_DARK_SCHEME
    return "dark" if first == dark else "light"
