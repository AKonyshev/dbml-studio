"""Reading the body of a ```dbml block.

Knows nothing about MkDocs or files: text in, a `Block`, a `BlockError`, or
`None` for a block that is not ours to read.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import yaml

KEYS = ("model", "tables", "height", "theme")
THEMES = ("light", "dark")

# A block is ours when a line starts with `model:` and the block opens with one
# of our keys (blank lines and `#` comments aside). DBML has no such top-level
# line, so a block of DBML code — which ```dbml has always meant on pages that
# document the language — goes on to the highlighter untouched, even when a
# multi-line note inside it has a line that starts with `model:`.
_OURS = re.compile(r"^model\s*:", re.MULTILINE)
_OPENS_OURS = re.compile(rf"^(?:{'|'.join(KEYS)})\s*:")


def _is_ours(body: str) -> bool:
    if _OURS.search(body) is None:
        return False
    for line in body.splitlines():
        stripped = line.strip()
        if stripped == "" or stripped.startswith("#"):
            continue
        return _OPENS_OURS.match(stripped) is not None
    return False


# Top-level keys as the author wrote them, to catch one given twice before
# YAML quietly keeps the last.
_KEY_LINE = re.compile(r"^([A-Za-z_][\w-]*)\s*:", re.MULTILINE)


HEIGHT_RULE = "must be a whole number of pixels, above zero"


def is_height(value: object) -> bool:
    # YAML reads `true` as a bool, and a bool is an int to Python.
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


@dataclass(frozen=True)
class Block:
    model: str
    tables: tuple[str, ...] | None
    height: int | None
    theme: str | None


@dataclass(frozen=True)
class BlockError:
    message: str


def parse_block(body: str) -> Block | BlockError | None:
    if not _is_ours(body):
        return None

    written = _KEY_LINE.findall(body)
    twice = sorted({key for key in written if written.count(key) > 1})
    if twice:
        return BlockError(f"`{twice[0]}` is given more than once")

    try:
        data = yaml.safe_load(body)
    except yaml.YAMLError as error:
        first = str(error).splitlines()[0]
        return BlockError(f"the block is not `key: value` lines: {first}")

    if not isinstance(data, dict):
        return BlockError("the block is not `key: value` lines")

    unknown = sorted(str(key) for key in data if key not in KEYS)
    if unknown:
        return BlockError(
            f"unknown key `{unknown[0]}`; a block takes `model`, `tables`, "
            "`height` and `theme`"
        )

    model = data.get("model")
    if not isinstance(model, str) or model.strip() == "":
        return BlockError("`model` must name a `.dbml` file")

    tables = _tables(data.get("tables"))
    if isinstance(tables, BlockError):
        return tables

    height = data.get("height")
    if height is not None and not is_height(height):
        return BlockError(f"`height` {HEIGHT_RULE}")

    theme = data.get("theme")
    if theme is not None and theme not in THEMES:
        return BlockError("`theme` must be `light` or `dark`")

    return Block(model=model.strip(), tables=tables, height=height, theme=theme)


def _tables(value: object) -> tuple[str, ...] | None | BlockError:
    if value is None:
        return None
    if isinstance(value, str):
        names = [name.strip() for name in value.split(",")]
    elif isinstance(value, list) and all(isinstance(name, str) for name in value):
        names = [name.strip() for name in value]
    else:
        return BlockError(
            "`tables` must be names separated by commas, or a list of names"
        )
    kept = tuple(name for name in names if name != "")
    return kept if kept else None
