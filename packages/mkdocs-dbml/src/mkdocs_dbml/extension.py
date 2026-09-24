"""The Markdown side: finds ```dbml blocks before the code fences do.

What a block becomes is not decided here. `render` is handed the body and
returns HTML, or None for a block that is not a diagram; this module only knows
where blocks begin and end.
"""

from __future__ import annotations

import re
from collections.abc import Callable

from markdown import Extension, Markdown
from markdown.preprocessors import Preprocessor

# Between `normalize_whitespace` (30) and `fenced_code_block` (25) — the name
# both Python-Markdown's `fenced_code` and `pymdownx.superfences` register
# under. Checked against Markdown 3.10 with each of them.
PRIORITY = 27

_OPEN = re.compile(r"^(?P<fence>`{3,})[ \t]*dbml[ \t]*$")

Render = Callable[[str], "str | None"]


def _closes(line: str, fence: str) -> bool:
    stripped = line.strip()
    return len(stripped) >= len(fence) and set(stripped) == {"`"}


class DbmlPreprocessor(Preprocessor):
    def __init__(self, md: Markdown, render: Render) -> None:
        super().__init__(md)
        self._render = render

    def run(self, lines: list[str]) -> list[str]:
        out: list[str] = []
        index = 0
        while index < len(lines):
            opening = _OPEN.match(lines[index])
            if opening is None:
                out.append(lines[index])
                index += 1
                continue

            end = index + 1
            while end < len(lines) and not _closes(lines[end], opening["fence"]):
                end += 1
            if end == len(lines):
                # Unclosed. Not ours to repair: the code fence extension decides
                # what an unclosed fence means.
                out.extend(lines[index:])
                break

            html = self._render("\n".join(lines[index + 1 : end]))
            if html is None:
                out.extend(lines[index : end + 1])
            else:
                # A blank line either side, so the placeholder is a paragraph of
                # its own and Markdown puts the stored HTML back in its place.
                out.extend(["", self.md.htmlStash.store(html), ""])
            index = end + 1
        return out


class DbmlExtension(Extension):
    def __init__(self, render: Render) -> None:
        super().__init__()
        self._render = render

    def extendMarkdown(self, md: Markdown) -> None:
        md.preprocessors.register(DbmlPreprocessor(md, self._render), "dbml", PRIORITY)
