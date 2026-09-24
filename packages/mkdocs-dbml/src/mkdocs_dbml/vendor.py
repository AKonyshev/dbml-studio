"""Where the plugin finds what `scripts/vendor.mjs` copied into it."""

from __future__ import annotations

from pathlib import Path

SITE_PREFIX = "_dbml/"
HOST_FILES = ("frame-host.js", "frame-host.css")
VALIDATOR = "validate.mjs"


class VendorMissing(Exception):
    pass


def vendor_dir() -> Path:
    return Path(__file__).resolve().parent / "_vendor"


def frame_files(root: Path) -> list[tuple[str, Path]]:
    frame = root / "frame"
    if not (frame / "embed.html").is_file():
        raise VendorMissing(
            f"the diagram frame is not in {root}. An installed wheel always carries "
            "it; in a checkout, run `yarn build:web && yarn workspace mkdocs-dbml vendor`."
        )
    files = [
        (SITE_PREFIX + path.relative_to(frame).as_posix(), path)
        for path in sorted(frame.rglob("*"))
        if path.is_file()
    ]
    for name in HOST_FILES:
        path = root / name
        if not path.is_file():
            raise VendorMissing(
                f"{path} is missing; run `yarn workspace mkdocs-dbml vendor`."
            )
        files.append((SITE_PREFIX + name, path))
    return files


def validator_script(root: Path) -> Path | None:
    path = root / VALIDATOR
    return path if path.is_file() else None


def build_id(root: Path) -> str | None:
    path = root / "BUILD"
    return path.read_text(encoding="utf-8").strip() or None if path.is_file() else None
