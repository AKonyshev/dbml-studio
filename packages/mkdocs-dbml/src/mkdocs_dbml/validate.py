"""Running the vendored model validator.

The rules live in packages/web/src/validate/, beside the frame that applies
them, and ship as one Node program. Python only writes the job and reads the
answer: a second implementation of the rules is the thing that would let a build
pass a page the frame then refuses to draw.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ValidationBlock:
    id: str
    model: str
    text: str
    tables: tuple[str, ...] | None


@dataclass(frozen=True)
class Finding:
    id: str
    model: str
    problem: str


class ValidatorFailed(Exception):
    """The validator could not run — not the same as the models being fine."""


def find_node() -> str | None:
    return shutil.which("node")


def run_validator(
    node: str,
    script: Path,
    blocks: Sequence[ValidationBlock],
    timeout: float = 120.0,
) -> list[Finding]:
    job = {
        "blocks": [
            {
                "id": block.id,
                "model": block.model,
                "text": block.text,
                "tables": list(block.tables) if block.tables is not None else None,
            }
            for block in blocks
        ]
    }

    try:
        completed = subprocess.run(
            [node, str(script)],
            input=json.dumps(job),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as error:
        raise ValidatorFailed(f"could not start `{node}`: {error}") from error
    except subprocess.TimeoutExpired as error:
        raise ValidatorFailed(f"did not finish within {timeout:.0f} seconds") from error

    if completed.returncode != 0:
        said = completed.stderr.strip() or f"exit code {completed.returncode}"
        raise ValidatorFailed(said)

    try:
        answer = json.loads(completed.stdout)
        return [
            Finding(id=item["id"], model=item["model"], problem=item["problem"])
            for item in answer["findings"]
        ]
    except (ValueError, KeyError, TypeError) as error:
        raise ValidatorFailed(
            f"answered with something that is not a report: {error}"
        ) from error
