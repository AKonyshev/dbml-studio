import importlib.metadata
import re
from pathlib import Path

PYPROJECT = Path(__file__).resolve().parent.parent / "pyproject.toml"


def test_the_package_is_installed_under_its_published_name():
    # Read, not written down here: a release changes the version in
    # pyproject.toml, and a literal in this test would fail every one of them.
    # A regex rather than tomllib, which Python 3.10 does not have.
    declared = re.search(
        r'^version = "([^"]+)"$', PYPROJECT.read_text(encoding="utf-8"), re.MULTILINE
    )
    assert declared is not None
    # An installed copy older than pyproject.toml fails here too: an editable
    # install keeps the version it was installed with until
    # `yarn workspace mkdocs-dbml setup` runs again.
    assert importlib.metadata.version("mkdocs-dbml") == declared.group(1)
