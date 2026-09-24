import logging
import os
import textwrap
from pathlib import Path

import pytest
from mkdocs.commands.build import build
from mkdocs.config import load_config
from mkdocs.exceptions import Abort

from mkdocs_dbml import validate, vendor

MODEL = 'Table "acl"."analysis" {\n  id integer [pk]\n}\n'

# Speaks validate.mjs's protocol and objects to one thing: a table called `nope`.
FAKE_VALIDATOR = r"""
let raw = "";
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  const { blocks } = JSON.parse(raw);
  const findings = blocks
    .filter((block) => (block.tables ?? []).includes("nope"))
    .map((block) => ({ id: block.id, model: block.model, problem: "Table not found: nope" }));
  process.stdout.write(JSON.stringify({ findings }));
});
"""


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(text).lstrip("\n"), encoding="utf-8")


@pytest.fixture
def site(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    fake = tmp_path / "vendor"
    write(fake / "frame/embed.html", "<!doctype html><title>frame</title>\n")
    write(fake / "frame/assets/embed.js", "/* frame */\n")
    write(fake / "frame-host.js", "/* host */\n")
    write(fake / "frame-host.css", "/* host */\n")
    write(fake / "validate.mjs", FAKE_VALIDATOR)
    write(fake / "BUILD", "test-build\n")
    monkeypatch.setattr(vendor, "vendor_dir", lambda: fake)

    project = tmp_path / "project"
    write(
        project / "mkdocs.yml",
        """
        site_name: fixture
        plugins:
          - dbml
        markdown_extensions:
          - pymdownx.superfences
        """,
    )
    write(
        project / "docs/index.md",
        """
        # Home

        ```dbml
        model: /models/acl.dbml
        tables: analysis
        ```
        """,
    )
    write(project / "docs/models/acl.dbml", MODEL)
    write(
        project / "docs/guide/deep.md",
        """
        ```dbml
        model: /../models/ext.dbml
        ```

        ```dbml
        model: /../models/ext.dbml
        theme: dark
        ```

        ```dbml
        model: /models/acl.dbml
        tables: nope
        ```
        """,
    )
    write(project / "models/ext.dbml", MODEL)
    write(
        project / "docs/code.md",
        """
        ```dbml
        Table users {
          id integer [pk]
        }
        ```
        """,
    )
    write(
        project / "docs/broken.md",
        """
        ```dbml
        model: /models/acl.dbml
        tabels: analysis
        ```
        """,
    )
    return project


def build_site(project: Path, **overrides) -> Path:
    config = load_config(config_file=str(project / "mkdocs.yml"), **overrides)
    build(config)
    return Path(config.site_dir)


def warnings(caplog: pytest.LogCaptureFixture) -> list[str]:
    return [
        record.getMessage()
        for record in caplog.records
        if record.levelno == logging.WARNING
    ]


def test_the_frame_and_the_host_script_are_in_the_site(site):
    out = build_site(site)
    for relative in (
        "_dbml/embed.html",
        "_dbml/assets/embed.js",
        "_dbml/frame-host.js",
        "_dbml/frame-host.css",
    ):
        assert (out / relative).is_file(), relative
    assert not (out / "_dbml/validate.mjs").exists()


def test_a_root_page_points_at_the_frame_and_its_model(site):
    html = (build_site(site) / "index.html").read_text()
    assert '<div class="dbml-diagram">' in html
    assert (
        'src="_dbml/embed.html?model=..%2Fmodels%2Facl.dbml&amp;tables=analysis&amp;theme=light"'
        in html
    )
    assert '<script src="_dbml/frame-host.js"' in html


def test_a_nested_page_climbs_to_the_frame(site):
    html = (build_site(site) / "guide/deep/index.html").read_text()
    assert (
        'src="../../_dbml/embed.html?model=models%2Fmodels%2Fext.dbml&amp;theme=light"'
        in html
    )


def test_without_directory_urls_the_climb_is_one_shorter(site):
    html = (build_site(site, use_directory_urls=False) / "guide/deep.html").read_text()
    assert 'src="../_dbml/embed.html?' in html


def test_a_model_outside_docs_is_copied_into_the_site(site):
    out = build_site(site)
    assert (out / "_dbml/models/models/ext.dbml").read_text() == MODEL


def test_only_the_block_that_named_a_theme_is_marked_fixed(site):
    html = (build_site(site) / "guide/deep/index.html").read_text()
    assert html.count("data-dbml-theme-fixed") == 1
    assert "theme=dark" in html


def test_dbml_code_without_a_model_stays_code(site):
    html = (build_site(site) / "code/index.html").read_text()
    assert "dbml-diagram" not in html
    assert "Table users" in html
    assert "<code" in html


def test_a_broken_block_shows_its_error_and_warns(site, caplog):
    with caplog.at_level(logging.WARNING):
        out = build_site(site)
    assert "unknown key `tabels`" in (out / "broken/index.html").read_text()
    assert any(
        "broken.md, block 1" in message and "tabels" in message
        for message in warnings(caplog)
    )


def test_a_finding_is_a_warning_that_names_the_block(site, caplog):
    with caplog.at_level(logging.WARNING):
        build_site(site)
    assert any(
        "guide/deep.md, block 3" in message and "Table not found: nope" in message
        for message in warnings(caplog)
    )


def test_strict_turns_a_finding_into_a_failed_build(site):
    (site / "docs/broken.md").unlink()
    with pytest.raises(Abort):
        build_site(site, strict=True)


def test_a_clean_site_builds_strict(site):
    (site / "docs/broken.md").unlink()
    deep = site / "docs/guide/deep.md"
    deep.write_text(deep.read_text().replace("tables: nope\n", ""))
    build_site(site, strict=True)


def test_without_node_there_is_one_warning_and_the_pages_are_whole(
    site, caplog, monkeypatch
):
    (site / "docs/broken.md").unlink()
    monkeypatch.setattr(validate, "find_node", lambda: None)
    with caplog.at_level(logging.WARNING):
        out = build_site(site)
    said = warnings(caplog)
    assert len(said) == 1
    assert "not checked" in said[0]
    assert "dbml-diagram" in (out / "index.html").read_text()


def test_a_second_build_carries_nothing_of_the_first(site, caplog):
    (site / "docs/broken.md").unlink()
    config = load_config(config_file=str(site / "mkdocs.yml"))
    build(config)
    caplog.clear()
    with caplog.at_level(logging.WARNING):
        build(config)
    assert sum("Table not found: nope" in message for message in warnings(caplog)) == 1
    page = (Path(config.site_dir) / "index.html").read_text()
    assert page.count('src="_dbml/frame-host.js"') == 1
    assert page.count('href="_dbml/frame-host.css"') == 1


def test_a_docs_file_where_the_frame_goes_stops_the_build(site):
    write(site / "docs/_dbml/embed.html", "mine\n")
    with pytest.raises(Abort):
        build_site(site)


def test_plugin_config_turns_off_validation_and_fixes_every_frames_theme(site, caplog):
    write(
        site / "mkdocs.yml",
        """
        site_name: fixture
        plugins:
          - dbml:
              validate: false
              theme: dark
        markdown_extensions:
          - pymdownx.superfences
        """,
    )
    with caplog.at_level(logging.WARNING):
        out = build_site(site)
    assert not any("Table not found: nope" in message for message in warnings(caplog))
    for relative in ("index.html", "guide/deep/index.html"):
        html = (out / relative).read_text()
        diagrams = html.count('class="dbml-diagram"')
        assert diagrams > 0
        assert html.count("data-dbml-theme-fixed") == diagrams
        assert html.count("theme=dark") == diagrams


@pytest.mark.parametrize("height", ["0", "-100", "true", "12.5"])
def test_plugin_config_refuses_a_height_a_block_would_refuse(site, height, caplog):
    write(
        site / "mkdocs.yml",
        f"""
        site_name: fixture
        plugins:
          - dbml:
              height: {height}
        """,
    )
    with pytest.raises(Abort), caplog.at_level(logging.ERROR):
        load_config(config_file=str(site / "mkdocs.yml"))
    assert any("above zero" in record.getMessage() for record in caplog.records)


def test_a_failing_validator_is_one_warning_and_the_pages_are_whole(site, caplog):
    (site / "docs/broken.md").unlink()
    write(
        site.parent / "vendor/validate.mjs",
        """
        process.stderr.write("the fake validator always fails\\n");
        process.exitCode = 1;
        """,
    )
    with caplog.at_level(logging.WARNING):
        out = build_site(site)
    said = warnings(caplog)
    assert len(said) == 1
    assert "not checked" in said[0]
    assert "dbml-diagram" in (out / "index.html").read_text()


def test_an_unreadable_model_is_refused_without_the_build_machines_path(site, caplog):
    # An unreadable file under docs_dir also breaks MkDocs's own unrelated
    # static-asset copy step, so this uses an external model instead — one
    # only our own code ever opens.
    if os.geteuid() == 0:
        pytest.skip("running as root, which ignores file permissions")
    model = site / "models/ext.dbml"
    model.chmod(0o000)
    try:
        with caplog.at_level(logging.WARNING):
            out = build_site(site)
    finally:
        model.chmod(0o644)
    page = (out / "guide/deep/index.html").read_text()
    assert str(site) not in page
    assert "could not be read" in page
    assert any(
        "guide/deep.md, block 1" in message
        and "could not be read" in message
        and str(site) not in message
        for message in warnings(caplog)
    )
    assert not (out / "_dbml/models/models/ext.dbml").exists()


def test_a_model_in_an_excluded_docs_folder_is_copied_by_the_plugin(site):
    with open(site / "mkdocs.yml", "a", encoding="utf-8") as config:
        config.write("exclude_docs: |\n  /schemas/\n")
    write(site / "docs/schemas/acl.dbml", MODEL)
    write(site / "docs/excluded.md", "```dbml\nmodel: /schemas/acl.dbml\n```\n")
    out = build_site(site)
    assert not (out / "schemas/acl.dbml").exists()
    assert (out / "_dbml/models/docs/schemas/acl.dbml").read_text() == MODEL
    assert (
        'src="../_dbml/embed.html?model=models%2Fdocs%2Fschemas%2Facl.dbml&amp;'
        in (out / "excluded/index.html").read_text()
    )


def test_a_model_in_a_dot_folder_is_copied_by_the_plugin(site):
    write(site / "docs/.models/acl.dbml", MODEL)
    write(site / "docs/dotted.md", "```dbml\nmodel: /.models/acl.dbml\n```\n")
    out = build_site(site)
    assert not (out / ".models/acl.dbml").exists()
    assert (out / "_dbml/models/docs/.models/acl.dbml").read_text() == MODEL
    assert (
        'src="../_dbml/embed.html?model=models%2Fdocs%2F.models%2Facl.dbml&amp;'
        in (out / "dotted/index.html").read_text()
    )


# Material's blog plugin renders a post's excerpt in `on_page_context` — after
# every page's Markdown is done — with a Markdown of its own built from
# `config.markdown_extensions`, ours among them. This hook does the same.
EXCERPT_HOOK = """
import markdown

EXCERPT = "```dbml\\nmodel: /../models/excerpt.dbml\\ntables: nope\\n```\\n"


def on_page_context(context, page, config, nav):
    if page.file.src_uri == "index.md":
        md = markdown.Markdown(
            extensions=config.markdown_extensions,
            extension_configs=config.mdx_configs,
        )
        page.content += '<div id="excerpt">' + md.convert(EXCERPT) + "</div>"
    return context
"""


def test_a_block_rendered_after_its_page_is_done_stays_code(site, caplog):
    (site / "docs/broken.md").unlink()
    write(site / "hooks/excerpt.py", EXCERPT_HOOK)
    write(site / "models/excerpt.dbml", MODEL)
    with open(site / "mkdocs.yml", "a", encoding="utf-8") as config:
        config.write("hooks:\n  - hooks/excerpt.py\n")
    with caplog.at_level(logging.WARNING):
        out = build_site(site)
    html = (out / "index.html").read_text()
    excerpt = html[html.index('<div id="excerpt">') :]
    assert "dbml-diagram" not in excerpt
    assert "model: /../models/excerpt.dbml" in excerpt
    assert "<code" in excerpt
    # guide/deep.md's own finding, and nothing for the excerpt.
    assert [message for message in warnings(caplog) if "nope" in message] == [
        "mkdocs_dbml: guide/deep.md, block 3: /models/acl.dbml: Table not found: nope"
    ]
    assert not (out / "_dbml/models/models/excerpt.dbml").exists()
