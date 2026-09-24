"""The HTML a dbml block becomes.

The wrapper and its attributes are the host script's contract, stated in
packages/web/README.md ("The host script's HTML contract"). Change them there
first.
"""

from __future__ import annotations

from html import escape
from urllib.parse import urlencode

FRAME_PATH = "_dbml/embed.html"
WRAPPER_CLASS = "dbml-diagram"


def frame_html(
    *,
    frame_url: str,
    model_url: str,
    tables: tuple[str, ...] | None,
    height: int,
    theme: str,
    title: str,
    fixed_theme: bool,
    dark_scheme: str | None,
) -> str:
    query = [("model", model_url)]
    if tables:
        query.append(("tables", ",".join(tables)))
    query.append(("theme", theme))

    attributes = [f'class="{WRAPPER_CLASS}"']
    if fixed_theme:
        attributes.append("data-dbml-theme-fixed")
    if dark_scheme is not None:
        attributes.append(f'data-dbml-dark-scheme="{escape(dark_scheme)}"')

    src = f"{frame_url}?{urlencode(query)}"
    return (
        f"<div {' '.join(attributes)}>"
        f'<iframe src="{escape(src)}" width="100%" height="{height}" '
        f'loading="lazy" frameborder="0" title="{escape(title)}"></iframe>'
        "</div>"
    )


def error_html(message: str) -> str:
    # Material styles `admonition failure`; every other theme shows two plain
    # paragraphs, which is still a message and still in the right place.
    return (
        '<div class="admonition failure dbml-diagram-error">'
        '<p class="admonition-title">DBML diagram</p>'
        f"<p>{escape(message)}</p>"
        "</div>"
    )
