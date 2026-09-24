"""Where a block's model is, and where it will be in the built site.

A leading `/` starts at the docs root; anything else starts at the page's own
folder. `..` is allowed — models often sit beside the documentation rather than
inside it — but nothing may leave the folder `mkdocs.yml` is in: a page's block
must not be able to read an arbitrary file on the build machine.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path, PurePosixPath

EXTERNAL_PREFIX = "_dbml/models/"


@dataclass(frozen=True)
class ResolvedModel:
    source: Path
    site_path: str
    external: bool


@dataclass(frozen=True)
class PathError:
    message: str


def resolve_model(
    model: str, page_src_uri: str, docs_dir: Path, project_dir: Path
) -> ResolvedModel | PathError:
    docs = docs_dir.resolve()
    project = project_dir.resolve()
    written = model.strip()

    base = (
        docs if written.startswith("/") else docs / PurePosixPath(page_src_uri).parent
    )
    # `resolve` follows symlinks, so a link inside the project that points out
    # of it is judged by where it actually leads.
    candidate = (base / written.lstrip("/")).resolve()

    if not candidate.is_relative_to(project):
        return PathError(
            f"`{written}` points outside the project, which a page may not reach"
        )

    shown = candidate.relative_to(project).as_posix()
    if not candidate.is_file():
        return PathError(f"no model at `{shown}` (from `{written}`)")

    if candidate.is_relative_to(docs):
        # MkDocs copies it into the site itself, at the same relative path.
        return ResolvedModel(
            candidate, candidate.relative_to(docs).as_posix(), external=False
        )
    return ResolvedModel(candidate, EXTERNAL_PREFIX + shown, external=True)


class ExternalModels:
    """The models outside docs_dir that one build has to copy into the site.

    `taken` is every path the site already has from docs_dir. A model is
    refused a path one of those holds, rather than silently overwriting it or
    being overwritten: two different files cannot both be at one URL.
    """

    def __init__(self, taken: set[str]) -> None:
        self._taken = taken
        self._by_site_path: dict[str, Path] = {}

    def add(self, model: ResolvedModel) -> PathError | None:
        if not model.external:
            return None
        if model.site_path in self._taken:
            return PathError(
                f"the site already has a file at `{model.site_path}`, so this model "
                "from outside docs_dir cannot be copied there"
            )
        self._by_site_path[model.site_path] = model.source
        return None

    def items(self) -> list[tuple[str, Path]]:
        return sorted(self._by_site_path.items())
