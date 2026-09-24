import json
import subprocess
from pathlib import Path

import pytest

from mkdocs_dbml import vendor

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "vendor.mjs"


def put(root: Path, relative: str, text: str = "x") -> None:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    """A built site in miniature: the frame's graph, and the editor beside it."""
    root = tmp_path / "dist"
    manifest = {
        "embed.html": {
            "file": "assets/embed-A.js",
            "isEntry": True,
            "imports": ["_index-B.js"],
        },
        "_index-B.js": {
            "file": "assets/index-B.js",
            # The stylesheet hangs off the imported chunk, not the entry — the
            # shape that once shipped an unstyled frame.
            "css": ["assets/index-B.css"],
            "dynamicImports": ["_lazy-C.js"],
        },
        "_lazy-C.js": {"file": "assets/lazy-C.js", "assets": ["assets/font-D.woff2"]},
        "index.html": {
            "file": "assets/main-E.js",
            "isEntry": True,
            "imports": ["_index-B.js"],
            "css": ["assets/main-E.css"],
        },
    }
    put(root, ".vite/manifest.json", json.dumps(manifest))
    for relative in (
        "embed.html",
        "index.html",
        "assets/embed-A.js",
        "assets/index-B.js",
        "assets/index-B.css",
        "assets/lazy-C.js",
        "assets/font-D.woff2",
        "assets/main-E.js",
        "assets/main-E.css",
        "frame-host.js",
        "frame-host.css",
        "validate.mjs",
    ):
        put(root, relative)
    return root


def run(dist: Path, out: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["node", str(SCRIPT), "--dist", str(dist), "--out", str(out)],
        capture_output=True,
        text=True,
        check=False,
    )


def listing(root: Path) -> set[str]:
    return {
        path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file()
    }


def test_takes_the_frames_graph_and_nothing_of_the_editors(dist, tmp_path):
    out = tmp_path / "out"
    assert run(dist, out).returncode == 0
    assert listing(out) == {
        "frame/embed.html",
        "frame/assets/embed-A.js",
        "frame/assets/index-B.js",
        "frame/assets/index-B.css",
        "frame/assets/lazy-C.js",
        "frame/assets/font-D.woff2",
        "frame-host.js",
        "frame-host.css",
        "validate.mjs",
        "BUILD",
    }


def test_a_file_the_manifest_names_but_dist_lacks_fails_by_name(dist, tmp_path):
    (dist / "assets/index-B.css").unlink()
    result = run(dist, tmp_path / "out")
    assert result.returncode != 0
    assert "assets/index-B.css" in result.stderr


def test_no_manifest_says_to_build_the_site_first(dist, tmp_path):
    (dist / ".vite/manifest.json").unlink()
    result = run(dist, tmp_path / "out")
    assert result.returncode != 0
    assert "yarn build:web" in result.stderr


def test_a_second_run_leaves_nothing_of_the_first(dist, tmp_path):
    out = tmp_path / "out"
    run(dist, out)
    put(out, "frame/assets/renamed-long-ago.js")
    assert run(dist, out).returncode == 0
    assert "frame/assets/renamed-long-ago.js" not in listing(out)


def test_the_plugin_finds_the_frame_and_the_host_script_under_one_folder(
    dist, tmp_path
):
    out = tmp_path / "out"
    run(dist, out)
    files = dict(vendor.frame_files(out))
    assert files["_dbml/embed.html"] == out / "frame/embed.html"
    assert files["_dbml/assets/index-B.css"] == out / "frame/assets/index-B.css"
    assert files["_dbml/frame-host.js"] == out / "frame-host.js"
    # The validator runs at build time; it is not something the site serves.
    assert "_dbml/validate.mjs" not in files


def test_the_plugin_knows_which_build_it_carries(dist, tmp_path):
    out = tmp_path / "out"
    run(dist, out)
    assert vendor.build_id(out)
    assert vendor.validator_script(out) == out / "validate.mjs"


def test_a_missing_frame_is_said_plainly(tmp_path):
    with pytest.raises(vendor.VendorMissing, match="yarn workspace mkdocs-dbml vendor"):
        vendor.frame_files(tmp_path / "nothing-here")
